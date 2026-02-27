# Distribution Strategy v2 — Change Notes

**Date:** 2026-02-25
**Aligned to:** Schelling Protocol Spec v3.0

---

## Summary

Complete rewrite of the distribution strategy to align with the v3 spec's evolution from a matchmaking protocol to a universal agent coordination hub. Every section was updated or replaced.

---

## Major Changes

### 1. Narrative Reframe
- **Before:** "Open protocol for AI agent matchmaking" — led with dating/matching
- **After:** "The coordination layer every AI agent needs" — leads with universal agent coordination
- New opening pitch: "Your agent can find, negotiate with, and transact with any other agent on the planet. No integration needed."
- Schelling is now positioned as agent infrastructure, not a dating protocol

### 2. Phase 1: Dual Bootstrap (was: Bootstrap via Keeper)
- **Added:** Second simultaneous bootstrap — a services marketplace (`services.plumbing.*`, `services.legal.*`, etc.)
- **Reframed:** Keeper from "being a dating app" to "proving the protocol in one vertical"
- **Rationale:** Two simultaneous verticals instantly prove generalization. One vertical risks permanently branding Schelling as "that dating thing."
- Services marketplace uses broadcast/auction funnel modes, showcasing v3's new capabilities

### 3. Phase 2: NL Interface + MCP-First Distribution (was: Open Source)
- **Added:** MCP server package as PRIMARY distribution vector (`npx @schelling/mcp-server`)
- **Updated:** SDK examples show 1-line integration via NL interface (was 3-line structured API)
- **Updated:** Reference agents now diverse: dating, services, hiring, group, marketplace (was: dating, talent, roommate)
- **Added:** Developer onboarding path via `schelling.describe` → `schelling.onboard` → `schelling.register` (3 API calls from zero to registered)
- **Updated:** Docker one-liner includes full tool suite

### 4. Phase 3: Model Provider Integration (expanded)
- **Added:** OpenAI function calling schema as explicit distribution target
- **Added:** Google A2A protocol compatibility + Vertex AI extensions
- **Added:** `schelling.describe` flywheel — self-describing endpoint enables zero-friction agent self-onboarding
- **Elevated:** This phase is now more critical because agent-first design means tool registry presence IS the distribution strategy

### 5. Phase 4: Cluster Emergence (was: Vertical Expansion)
- **Removed:** Fixed vertical roadmap table with predetermined verticals and timelines
- **Replaced with:** Principles for cluster seeding (seed don't dictate, follow the energy, cross-pollinate, let naming emerge, remove dead weight, seed diverse funnel modes)
- **Reframed:** From "we decide which verticals to expand into" to "agents create clusters, we create conditions for organic growth"
- **Added:** Expected emergence pattern timeline

### 6. Phase 5: Network Effects & Moat (expanded)
- **Added:** Learned ranking model as the #1 moat element (was not mentioned)
  - Three-tier model: cluster priors → cohort patterns → per-user refinement
  - Proprietary to the network — competitors can copy protocol but not trained model
- **Added:** Pluggable tools ecosystem as developer moat ("app store" effect)
- **Added:** "Intelligence as Moat" subsection explaining why advisory intelligence is a compounding advantage
- **Updated:** Flywheel diagram now includes learned model and tool ecosystem

### 7. Revenue Model (expanded)
- **Added:** Tool marketplace revenue (20% platform cut on third-party tool charges)
- **Added:** Enterprise private clusters ($199/mo starting)
- **Added:** API usage tiers reflecting new operations (NL parsing, tools, fast-path, deliverables)
- **Added:** Free tier now explicitly includes NL parses and `schelling.describe`/`schelling.onboard`
- Revenue targets updated upward (was $10K → now $15K at 18mo)

### 8. Anti-Patterns (revised)
- **Removed:** "Don't build a smart server" — the v3 server IS smart (learned ranking model). This is no longer an anti-pattern; it's the moat.
- **Added:** "Don't let any single cluster define your identity" — prevents dating-protocol branding
- **Added:** "Don't require human onboarding for anything" — agent-first principle
- **Added:** "Don't let tool quality decay" — ecosystem credibility
- **Added:** "Don't centralize cluster governance" — emergent structure principle

### 9. Discovery (restructured)
- **Primary:** MCP manifest (was `.well-known/schelling`)
- **Secondary:** `schelling.describe` self-describing endpoint (new)
- **Tertiary:** `.well-known/schelling` (demoted from primary)
- **Added:** Agent registry listings (OpenAI GPT Store, Google A2A, Anthropic MCP, LangChain Hub)
- **Added:** Zero-config agent onboarding flow (7-step autonomous discovery and use)

### 10. Competitive Landscape (new section)
- **Added:** Analysis of 6 competitor categories: Google A2A, OpenAI, LangChain, AutoGen/CrewAI, traditional marketplaces, federation protocols
- **Added:** 6 differentiation points: network effects + learned model, reputation data, tools ecosystem, protocol-level primitives, NL interface, universal-not-vertical
- **Added:** Defensive strategy: move fast on MCP/A2A, accumulate reputation data, grow tool ecosystem, keep protocol open

### 11. Metrics (updated)
- Doubled most targets to reflect more aggressive growth expectations
- **Added:** Organically-created clusters (target: 5 at 6mo, 30+ at 18mo)
- **Added:** Tool ecosystem size (target: 5 at 6mo, 50+ at 18mo)
- **Added:** `schelling.describe` calls/month (agent discovery signal)
- **Added:** Self-onboarded agents (describe → register path)
- **Added:** Learned model outcome basis (training data volume)

---

## What Was Preserved
- Core insight: network size is the only metric that matters early
- Keeper as Phase 1 bootstrap (now alongside services)
- Open source as distribution strategy
- "Don't gate the protocol" and "Don't compete with agents" anti-patterns
- Phased approach with increasing ambition
- Revenue model structure (hosted node tiers + premium features + free core)
- `.well-known/schelling` discovery (demoted but retained)

---

## Alignment with Spec v3.0

| Spec Feature | Strategy Coverage |
|---|---|
| Dynamic clusters (§4) | Phase 4 reframed around cluster emergence |
| `schelling.describe` (§5.2) | Discovery section, Phase 3 flywheel |
| `schelling.onboard` (§6.1) | Phase 2 developer onboarding, Discovery |
| NL interface (§7) | Phase 2 SDK, zero-config onboarding |
| Funnel modes (§9) | Phase 1 services bootstrap, Phase 4 seeding |
| Fast-path ops (§11) | Phase 1 services, Phase 2 examples |
| Learned ranking model (§12) | Phase 5 moat, Revenue model |
| Pluggable tools (§15) | Phase 5 moat, Revenue model |
| Deliverable exchange (§18) | Revenue model API tiers |
| MCP manifest (§5.5) | Primary discovery mechanism |
