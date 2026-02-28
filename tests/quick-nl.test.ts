import { describe, expect, test, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "../src/db/schema.js";
import type { HandlerContext } from "../src/types.js";
import { handleQuickSeek, handleQuickOffer } from "../src/handlers/quick.js";
import { handleRegister } from "../src/handlers/register.js";

let db: Database;
let ctx: HandlerContext;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
  ctx = { db };
});

// Helper to register a provider
async function registerProvider(cluster: string, traits: any[]) {
  const result = await handleRegister(
    {
      protocol_version: "3.0",
      cluster_id: cluster,
      role: "provider",
      traits,
      preferences: [],
    } as any,
    ctx,
  );
  if (!result.ok) throw new Error(result.error.message);
  return result.data.user_token;
}

describe("quick_seek: NL intent parsing", () => {
  test("extracts location from 'in Denver'", async () => {
    const result = await handleQuickSeek({ intent: "looking for a developer in Denver" }, ctx);
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const loc = traits.find((t: any) => t.key === "location");
    expect(loc).toBeDefined();
    expect(loc.value).toBe("Denver");
  });

  test("does NOT match 'in' inside 'looking'", async () => {
    const result = await handleQuickSeek({ intent: "looking for something interesting" }, ctx);
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const loc = traits.find((t: any) => t.key === "location");
    expect(loc).toBeUndefined();
  });

  test("extracts multi-word city 'in Fort Collins'", async () => {
    const result = await handleQuickSeek({ intent: "apartment in Fort Collins under $1200" }, ctx);
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const loc = traits.find((t: any) => t.key === "location");
    expect(loc).toBeDefined();
    expect(loc.value).toBe("Fort Collins");
  });

  test("extracts rate from '$100/hr'", async () => {
    const result = await handleQuickSeek({ intent: "Python developer in Denver, $100/hr" }, ctx);
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const rate = traits.find((t: any) => t.key === "rate");
    expect(rate).toBeDefined();
    expect(rate.value).toBe(100);
    const unit = traits.find((t: any) => t.key === "rate_unit");
    expect(unit).toBeDefined();
    expect(unit.value).toBe("hour");
  });

  test("extracts budget from 'budget $500'", async () => {
    const result = await handleQuickSeek({ intent: "looking for a tutor, budget $500" }, ctx);
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const budget = traits.find((t: any) => t.key === "budget");
    expect(budget).toBeDefined();
    expect(budget.value).toBe(500);
  });

  test("detects housing cluster from 'roommate'", async () => {
    const result = await handleQuickSeek({ intent: "looking for a roommate in Fort Collins" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data.cluster_id).toBe("housing");
  });

  test("detects freelance cluster from 'freelance'", async () => {
    const result = await handleQuickSeek({ intent: "need a freelance designer" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data.cluster_id).toBe("freelance");
  });

  test("returns user_token and registration", async () => {
    const result = await handleQuickSeek({ intent: "React developer in Denver" }, ctx);
    expect(result.ok).toBe(true);
    expect(result.data.user_token).toBeDefined();
    expect(typeof result.data.user_token).toBe("string");
    expect(result.data.registration_created).toBe(true);
  });
});

describe("quick_offer: NL intent parsing", () => {
  test("registers an offering and returns token", async () => {
    const result = await handleQuickOffer(
      { intent: "I am a React developer in Denver, $90/hr, 5 years experience" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(result.data.user_token).toBeDefined();
    expect(result.data.registration_created).toBe(true);
  });

  test("extracts rate from offering intent", async () => {
    const result = await handleQuickOffer(
      { intent: "freelance Python developer, $120/hr" },
      ctx,
    );
    expect(result.ok).toBe(true);
    const traits = result.data.nl_parsed?.traits || [];
    const rate = traits.find((t: any) => t.key === "rate");
    expect(rate).toBeDefined();
    expect(rate.value).toBe(120);
  });
});

describe("quick_seek + quick_offer: matching", () => {
  test("offer then seek finds the match", async () => {
    // Register an offer
    const offer = await handleQuickOffer(
      { intent: "I am a React developer in Denver, $90/hr" },
      ctx,
    );
    expect(offer.ok).toBe(true);

    // Seek a match
    const seek = await handleQuickSeek(
      { intent: "looking for a React developer in Denver" },
      ctx,
    );
    expect(seek.ok).toBe(true);
    expect(seek.data.candidates.length).toBeGreaterThan(0);
  });

  test("seek returns empty candidates when no offers exist", async () => {
    const seek = await handleQuickSeek(
      { intent: "looking for a plumber in Miami" },
      ctx,
    );
    expect(seek.ok).toBe(true);
    expect(seek.data.candidates.length).toBe(0);
  });

  test("rejects empty intent", async () => {
    const result = await handleQuickSeek({ intent: "" }, ctx);
    expect(result.ok).toBe(false);
  });

  test("rejects missing intent", async () => {
    const result = await handleQuickSeek({} as any, ctx);
    expect(result.ok).toBe(false);
  });
});
