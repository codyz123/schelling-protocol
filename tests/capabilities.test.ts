import { describe, test, expect } from "bun:test";
import { createInMemoryDatabase } from "../src/db/client.js";
import { initSchema } from "../src/db/schema.js";
import { handleRegister } from "../src/handlers/register.js";
import { handleSearch } from "../src/handlers/search.js";
import {
  isStructuredCapability,
  validateStructuredCapability,
  matchesCapabilityQuery,
  type CapabilityEntry,
  type CapabilityQuery,
  type StructuredCapability,
} from "../src/types.js";

function freshCtx() {
  const db = createInMemoryDatabase();
  initSchema(db);
  return { db };
}

// ─── Unit Tests ──────────────────────────────────────────────────────

describe("isStructuredCapability", () => {
  test("returns true for object with name field", () => {
    expect(isStructuredCapability({ name: "audio.transcribe" })).toBe(true);
  });

  test("returns false for string", () => {
    expect(isStructuredCapability("audio.transcribe")).toBe(false);
  });

  test("returns false for legacy capability object", () => {
    expect(isStructuredCapability({ capability: "audio.transcribe" })).toBe(false);
  });

  test("returns false for null", () => {
    expect(isStructuredCapability(null)).toBe(false);
  });
});

describe("validateStructuredCapability", () => {
  test("valid capability passes", () => {
    expect(validateStructuredCapability({
      name: "audio.transcribe",
      version: "1.0",
      input_types: ["audio/wav"],
      output_types: ["text/plain"],
      sla: { max_latency_ms: 5000, availability: 0.95 },
      confidence: 0.9,
    })).toBeNull();
  });

  test("negative latency rejected", () => {
    expect(validateStructuredCapability({
      name: "test",
      sla: { max_latency_ms: -1 },
    })).toContain("negative");
  });

  test("availability > 1.0 rejected", () => {
    expect(validateStructuredCapability({
      name: "test",
      sla: { availability: 1.5 },
    })).toContain("availability");
  });

  test("confidence > 1.0 rejected", () => {
    expect(validateStructuredCapability({
      name: "test",
      confidence: 1.5,
    })).toContain("Confidence");
  });

  test("minimal capability passes", () => {
    expect(validateStructuredCapability({ name: "basic" })).toBeNull();
  });
});

describe("matchesCapabilityQuery", () => {
  const caps: CapabilityEntry[] = [
    "text-generation",
    { capability: "web-search", confidence: 0.8 },
    {
      name: "audio.transcribe",
      version: "1.0",
      input_types: ["audio/wav", "audio/mp3"],
      output_types: ["text/plain", "application/json"],
      sla: { max_latency_ms: 5000, availability: 0.95 },
      confidence: 0.9,
    },
  ];

  test("matches string cap by name", () => {
    expect(matchesCapabilityQuery(caps, { name: "text-generation" })).toBe(true);
  });

  test("matches legacy cap by name", () => {
    expect(matchesCapabilityQuery(caps, { name: "web-search" })).toBe(true);
  });

  test("matches structured cap by name", () => {
    expect(matchesCapabilityQuery(caps, { name: "audio.transcribe" })).toBe(true);
  });

  test("matches structured cap by input_types", () => {
    expect(matchesCapabilityQuery(caps, { name: "audio", input_types: ["audio/wav"] })).toBe(true);
  });

  test("rejects when input_type not available", () => {
    expect(matchesCapabilityQuery(caps, { name: "audio", input_types: ["video/mp4"] })).toBe(false);
  });

  test("filters by min_confidence", () => {
    expect(matchesCapabilityQuery(caps, { name: "audio", min_confidence: 0.8 })).toBe(true);
    expect(matchesCapabilityQuery(caps, { name: "audio", min_confidence: 0.95 })).toBe(false);
  });

  test("filters by min_availability", () => {
    expect(matchesCapabilityQuery(caps, { name: "audio", min_availability: 0.9 })).toBe(true);
    expect(matchesCapabilityQuery(caps, { name: "audio", min_availability: 0.99 })).toBe(false);
  });

  test("no match returns false", () => {
    expect(matchesCapabilityQuery(caps, { name: "nonexistent-cap" })).toBe(false);
  });

  test("empty caps returns false", () => {
    expect(matchesCapabilityQuery([], { name: "anything" })).toBe(false);
  });
});

// ─── Integration Tests ──────────────────────────────────────────────

describe("structured capabilities: registration", () => {
  test("registers with structured capabilities", async () => {
    const ctx = freshCtx();
    const result = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "ai-agent", value_type: "string" }],
      agent_capabilities: [
        { name: "audio.transcribe", input_types: ["audio/wav"], confidence: 0.9 },
        "text-generation",
      ],
    }, ctx);
    expect(result.ok).toBe(true);
  });

  test("rejects invalid SLA in structured capability", async () => {
    const ctx = freshCtx();
    const result = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "ai-agent", value_type: "string" }],
      agent_capabilities: [
        { name: "test", sla: { availability: 2.0 } },
      ],
    }, ctx);
    expect(result.ok).toBe(false);
    expect((result as any).error.code).toBe("INVALID_INPUT");
  });
});

describe("structured capabilities: search filtering", () => {
  test("capability_query filters search results", async () => {
    const ctx = freshCtx();

    // Register agent with structured capabilities
    const r1 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "transcriber", value_type: "string" }],
      agent_capabilities: [
        { name: "audio.transcribe", input_types: ["audio/wav", "audio/mp3"], confidence: 0.9, sla: { availability: 0.95 } },
      ],
    }, ctx);

    // Register agent WITHOUT audio capabilities
    const r2 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "text-gen", value_type: "string" }],
      agent_capabilities: [
        { name: "text.generate", input_types: ["text/plain"], confidence: 0.8 },
      ],
    }, ctx);

    // Register seeker
    const r3 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "seek",
      traits: [{ key: "type", value: "user", value_type: "string" }],
    }, ctx);

    expect(r1.ok && r2.ok && r3.ok).toBe(true);
    const seekerToken = (r3 as any).data.user_token;

    // Search WITHOUT capability_query — should find both
    const all = await handleSearch({ user_token: seekerToken }, ctx);
    expect(all.ok).toBe(true);
    expect((all as any).data.candidates.length).toBe(2);

    // Search WITH capability_query for audio
    const filtered = await handleSearch({
      user_token: seekerToken,
      capability_query: { name: "audio", input_types: ["audio/wav"] },
    }, ctx);
    expect(filtered.ok).toBe(true);
    expect((filtered as any).data.candidates.length).toBe(1);
    // Just verify we got the right count
  });

  test("capability_query with min_confidence filters low-confidence agents", async () => {
    const ctx = freshCtx();

    const r1 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "high-conf", value_type: "string" }],
      agent_capabilities: [{ name: "translate", confidence: 0.95 }],
    }, ctx);

    const r2 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "offer",
      traits: [{ key: "type", value: "low-conf", value_type: "string" }],
      agent_capabilities: [{ name: "translate", confidence: 0.3 }],
    }, ctx);

    const r3 = await handleRegister({
      protocol_version: "3.0",
      cluster_id: "ai.agents",
      role: "seek",
      traits: [{ key: "type", value: "user", value_type: "string" }],
    }, ctx);

    const seekerToken = (r3 as any).data.user_token;

    const filtered = await handleSearch({
      user_token: seekerToken,
      capability_query: { name: "translate", min_confidence: 0.5 },
    }, ctx);
    expect(filtered.ok).toBe(true);
    expect((filtered as any).data.candidates.length).toBe(1);
  });
});
