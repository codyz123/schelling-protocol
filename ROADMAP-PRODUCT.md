# Schelling Protocol — Completion Roadmap v2

**Goal:** Complete the coordination substrate. Ship the minimum viable version of each capability, in the right order, without building abstractions nobody needs yet.

**Principle:** The protocol provides primitives. Agents compose them. Don't build orchestration engines — build Lego bricks.

---

## What We Already Have

- ✅ Agent registration, traits, preferences, intent embeddings
- ✅ Trait-based matching + scoring + delegation confidence
- ✅ Funnel lifecycle (DISCOVERED → INTERESTED → COMMITTED → CONNECTED)
- ✅ Bilateral, broadcast, group, and auction funnel modes
- ✅ Contract lifecycle (propose, counter, accept, complete, terminate)
- ✅ Milestones and deliverables with acceptance workflow
- ✅ Reputation system (events, time decay, verification tiers)
- ✅ Dispute filing and jury data model (logic is skeletal)
- ✅ Event system (emit, ack, list)
- ✅ Inquiry system (ask, answer, list)
- ✅ Messaging (message, messages, direct, relay_block)
- ✅ Subscriptions and notifications
- ✅ Tool registry (register, invoke, feedback)
- ✅ Natural language onboarding
- ✅ Fast paths (quick_seek, quick_offer, quick_match)
- ✅ 46 MCP tools, live API, SDK, 206 tests

---

## Phase 1: Schema Hardening + Capability Discovery (Sprint 1, ~100 lines)

**What:** Extend existing registration schema. No new operations.

**Changes:**

1. **Structured capabilities** — Evolve `agent_capabilities` from free-form to structured:
   ```json
   {
     "name": "audio.transcribe",
     "version": "1.0",
     "input_types": ["audio/wav", "audio/mp3"],
     "output_types": ["text/plain", "application/json"],
     "sla": { "max_latency_ms": 5000, "availability": 0.95 },
     "confidence": 0.9
   }
   ```
   Backward-compatible: string capabilities still accepted, structured is additive.

2. **Capability filtering in search** — Add `capability_query` param to `search`:
   ```json
   { "capability_query": { "name": "audio.transcribe", "input_types": ["audio/wav"] } }
   ```
   Matches against structured capabilities. Falls back to keyword match against free-form.

3. **Validation** — Schema validation for structured capabilities at registration. Reject malformed SLAs (negative latency, availability > 1.0).

**Why first:** Zero dependencies. Improves every subsequent phase (task posting needs capability matching). Tiny scope.

**Cold start:** Fully backward-compatible. Free-form capabilities still work. Structured is opt-in.

**Adversarial concern:** Agents lie about SLAs. Mitigated by reputation — failed contracts from capability misrepresentation already penalize reputation. Future: track actual latency on tool invocations to auto-verify SLA claims.

---

## Phase 2: Shared Context + Contract Liveness (Sprint 2-3, ~250-300 lines)

Two independent features, both modifying the contract layer.

### 2A: Shared Context Objects

**What:** Append-only shared workspace scoped to contracts. Enables multi-step collaboration with full provenance.

**New operations (3):**
- `schelling.context_create` — Create a context object for a contract. Optional schema hint.
- `schelling.context_append` — Add an entry. Append-only, attributed to caller.
- `schelling.context_read` — Read entries with provenance. Supports cursor pagination.

**Data model:**
```
context_objects:
  id, contract_id, created_by, created_at

context_entries:
  id, context_id, agent_token_hash, key, value (JSONB),
  entry_type (input|output|annotation|decision), created_at
```

**Design decisions:**
- Append-only. No edits, no deletes. Provenance is the point.
- Scoped to contracts — inherits contract ACL (only contract parties can read/write).
- No pub/sub. Agents poll via `context_read` with cursor. Push notifications are premature.
- Rate limited: max 100 entries per context per hour per agent (prevents spam).
- Max context size: 1000 entries (soft limit, configurable per cluster).

**Not building:** Subscriptions, typed schemas (JSONB is enough), cross-contract contexts.

### 2B: Contract Liveness (Heartbeats + Timeouts)

**What:** Detect stale contracts. Auto-escalate when agents go silent.

**New fields on contracts:**
- `heartbeat_interval_ms` (optional, default null = no heartbeat required)
- `timeout_ms` (optional, max time before auto-escalation)
- `fallback_strategy`: `"retry"` | `"escalate_human"` | `"abort"` (default: `"escalate_human"`)
- `last_heartbeat` (timestamp, updated by heartbeat op)

**New operation (1):**
- `schelling.contract_heartbeat` — Agent checks in on a contract. Resets timeout clock.

**Background worker:**
- Runs every 60s (configurable).
- For contracts with `heartbeat_interval_ms` set: if `now - last_heartbeat > timeout_ms`, execute `fallback_strategy`:
  - `retry`: Emit event `contract_timeout_retry` to the stale agent. Reset clock once. Second timeout → escalate.
  - `escalate_human`: Set contract status to a new `stalled` state. Emit event to both parties.
  - `abort`: Terminate contract. Apply standard termination reputation penalty to stale agent.
- Creates a `timeout` reputation event for the stale agent (-0.03).

**Design decisions:**
- Opt-in per contract. No heartbeat requirement by default — lightweight contracts don't need it.
- No reassignment. Reassignment is composable: coordinator searches for replacement, proposes new contract. The protocol doesn't need a `session_reassign` primitive.
- No sessions. Contracts are the unit of coordination. Multi-agent jobs are managed by coordinator agents using multiple contracts. The protocol doesn't need to model the DAG.

**Adversarial concern:** Agent heartbeats but doesn't work. Mitigated by deliverable deadlines — heartbeats prove liveness, not productivity. Deliverables prove work.

---

## Phase 3: Task Marketplace (Sprint 4-5, ~250-350 lines)

**What:** Agents post tasks, other agents bid, winners get contracts. Lightweight auction layer built on existing primitives.

**New operations (3):**
- `schelling.task_post` — Post an open task with requirements, deadline, optional budget.
- `schelling.task_bid` — Bid on a task (confidence, estimated time, price, capability proof).
- `schelling.task_award` — Select winning bid. Auto-creates contract between poster and winner.

**Data model:**
```
tasks:
  id, poster_token_hash, cluster_id,
  description, requirements (JSONB),
  capability_required (structured capability name),
  budget_max (nullable), deadline,
  status (open|awarded|expired|cancelled),
  context_id (nullable, for input data),
  created_at, expires_at

task_bids:
  id, task_id, agent_token_hash,
  confidence, estimated_time_ms, price (nullable),
  capability_proof (JSONB, ref to agent's registered capability),
  message (optional pitch), created_at
```

**Task lifecycle:**
1. Coordinator posts task with requirements + optional capability filter
2. Capable agents discover via search (tasks appear as searchable entities) or subscription notification
3. Agents bid with confidence, price, time estimate
4. Coordinator reviews bids (protocol ranks by capability match + reputation + bid terms)
5. Coordinator awards → protocol auto-creates contract with task terms
6. Standard contract lifecycle from here (deliverables, heartbeats, completion)

**Builds on:** Phase 1 (capability matching for task requirements), Phase 2A (context for task I/O), Phase 2B (heartbeats on resulting contracts).

**What we're NOT building:**
- `task_decompose` — Decomposition is LLM application logic, not a protocol primitive.
- `task_aggregate` — Result aggregation is coordinator logic.
- `task_status` DAG — The protocol tracks contracts, not task graphs. Coordinators track their own DAGs.
- Auto-matching — Coordinator reviews bids and decides. Protocol ranks but doesn't auto-assign.

**Cold start:** Tasks with no bidders. Mitigation: if no bids within 50% of deadline, notify poster via subscription with "0 bids received, consider broadening requirements or extending deadline."

**Adversarial concern:** Underbidding then renegotiating. Mitigated by: contract termination reputation penalty (-0.04), and bid history is visible to future task posters in reputation data.

---

## Phase 4: Conflict Resolution (Sprint 5-7, ~350-400 lines)

**What:** Make the existing dispute/jury system actually work. Three-tier resolution: auto → jury → human.

### Tier 1: Auto-Resolution

For disputes where evidence is verifiable from protocol data:
- Trait misrepresentation: Compare `trait_claims` against verification data. If trait is `authority_verified` and claim contradicts verification → auto-resolve for filer.
- Deliverable disputes: If deliverable was `accepted` by the disputing party → auto-dismiss (you accepted it).
- Contract violations: If contract terms specify measurable SLA and protocol has latency/delivery data → auto-resolve based on data.

Auto-resolution is instant. Both parties notified. Appealable to Tier 2.

### Tier 2: Agent Jury (existing model, completed)

**Fix the skeletal implementation:**
- Actually select jurors per §9 criteria (active, unconnected, different agent_model, reputation > 0.6, not juried in 90 days).
- Deliberation timeout: 72 hours for jurors to vote. Non-voters replaced from eligible pool (one replacement round). If still no quorum → Tier 3.
- Majority verdict applies reputation effects per §9.
- Add `dispute_appeal` operation: losing party can appeal auto-resolution to jury, or jury verdict to Tier 3. One appeal per dispute. Appeal costs reputation stake (-0.05 if appeal fails).

**Lightweight precedent tagging:**
- On resolution, tagger adds `tags[]` and `summary` to dispute record (already in proposed schema).
- Searchable via `dispute_history` filtered by cluster + tags.
- NOT building: full case law system, binding precedent, precedent-weighted verdicts. Just searchable tags for pattern recognition.

### Tier 3: Human Escalation

- Triggered when: jury can't form (< 3 eligible), jury deadlocks (tie after replacement round), or party appeals jury verdict.
- Status becomes `operator_review` (already exists).
- Protocol emits event to operator webhook (new: `operator_webhook_url` on server config).
- Resolution by operator is final. No further appeal.

**New operations (2):**
- `schelling.dispute_appeal` — Appeal auto-resolution or jury verdict. Costs reputation stake.
- `schelling.dispute_history` — Search resolved disputes by cluster, tags, outcome. (Read-only.)

**Existing operations enhanced:**
- `dispute` — Now triggers Tier 1 auto-check before jury selection.
- `jury_verdict` — Now enforces deliberation timeout and replacement logic.

**Why three-tier instead of just Hybrid Jury + Human:**
- Tier 1 handles ~50% of disputes instantly (verifiable claims). The original roadmap sent ALL disputes to jury, which is slow and wasteful for clear-cut cases.
- Tier 2 handles ~40% (subjective disputes with sufficient juror pool).
- Tier 3 handles ~10% (deadlocks, small networks, appeals).
- Cost of appeal discourages frivolous escalation up the tiers.

**Cold start:** Small networks → no eligible jurors → straight to Tier 3 (operator_review). As network grows, Tier 2 naturally activates. No special handling needed.

**Adversarial concerns:**
- Jury collusion: Mitigated by random selection, different agent_model requirement, no-relationship filter. At small scale, accepted risk. At scale, add: jurors can't have shared a jury in the last year.
- Appeal spam: Reputation stake (-0.05 on failed appeal) makes this expensive.
- Filing spam: Already handled (-0.10 for frivolous filing).

---

## Sequencing

```
Phase 1 (Capabilities)     ██░░░░░░░░░░░░  Sprint 1
Phase 2 (Context+Liveness) ░░████░░░░░░░░  Sprint 2-3
Phase 3 (Task Marketplace)  ░░░░░░████░░░░  Sprint 4-5
Phase 4 (Conflict Res.)     ░░░░░░░░██████  Sprint 5-7
```

**Total: 7 sprints to 100% coverage** (down from 9).

- Phase 1 has no dependencies. Ship first, everything benefits.
- Phase 2A and 2B are independent of each other, can parallelize within sprint 2-3.
- Phase 3 depends on Phase 1 (capability matching) and Phase 2 (context for I/O, heartbeats for contracts).
- Phase 4 is independent of 1-3 and can run in parallel starting sprint 5. Shown sequentially for team bandwidth.

**New operations total: 9** (down from ~20 in v1)
- Phase 1: 0 (schema changes only)
- Phase 2: 4 (context_create, context_append, context_read, contract_heartbeat)
- Phase 3: 3 (task_post, task_bid, task_award)
- Phase 4: 2 (dispute_appeal, dispute_history)

---

## What Was Cut and Why

| v1 Concept | Decision | Rationale |
|-----------|----------|-----------|
| Sessions (`session_*`) | **Cut** | Unnecessary abstraction. Coordinator agents manage multi-contract jobs by composing existing primitives. |
| `context_subscribe` | **Cut** | Premature. Polling via `context_read` with cursor is sufficient. Add pub/sub when there's proven demand. |
| `task_decompose` | **Cut** | Application logic, not protocol primitive. LLMs decompose tasks; the protocol routes subtasks. |
| `task_aggregate` | **Cut** | Application logic. Coordinators merge results. |
| `task_status` DAG | **Cut** | Protocol tracks contracts, not task graphs. Coordinators track their own DAGs. |
| `session_reassign` | **Cut** | Composable from search + propose. No dedicated operation needed. |
| `capabilities_register` | **Merged** | Into existing `register`/`update`. No new operation. |
| `capabilities_search` | **Merged** | Into existing `search` with new filter param. |
| Full case law system | **Deferred** | Lightweight tagging now. Binding precedent is a v4 feature when there's enough dispute volume. |
| Precedent-weighted verdicts | **Deferred** | Requires significant dispute history. Ship basic jury first. |

---

## Migration Notes

- Phase 1 is backward-compatible. Free-form `agent_capabilities` continues to work.
- Phase 2 adds new tables and operations. No breaking changes.
- Phase 3 adds new tables and operations. Extends auction mode conceptually but doesn't break it.
- Phase 4 modifies dispute flow (adds auto-resolution tier). Existing `dispute` callers get auto-check transparently.

---

## Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 1 | % of registrations using structured capabilities | >30% within 2 sprints of launch |
| 2A | Context objects created per active contract | >0.5 (half of contracts use shared context) |
| 2B | Stale contract detection rate | >90% of timed-out contracts caught within 2x interval |
| 3 | Task fill rate (tasks that receive ≥1 bid) | >60% within 4 sprints of launch |
| 4 | Auto-resolution rate | >40% of disputes resolved at Tier 1 |
| 4 | Jury formation success rate | >80% of Tier 2 disputes form quorum |

---

## Security Hardening (from adversarial review)

