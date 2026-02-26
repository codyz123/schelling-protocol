import type {
  HandlerContext,
  HandlerResult,
  UserRecord,
  TraitRecord,
  PreferenceRecord,
  CandidateRecord,
  MessageRecord,
  InquiryRecord,
  ContractRecord,
  DeliverableRecord,
  EventRecord,
  SubscriptionRecord,
  ReputationEventRecord,
} from "../types.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface ExportInput {
  user_token: string;
  format?: "json" | "csv";
}

export interface ExportOutput {
  profile: {
    user: UserRecord;
    traits: TraitRecord[];
    preferences: PreferenceRecord[];
  };
  candidates: CandidateRecord[];
  messages: MessageRecord[];
  inquiries: InquiryRecord[];
  contracts: ContractRecord[];
  deliveries: DeliverableRecord[];
  events: EventRecord[];
  subscriptions: SubscriptionRecord[];
  reputation: {
    score: number;
    events: ReputationEventRecord[];
  };
  enforcement: Array<{
    id: string;
    user_token: string;
    level: number;
    reason: string;
    evidence: string | null;
    expires_at: string | null;
    disputable: number;
    created_at: string;
  }>;
  verification: Array<{
    id: string;
    user_token: string;
    candidate_id: string | null;
    trait_key: string;
    action: string;
    evidence_type: string | null;
    evidence_data: string | null;
    requested_tier: string | null;
    requested_from: string | null;
    status: string;
    current_tier: string | null;
    created_at: number;
    expires_at: number | null;
  }>;
  exported_at: string;
}

// ─── Handler ───────────────────────────────────────────────────────

export async function handleExport(
  input: ExportInput,
  ctx: HandlerContext,
): Promise<HandlerResult<ExportOutput>> {
  // ── Verify user exists ─────────────────────────────────────────
  const user = ctx.db
    .prepare("SELECT * FROM users WHERE user_token = ?")
    .get(input.user_token) as UserRecord | undefined;

  if (!user) {
    return {
      ok: false,
      error: { code: "USER_NOT_FOUND", message: "User not found" },
    };
  }

  // ── Gather all data ────────────────────────────────────────────

  const traits = ctx.db
    .prepare("SELECT * FROM traits WHERE user_token = ?")
    .all(input.user_token) as TraitRecord[];

  const preferences = ctx.db
    .prepare("SELECT * FROM preferences WHERE user_token = ?")
    .all(input.user_token) as PreferenceRecord[];

  const candidates = ctx.db
    .prepare(
      "SELECT * FROM candidates WHERE user_a_token = ? OR user_b_token = ?",
    )
    .all(input.user_token, input.user_token) as CandidateRecord[];

  const candidateIds = candidates.map((c) => c.id);

  // Messages: sent by user or in candidate pairs involving user
  const messages = candidateIds.length > 0
    ? ctx.db
        .prepare(
          `SELECT * FROM messages WHERE candidate_id IN (${candidateIds.map(() => "?").join(",")})`,
        )
        .all(...candidateIds) as MessageRecord[]
    : [];

  const inquiries = candidateIds.length > 0
    ? ctx.db
        .prepare(
          `SELECT * FROM inquiries WHERE candidate_id IN (${candidateIds.map(() => "?").join(",")})`,
        )
        .all(...candidateIds) as InquiryRecord[]
    : [];

  const contracts = candidateIds.length > 0
    ? ctx.db
        .prepare(
          `SELECT * FROM contracts WHERE candidate_id IN (${candidateIds.map(() => "?").join(",")})`,
        )
        .all(...candidateIds) as ContractRecord[]
    : [];

  const contractIds = contracts.map((c) => c.contract_id);

  const deliveries = contractIds.length > 0
    ? ctx.db
        .prepare(
          `SELECT * FROM deliverables WHERE contract_id IN (${contractIds.map(() => "?").join(",")})`,
        )
        .all(...contractIds) as DeliverableRecord[]
    : [];

  const events = candidateIds.length > 0
    ? ctx.db
        .prepare(
          `SELECT * FROM events WHERE candidate_id IN (${candidateIds.map(() => "?").join(",")})`,
        )
        .all(...candidateIds) as EventRecord[]
    : [];

  const subscriptions = ctx.db
    .prepare("SELECT * FROM subscriptions WHERE user_token = ?")
    .all(input.user_token) as SubscriptionRecord[];

  // Reputation
  const repEvents = ctx.db
    .prepare("SELECT * FROM reputation_events WHERE identity_id = ?")
    .all(input.user_token) as ReputationEventRecord[];

  const repScoreRow = ctx.db
    .prepare(
      `SELECT AVG(CASE rating
                WHEN 'positive' THEN 1.0
                WHEN 'neutral'  THEN 0.5
                WHEN 'negative' THEN 0.0
                ELSE 0.5
              END) as avg_score,
              COUNT(*) as cnt
       FROM reputation_events
       WHERE identity_id = ?`,
    )
    .get(input.user_token) as { avg_score: number | null; cnt: number };

  const reputationScore =
    repScoreRow && repScoreRow.cnt > 0 ? (repScoreRow.avg_score ?? 0.5) : 0.5;

  // Enforcement actions
  const enforcement = ctx.db
    .prepare("SELECT * FROM enforcement_actions WHERE user_token = ?")
    .all(input.user_token) as ExportOutput["enforcement"];

  // Verifications
  const verification = ctx.db
    .prepare(
      "SELECT * FROM verifications WHERE user_token = ? OR requested_from = ?",
    )
    .all(input.user_token, input.user_token) as ExportOutput["verification"];

  // ── Build result ───────────────────────────────────────────────

  const result: ExportOutput = {
    profile: {
      user,
      traits,
      preferences,
    },
    candidates,
    messages,
    inquiries,
    contracts,
    deliveries,
    events,
    subscriptions,
    reputation: {
      score: reputationScore,
      events: repEvents,
    },
    enforcement,
    verification,
    exported_at: new Date().toISOString(),
  };

  return { ok: true, data: result };
}
