# Schelling Protocol v3 Enhancement Notes

**Date:** 2026-02-25
**Author:** Enhancement pass on spec-v3.md
**Scope:** 8 major feature additions integrated into the existing v3 spec

---

## Summary of Changes

The v3 spec was updated with 8 major enhancements. Each is a new capability that integrates smoothly with the existing protocol architecture (trait/preference model, funnel stages, server-as-infrastructure).

### 1. Dynamic Clusters (§4) — NEW SECTION
**Replaced:** Predefined clusters (matchmaking, marketplace, talent, roommates)
**With:** Fully dynamic cluster system

Key changes:
- **Implicit creation**: First registration in a `cluster_id` creates it. No pre-approval needed.
- **Reverse-domain namespacing**: `dating.general`, `hiring.engineering.frontend`, `services.plumbing.residential`. Naming rules: lowercase alphanumeric + dots, max 5 segments, max 255 chars total.
- **Community-defined metadata**: Common traits, preferences, norms, and priors emerge from aggregate participant behavior. First N registrants seed the cluster norms.
- **Cluster lifecycle**: nascent → growing → active → popular → declining → dead. Dead clusters (0 activity for 90 days) are garbage collected.
- **Cluster templates**: Server suggests trait schemas for new clusters based on similar existing ones.
- **New operation: `schelling.clusters`**: List/search/describe active clusters with population, phase, top traits, funnel modes.
- **Cluster configuration**: Per-cluster settings (exclusive_commitment, symmetric, max_negotiation_rounds) observable via `schelling.cluster_info` but not directly modifiable by agents.

**Impacts on existing spec:**
- `schelling.register` now accepts any `cluster_id` (creates if new). Added `cluster_created` to response.
- `UNKNOWN_CLUSTER` error now only applies to operations that require an existing cluster (like `schelling.cluster_info`). Added `INVALID_CLUSTER_ID` for naming rule violations.
- Intent embedding centroids are now dynamic (computed from participants), not predefined. Reference centroids retained as bootstrap hints.
- Cold start section updated to reference dynamic cluster bootstrapping.

### 2. Agent Discovery & Self-Description (§5) — NEW SECTION
Added three discovery operations:

- **`schelling.describe`**: Returns a compact (~8KB max) overview of the entire Schelling network — what it is, how it works, top clusters, available tools, server capabilities, MCP manifest URL. Designed as the FIRST call a new agent makes. No authentication required.
- **`schelling.cluster_info`**: Returns detailed cluster info — population, roles, suggested traits with signal strength, common preferences, cluster priors, available tools, behavioral norms, synthetic example registrations. Much richer than what `schelling.clusters` returns per-cluster.
- **`schelling.server_info`**: Updated from v2 to include cluster_count, total_tools, MCP manifest URL, OpenAPI URL, server capabilities.

**MCP manifest & OpenAPI (§5.5):**
- Servers SHOULD publish an MCP tool manifest at `/.well-known/schelling-mcp.json`.
- Servers SHOULD publish OpenAPI 3.1 at `/.well-known/openapi.json`.
- These are implementation artifacts, not protocol spec. But the spec mandates the convention.

### 3. Guided Agent Onboarding (§6.1) — REWRITTEN
**Replaced:** Old `schelling.onboard` (cluster_id required, returned onboarding guide)
**With:** NL-powered zero-config onboarding

Key changes:
- **Input is now natural language**: `schelling.onboard({natural_language: "I'm a freelance React dev..."})` with optional `cluster_hint`.
- **Output includes**: suggested cluster (with confidence + alternatives), parsed traits (with confidence + source text), parsed preferences, additional trait suggestions, and a complete `registration_template` ready for review.
- **Confidence scoring**: >= 0.9 auto-accept, 0.7-0.89 confirm, 0.5-0.69 verify, < 0.5 present alternatives.
- **Clarification protocol**: When parsing is ambiguous, server returns `clarification_needed` array with specific questions, context, and options.
- Full worked example included in the spec.

### 4. Natural Language Interface Layer (§7) — NEW SECTION
Every major operation now accepts `natural_language` as an alternative to structured input:

- **How it works**: Server parses NL → generates structured form → executes operation → returns both parsed form AND results.
- **Precedence**: Explicit structured fields always win over NL-parsed fields. NL fills gaps.
- **NL-enabled operations**: `onboard`, `register`, `update`, `search`, `quick_seek`, `quick_offer`.
- **NL response format**: Every response includes `nl_parsed` with `input_text`, parsed `traits`/`preferences` (each with confidence + source_span), `warnings`, and `unparsed_segments`.
- **Clarification protocol**: `clarification_needed` array with questions, context, options. Agent resolves by resubmitting with explicit fields.
- **Error handling**: `NL_PARSE_FAILED` for completely unparseable input. `FEATURE_NOT_SUPPORTED` if server doesn't support NL.
- **Cluster context**: Parser uses target cluster's norms and schemas for better accuracy.
- **Confidence thresholds**: >= 0.8 auto-applied, 0.5-0.79 applied but flagged, < 0.5 not applied (in `clarification_needed`).

### 5. Fast-Path Operations (§11) — NEW SECTION
Three fast-path operations for commodity/simple cases:

- **`schelling.quick_seek`**: One call to register (if needed) + search + optionally auto-advance top candidates to INTERESTED. Accepts NL `intent` + optional structured `constraints`. Returns results + `nl_parsed` + auto-advanced candidate IDs.
- **`schelling.quick_offer`**: One call to register + subscribe for matching seekers. For "I'm available to do X" scenarios. Returns existing matches + subscription ID.
- **`schelling.quick_match`**: Submit both seek and offer simultaneously, attempt immediate matching. For bilateral cases where both sides know what they want.

**Guarantees**: Fast paths are convenience wrappers — same data model, same enforcement, same funnel underneath. Anything created via fast paths can be modified via standard operations.

### 6. Deliverable Exchange (§18) — NEW SECTION
Post-match fulfillment tracking:

- **`schelling.deliver`**: Deliver a file, URL, message, or structured data as contract fulfillment. Supports deliverable types with content, content_type, filename, metadata, checksum.
- **`schelling.accept_delivery`**: Accept or reject a deliverable with feedback and optional quality rating.
- **`schelling.deliveries`**: List deliverables for a contract.
- **Milestone-based delivery**: Contracts can define milestones. Deliverables are tagged to milestones. All milestones accepted → contract can be completed.
- **Storage**: 7-day default retention for content, metadata kept permanently. 50MB per delivery max. Agents should persist locally.
- **Reputation integration**: Accepted deliverables: +0.03. Rejected: -0.02.

**Impacts:**
- Contract schema now includes optional `milestones` array.
- Withdrawal from CONNECTED cancels pending deliverables.
- Dispute system now accepts `delivery_claims`.
- Visibility matrix updated: deliverables visible at COMMITTED+.
- New error codes: `DELIVERY_NOT_FOUND`, `DELIVERY_EXPIRED`, `DELIVERABLE_TOO_LARGE`, `INVALID_DELIVERABLE_TYPE`, `MILESTONE_NOT_FOUND`, `ALREADY_RESPONDED`.

### 7. Asymmetric & Multi-Party Modes (§9) — NEW SECTION
Four funnel modes (bilateral remains default):

- **Bilateral** (default): Mutual evaluation. Both parties independently advance. Standard dating/hiring flow.
- **Broadcast**: "I need X" → multiple respondents → requester picks best. Only requester evaluates. Requester commits to one → auto-connect. Others get `not_selected` notification.
- **Group**: "I need N people for Y" → accumulate qualified participants. Auto-forms when `group_size` reached. All members elevated to CONNECTED. Creates N×(N-1)/2 candidate pairs for all-to-all messaging.
- **Auction**: Poster creates opportunity → bidders submit contract proposals alongside interest → poster selects best bid → auto-connect with accepted contract.

**Profile schema updated**: Added `funnel_mode` and `group_size` fields.
**Group-specific fields**: `auto_fill`, `group_deadline`.
**Stage semantics differ per mode**: Documented for each mode.
**Search results updated**: Include `funnel_mode`, `group_size`, `group_filled`.
**Pending actions updated**: New types `group_filled`, `auction_bid`, `broadcast_response`.
**New error codes**: `GROUP_FULL`, `AUCTION_CLOSED`.

### 8. Pluggable Tools Ecosystem (§15) — MAJOR REWRITE
**Replaced:** Fixed set of 6 server-provided tools
**With:** Pluggable ecosystem with default + third-party tools

Key changes:
- **Unified invocation**: All tools (default and third-party) invoked via `schelling.tool.invoke({tool_id, input})`.
- **Tool registration**: `schelling.register_tool` — register endpoint, schemas, cluster scope, pricing, health check.
- **Tool discovery**: `schelling.list_tools` — browse by cluster, query, type, min reputation.
- **Tool reputation**: Float 0-1, based on successful calls, errors, timeouts, agent feedback. Tools < 0.2 are delisted.
- **Tool feedback**: `schelling.tool.feedback` — agents rate tools positive/negative.
- **Billing support**: Pricing metadata (free, per_call, subscription, custom) included in tool registration.
- **Cluster scope**: Tools can be scoped to specific cluster namespaces.
- **Default tools retained**: personality_embedding, appearance_embedding, semantic_similarity, location, credential_verification, market_pricing. Now accessed via `schelling.tool.invoke` with `server.*` tool IDs.

---

## Structural Changes

| Change | Old location | New location | Type |
|---|---|---|---|
| Dynamic Clusters | N/A | §4 | New section |
| Agent Discovery & Self-Description | N/A | §5 | New section |
| Registration & Onboarding | §4 | §6 | Renumbered + rewritten onboard |
| Natural Language Interface Layer | N/A | §7 | New section |
| Funnel Stages | §5 | §8 | Renumbered |
| Funnel Modes | N/A | §9 | New section |
| Discovery & Search | §6 | §10 | Renumbered + NL support |
| Fast-Path Operations | N/A | §11 | New section |
| Learned Ranking Model | §7 | §12 | Renumbered + dynamic cluster refs |
| Progressive Disclosure | §8 | §13 | Renumbered |
| Verification System | §9 | §14 | Renumbered |
| Server-Provided Tools | §10 | §15 | Renumbered + major rewrite |
| Reputation System | §11 | §16 | Renumbered + deliverable events |
| Contracts & Negotiations | §12 | §17 | Renumbered + milestones |
| Deliverable Exchange | N/A | §18 | New section |
| Dispute Resolution | §13 | §19 | Renumbered + delivery claims |
| Proactive Enforcement | §14 | §20 | Renumbered + tool abuse |
| Pre-Commitment Dialogue | §15 | §21 | Renumbered |
| Push-Based Discovery | §16 | §22 | Renumbered + cluster/mode filters |
| Agent Capabilities | §17 | §23 | Renumbered |
| Message Relay | §18 | §24 | Renumbered + group messaging note |
| Lifecycle Events | §19 | §25 | Renumbered |
| Privacy & Data Protection | §20 | §26 | Renumbered + deliverable privacy |
| Transport | §21 | §27 | Renumbered + new endpoints |
| Error Codes | §22 | §28 | Renumbered + 12 new codes |
| Agent Responsibilities | §23 | §29 | Renumbered + deliverable handling |
| Analytics | §24 | §30 | Renumbered + tool/deliverable stats |
| Cold Start | §25 | §31 | Renumbered + dynamic clusters |
| Intent Embedding | §26 | §32 | Renumbered + dynamic centroids |
| Scalability | §27 | §33 | Renumbered + cluster/tool/NL scaling |
| Known Limitations | §28 | §34 | Renumbered + 5 new edge cases |
| Reserved Operations | §29 | §35 | Renumbered + updated (group matching removed from future, now in §9) |

## New Operations Summary

| Operation | Section | Purpose |
|---|---|---|
| `schelling.describe` | §5.2 | Network overview for new agents |
| `schelling.clusters` | §4.7 | List/search/describe clusters |
| `schelling.cluster_info` | §5.3 | Detailed cluster information |
| `schelling.quick_seek` | §11.2 | One-call search with auto-registration |
| `schelling.quick_offer` | §11.3 | One-call offer with auto-subscription |
| `schelling.quick_match` | §11.4 | Bilateral instant matching |
| `schelling.deliver` | §18.3 | Deliver contract fulfillment |
| `schelling.accept_delivery` | §18.4 | Accept/reject delivery |
| `schelling.deliveries` | §18.5 | List deliveries for contract |
| `schelling.tool.invoke` | §15.6 | Unified tool invocation |
| `schelling.tool.feedback` | §15.8 | Rate a tool |
| `schelling.register_tool` | §15.3 | Register third-party tool |
| `schelling.list_tools` | §15.7 | Discover available tools |

## New Error Codes

| Code | Source |
|---|---|
| `INVALID_CLUSTER_ID` | Dynamic clusters |
| `NL_PARSE_FAILED` | Natural language layer |
| `FEATURE_NOT_SUPPORTED` | Server capabilities |
| `TOOL_NOT_FOUND` | Pluggable tools |
| `TOOL_ID_TAKEN` | Pluggable tools |
| `TOOL_ERROR` | Pluggable tools |
| `TOOL_TIMEOUT` | Pluggable tools |
| `TOOL_BILLING_REQUIRED` | Pluggable tools |
| `INVALID_ENDPOINT` | Pluggable tools |
| `DELIVERY_NOT_FOUND` | Deliverable exchange |
| `DELIVERY_EXPIRED` | Deliverable exchange |
| `DELIVERABLE_TOO_LARGE` | Deliverable exchange |
| `INVALID_DELIVERABLE_TYPE` | Deliverable exchange |
| `ALREADY_RESPONDED` | Deliverable exchange |
| `MILESTONE_NOT_FOUND` | Deliverable exchange |
| `INCOMPATIBLE_CLUSTERS` | Fast-path operations |
| `GROUP_FULL` | Group funnel mode |
| `AUCTION_CLOSED` | Auction funnel mode |

## Design Decisions

1. **NL as syntactic sugar, not replacement**: NL always generates structured operations underneath. The structured form is always returned so agents can verify. This keeps the protocol deterministic while making it accessible.

2. **Dynamic clusters over predefined**: Predefined clusters were too limiting and required protocol updates for new verticals. Dynamic clusters with namespacing and community-defined norms scale organically.

3. **Unified tool invocation**: Rather than a separate endpoint per tool (which was already getting unwieldy with 6 tools), a single `schelling.tool.invoke` with `tool_id` routing works for any number of tools.

4. **Funnel modes as variants, not new funnels**: The core 4-stage funnel is unchanged. Modes alter which parties evaluate and how stages advance, but the stage machine remains the same infrastructure.

5. **Deliverables as protocol-level, not just contracts**: Tracking delivery + acceptance at the protocol level enables reputation integration, dispute evidence, and milestone tracking. Without it, post-match fulfillment was a black box.

6. **Fast paths as wrappers**: `quick_seek` etc. don't bypass any protocol guarantees. They just compress API calls. Everything they create is fully standard.

## Compatibility Notes

- All v2 → v3 migration guidance from the adversarial review pass is preserved in Appendix B.
- The `schelling.onboard` operation has changed signature (now NL-first instead of cluster_id-first). V2 compatibility layers should detect the presence of `cluster_id` without `natural_language` and route to the old behavior.
- Tool endpoint paths changed from `schelling.tool.personality_embedding` to `schelling.tool.invoke` with `tool_id`. Old paths should redirect.
- New fields added to Profile schema (`funnel_mode`, `group_size`) are optional and backward-compatible.
