import type { HandlerContext, HandlerResult } from "../types.js";
import { LedgerService } from "./ledger.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function stripeEnabled(): boolean {
  return !!STRIPE_SECRET_KEY;
}

async function stripeRequest(path: string, method: string, body?: Record<string, string>): Promise<any> {
  if (!STRIPE_SECRET_KEY) throw new Error("Stripe not configured");
  const url = `https://api.stripe.com/v1${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

export async function handleStripeOnboard(params: any, ctx: HandlerContext): Promise<HandlerResult<any>> {
  const { user_token } = params;
  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };

  const profile = ctx.db.prepare(
    `SELECT * FROM marketplace_profiles WHERE registration_id = ?`,
  ).get(user_token) as any;
  if (!profile) return { ok: false, error: { code: "USER_NOT_FOUND", message: "No marketplace profile found. Register with marketplace_register first." } };

  if (!stripeEnabled()) {
    return { ok: true, data: { message: "Stripe not configured. Set STRIPE_SECRET_KEY to enable payments.", stripe_onboarded: false } };
  }

  // If already onboarded
  if (profile.stripe_onboarded && profile.stripe_account_id) {
    return { ok: true, data: { stripe_account_id: profile.stripe_account_id, stripe_onboarded: true } };
  }

  // Create Stripe Connect Express account
  const account = await stripeRequest("/accounts", "POST", {
    type: "express",
    capabilities: JSON.stringify({ transfers: { requested: true } }),
  });

  if (account.error) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: account.error.message } };
  }

  // Save account ID
  ctx.db.prepare(
    `UPDATE marketplace_profiles SET stripe_account_id = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(account.id, profile.id);

  // Create account link for onboarding
  const link = await stripeRequest("/account_links", "POST", {
    account: account.id,
    refresh_url: `${process.env.BASE_URL || "http://localhost:3000"}/schelling/stripe_onboard`,
    return_url: `${process.env.BASE_URL || "http://localhost:3000"}/schelling/wallet_balance`,
    type: "account_onboarding",
  });

  return {
    ok: true,
    data: {
      stripe_account_id: account.id,
      onboarding_url: link.url,
      stripe_onboarded: false,
    },
  };
}

export async function handleWalletTopup(params: any, ctx: HandlerContext): Promise<HandlerResult<any>> {
  const { user_token, amount_cents, payment_method_id } = params;
  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };
  if (!amount_cents || amount_cents <= 0) return { ok: false, error: { code: "INVALID_INPUT", message: "amount_cents must be positive" } };

  const ledger = new LedgerService(ctx.db);

  if (!stripeEnabled()) {
    // Dev mode: just credit directly
    const txnId = ledger.credit(
      user_token, "client_wallet", amount_cents,
      { type: "topup", id: `dev_${Date.now()}` },
      `Dev mode wallet topup: ${amount_cents} cents`,
    );
    const balances = ledger.allBalances(user_token);
    return {
      ok: true,
      data: {
        success: true,
        transaction_id: txnId,
        balance: balances,
        mode: "dev",
      },
    };
  }

  // Production: create PaymentIntent
  const pi = await stripeRequest("/payment_intents", "POST", {
    amount: String(amount_cents),
    currency: "usd",
    payment_method: payment_method_id,
    confirm: "true",
    metadata: JSON.stringify({ user_token, type: "wallet_topup" }),
  });

  if (pi.error) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: pi.error.message } };
  }

  if (pi.status === "succeeded") {
    const txnId = ledger.credit(
      user_token, "client_wallet", amount_cents,
      { type: "topup", id: pi.id },
      `Wallet topup via Stripe: ${amount_cents} cents`,
    );
    const balances = ledger.allBalances(user_token);
    return {
      ok: true,
      data: { success: true, transaction_id: txnId, balance: balances, stripe_payment_intent: pi.id },
    };
  }

  return {
    ok: true,
    data: { success: false, status: pi.status, stripe_payment_intent: pi.id },
  };
}

export function handleWalletBalance(params: any, ctx: HandlerContext): HandlerResult<any> {
  const { user_token } = params;
  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };

  const ledger = new LedgerService(ctx.db);
  const balances = ledger.allBalances(user_token);

  // Get pending escrow
  const pendingEscrow = ctx.db.prepare(
    `SELECT COALESCE(SUM(amount_cents + platform_fee_cents), 0) as total
     FROM escrow_records WHERE (client_account_id = ? OR worker_account_id = ?) AND status = 'held'`,
  ).get(user_token, user_token) as any;

  return {
    ok: true,
    data: {
      client_wallet: balances.client_wallet || 0,
      worker_earnings: balances.worker_earnings || 0,
      pending_escrow: pendingEscrow?.total || 0,
    },
  };
}

export async function handlePayoutRequest(params: any, ctx: HandlerContext): Promise<HandlerResult<any>> {
  const { user_token, amount_cents } = params;
  if (!user_token) return { ok: false, error: { code: "INVALID_INPUT", message: "user_token required" } };

  const ledger = new LedgerService(ctx.db);
  const earnings = ledger.balance(user_token, "worker_earnings");

  const payoutAmount = amount_cents || earnings;
  if (payoutAmount < 100) {
    return { ok: false, error: { code: "INVALID_INPUT", message: "Minimum payout is $1.00 (100 cents)" } };
  }
  if (payoutAmount > earnings) {
    return { ok: false, error: { code: "INVALID_INPUT", message: `Insufficient earnings. Available: ${earnings}` } };
  }

  const profile = ctx.db.prepare(
    `SELECT * FROM marketplace_profiles WHERE registration_id = ?`,
  ).get(user_token) as any;

  if (!stripeEnabled() || !profile?.stripe_account_id) {
    // Dev mode or no Stripe: just debit
    const txnId = ledger.debit(
      user_token, "worker_earnings", payoutAmount,
      { type: "payout", id: `payout_${Date.now()}` },
      `Payout: ${payoutAmount} cents`,
    );
    return {
      ok: true,
      data: {
        success: true,
        transaction_id: txnId,
        amount_cents: payoutAmount,
        balance: ledger.allBalances(user_token),
        mode: stripeEnabled() ? "no_stripe_account" : "dev",
      },
    };
  }

  // Production: Stripe Transfer
  const transfer = await stripeRequest("/transfers", "POST", {
    amount: String(payoutAmount),
    currency: "usd",
    destination: profile.stripe_account_id,
    metadata: JSON.stringify({ user_token, type: "payout" }),
  });

  if (transfer.error) {
    return { ok: false, error: { code: "INTERNAL_ERROR", message: transfer.error.message } };
  }

  const txnId = ledger.debit(
    user_token, "worker_earnings", payoutAmount,
    { type: "payout", id: transfer.id },
    `Payout via Stripe: ${payoutAmount} cents`,
  );

  ctx.db.prepare(
    `UPDATE marketplace_profiles SET last_payout_at = datetime('now'), updated_at = datetime('now') WHERE registration_id = ?`,
  ).run(user_token);

  return {
    ok: true,
    data: {
      success: true,
      transaction_id: txnId,
      amount_cents: payoutAmount,
      stripe_transfer_id: transfer.id,
      balance: ledger.allBalances(user_token),
    },
  };
}

export async function handleStripeWebhook(req: Request, ctx: HandlerContext): Promise<Response> {
  let event: any;
  try {
    const body = await req.text();
    event = JSON.parse(body);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  // Idempotency: check if we've already processed this event
  const existing = ctx.db.prepare(
    `SELECT id FROM ledger_entries WHERE reference_id = ?`,
  ).get(event.id);
  if (existing) {
    return Response.json({ received: true, already_processed: true });
  }

  const ledger = new LedgerService(ctx.db);

  switch (event.type) {
    case "account.updated": {
      const accountId = event.data?.object?.id;
      if (accountId && event.data?.object?.charges_enabled) {
        ctx.db.prepare(
          `UPDATE marketplace_profiles SET stripe_onboarded = 1, updated_at = datetime('now') WHERE stripe_account_id = ?`,
        ).run(accountId);
      }
      break;
    }
    case "payment_intent.succeeded": {
      const pi = event.data?.object;
      const meta = pi?.metadata;
      if (meta?.type === "wallet_topup" && meta?.user_token) {
        // Idempotent: only credit if no existing entry
        const alreadyCredited = ctx.db.prepare(
          `SELECT id FROM ledger_entries WHERE reference_id = ? AND reference_type = 'topup'`,
        ).get(pi.id);
        if (!alreadyCredited) {
          ledger.credit(
            meta.user_token, "client_wallet", pi.amount,
            { type: "topup", id: pi.id },
            `Stripe payment confirmed: ${pi.amount} cents`,
          );
        }
      }
      break;
    }
  }

  return Response.json({ received: true });
}
