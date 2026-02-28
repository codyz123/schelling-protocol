import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { evaluatePreference } from "../src/types.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

async function registerUser(overrides = {}) {
  const result = await handleRegister({
    protocol_version: "3.0",
    cluster_id: "housing.general",
    traits: [
      { key: "name", value: "Test User", value_type: "string", visibility: "public" },
    ],
    preferences: [],
    identity: { name: "Test User", contact: "test@example.com" },
    ...overrides,
  } as any, ctx);
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

describe("matching: normalization, fuzzy, near, and explanations", () => {
  test("normalized string matching handles punctuation and case", () => {
    const pref = { operator: "eq", value: "fort-collins", weight: 0.5 };
    const result = evaluatePreference(pref, "Fort Collins", false);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  test("fuzzy matching uses Jaccard similarity when equality fails", () => {
    const pref = { operator: "eq", value: "Fort Collins", weight: 0.5 };
    const result = evaluatePreference(pref, "Fort Collins CO", false);
    expect(result.pass).toBe(true);
    expect(result.score).toBeCloseTo(0.67, 2);
  });

  test("near operator scores numeric proximity", () => {
    const pref = { operator: "near", value: 800, weight: 0.5 };
    const result = evaluatePreference(pref, 750, false);
    expect(result.pass).toBe(true);
    expect(result.score).toBeCloseTo(0.69, 2);
  });

  test("missing traits are skipped for soft preferences", async () => {
    const seekerToken = await registerUser({
      traits: [
        { key: "city", value: "Denver", value_type: "string", visibility: "public" },
      ],
      preferences: [
        { trait_key: "city", operator: "eq", value: "Denver", weight: 0.5 },
        { trait_key: "pets", operator: "eq", value: "cats", weight: 0.5 },
      ],
    });

    await registerUser({
      traits: [
        { key: "city", value: "Denver", value_type: "string", visibility: "public" },
      ],
      preferences: [],
    });

    const search = await handleSearch({ user_token: seekerToken }, ctx);
    expect(search.ok).toBe(true);
    if (!search.ok) throw new Error("unreachable");

    expect(search.data.candidates.length).toBe(1);
    expect(search.data.candidates[0].your_fit).toBe(1.0);
  });

  test("roommate scenario end-to-end", async () => {
    const seekerToken = await registerUser({
      cluster_id: "housing.roommates",
      traits: [
        { key: "city", value: "Fort Collins", value_type: "string", visibility: "public" },
      ],
      preferences: [
        { trait_key: "city", operator: "eq", value: "Fort Collins", weight: 0.4 },
        { trait_key: "budget", operator: "near", value: 800, weight: 0.4 },
        { trait_key: "pet_policy", operator: "eq", value: "no dogs", weight: 0.2 },
      ],
    });

    await registerUser({
      cluster_id: "housing.roommates",
      traits: [
        { key: "city", value: "Fort Collins CO", value_type: "string", visibility: "public" },
        { key: "budget", value: 750, value_type: "number", visibility: "public" },
        { key: "pet_policy", value: "No dogs", value_type: "string", visibility: "public" },
      ],
      preferences: [],
    });

    const search = await handleSearch({ user_token: seekerToken }, ctx);
    expect(search.ok).toBe(true);
    if (!search.ok) throw new Error("unreachable");

    expect(search.data.candidates.length).toBe(1);
    const explanation = search.data.candidates[0].match_explanation;
    expect(explanation.strong_matches).toEqual(["pet policy"]);
    expect(explanation.partial_matches).toEqual(["city", "budget"]);
    expect(explanation.mismatches).toEqual([]);
  });
});
