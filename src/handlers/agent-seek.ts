import type { HandlerContext, HandlerResult } from "../types.js";
import { handleOnboard } from "./onboard.js";
import { handleRegister } from "./register.js";
import { handleSearch, type SearchResult } from "./search.js";

// ─── Input / Output ────────────────────────────────────────────────

export interface AgentSeekInput {
  alias: string;
  intent: string;
  cluster_id?: string;
}

export interface AgentSeekOutput {
  user_token: string;
  alias: string;
  candidates: SearchResult[];
  actions_taken: Array<"registered" | "found_existing" | "searched">;
}

export interface AgentLookupInput {
  alias: string;
}

export interface AgentLookupOutput {
  alias: string;
  user_token: string | null;
  found: boolean;
}

// ─── Handlers ──────────────────────────────────────────────────────

export async function handleAgentSeek(
  input: AgentSeekInput,
  ctx: HandlerContext,
): Promise<HandlerResult<AgentSeekOutput>> {
  if (!input.alias || typeof input.alias !== "string" || input.alias.trim() === "") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "alias is required and must be a non-empty string." },
    };
  }
  if (!input.intent || typeof input.intent !== "string" || input.intent.trim() === "") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "intent is required and must be a non-empty string." },
    };
  }

  const alias = input.alias.trim();
  const intent = input.intent.trim();
  const actions: Array<"registered" | "found_existing" | "searched"> = [];

  const aliasRow = ctx.db
    .prepare("SELECT alias, user_token FROM agent_aliases WHERE alias = ?")
    .get(alias) as { alias: string; user_token: string } | undefined;

  let userToken: string;

  if (aliasRow) {
    userToken = aliasRow.user_token;
    actions.push("found_existing");
  } else {
    const onboardResult = await handleOnboard(
      { natural_language: intent, cluster_hint: input.cluster_id },
      ctx,
    );
    if (!onboardResult.ok) return onboardResult;

    const registerResult = await handleRegister(
      { ...onboardResult.data.registration_template, natural_language: intent },
      ctx,
    );
    if (!registerResult.ok) return registerResult;

    userToken = registerResult.data.user_token;

    ctx.db
      .prepare("INSERT INTO agent_aliases (alias, user_token) VALUES (?, ?)")
      .run(alias, userToken);

    actions.push("registered");
  }

  const searchResult = await handleSearch(
    input.cluster_id ? { user_token: userToken, cluster_id: input.cluster_id } : { user_token: userToken },
    ctx,
  );
  if (!searchResult.ok) return searchResult;

  actions.push("searched");

  return {
    ok: true,
    data: {
      user_token: userToken,
      alias,
      candidates: searchResult.data.candidates,
      actions_taken: actions,
    },
  };
}

export async function handleAgentLookup(
  input: AgentLookupInput,
  ctx: HandlerContext,
): Promise<HandlerResult<AgentLookupOutput>> {
  if (!input.alias || typeof input.alias !== "string" || input.alias.trim() === "") {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "alias is required and must be a non-empty string." },
    };
  }

  const alias = input.alias.trim();
  const aliasRow = ctx.db
    .prepare("SELECT alias, user_token FROM agent_aliases WHERE alias = ?")
    .get(alias) as { alias: string; user_token: string } | undefined;

  return {
    ok: true,
    data: {
      alias,
      user_token: aliasRow?.user_token ?? null,
      found: Boolean(aliasRow),
    },
  };
}
