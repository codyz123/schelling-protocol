import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleAgentSeek, handleAgentLookup } from "../src/handlers/agent-seek.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerCandidate(clusterId = "hiring.engineering.frontend") {
  const result = await handleRegister({
    protocol_version: "3.0",
    cluster_id: clusterId,
    traits: [
      { key: "city", value: "San Francisco", value_type: "string", visibility: "public" },
      { key: "skills", value: ["react", "typescript"], value_type: "array", visibility: "public" },
    ],
  } as any, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

describe("agent_seek convenience operation", () => {
  test("new user flow (register + search)", async () => {
    await registerCandidate();

    const result = await handleAgentSeek({
      alias: "moltbot",
      intent: "Frontend engineer looking for React work",
      cluster_id: "hiring.engineering.frontend",
    }, ctx);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.data.user_token).toBeTruthy();
    expect(result.data.alias).toBe("moltbot");
    expect(result.data.actions_taken).toEqual(["registered", "searched"]);
    expect(result.data.candidates.length).toBeGreaterThanOrEqual(1);

    const aliasRow = db
      .prepare("SELECT user_token FROM agent_aliases WHERE alias = ?")
      .get("moltbot") as { user_token: string } | undefined;
    expect(aliasRow?.user_token).toBe(result.data.user_token);
  });

  test("returning user flow (lookup + search)", async () => {
    await registerCandidate();

    const first = await handleAgentSeek({
      alias: "moltbot",
      intent: "Frontend engineer looking for React work",
      cluster_id: "hiring.engineering.frontend",
    }, ctx);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");

    const second = await handleAgentSeek({
      alias: "moltbot",
      intent: "Updated intent text",
      cluster_id: "hiring.engineering.frontend",
    }, ctx);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");

    expect(second.data.user_token).toBe(first.data.user_token);
    expect(second.data.actions_taken).toEqual(["found_existing", "searched"]);

    const userCount = db
      .prepare("SELECT COUNT(*) as count FROM users")
      .get() as { count: number };
    expect(userCount.count).toBe(2);
  });
});

describe("agent_lookup convenience operation", () => {
  test("agent_lookup for existing and non-existing aliases", async () => {
    await registerCandidate();

    const created = await handleAgentSeek({
      alias: "moltbot",
      intent: "Frontend engineer looking for React work",
      cluster_id: "hiring.engineering.frontend",
    }, ctx);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("unreachable");

    const existing = await handleAgentLookup({ alias: "moltbot" }, ctx);
    expect(existing.ok).toBe(true);
    if (!existing.ok) throw new Error("unreachable");
    expect(existing.data.found).toBe(true);
    expect(existing.data.user_token).toBe(created.data.user_token);

    const missing = await handleAgentLookup({ alias: "ghost" }, ctx);
    expect(missing.ok).toBe(true);
    if (!missing.ok) throw new Error("unreachable");
    expect(missing.data.found).toBe(false);
    expect(missing.data.user_token).toBeNull();
  });
});
