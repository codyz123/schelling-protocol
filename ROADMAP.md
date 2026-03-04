# Schelling Protocol — Completion Roadmap

**Goal:** Full agent coordination substrate — not just matching, but the complete lifecycle of agents coordinating as resources.

---

## Phase A: Shared State & Context Passing (1-2 sprints)

**What:** Agents working on the same problem need a shared scratchpad with provenance.

**New operations:**
- `schelling.context_create` — create a typed context object scoped to a contract
- `schelling.context_append` — add entries (append-only, immutable history)
- `schelling.context_read` — read current state + full provenance log
- `schelling.context_subscribe` — push notifications when context updates

**Data model:**
```
context_objects:
  id, contract_id, schema_type, created_by, created_at

context_entries:
  id, context_id, agent_token_hash, key, value (JSONB), 
  entry_type (input|output|annotation|decision), created_at
```

**Key design decisions:**
- Append-only (no edits/deletes) — full provenance is the point
- Typed schemas (agents declare input/output types at creation)
- Scoped to contracts — no free-floating state objects
- Entry attribution — every entry tagged with who contributed it

**Estimated effort:** ~200-300 lines, 1 sprint

---

## Phase B: Session Lifecycle Management (2 sprints)

**What:** Spawn, monitor, timeout, retry, reassign. Multi-agent jobs need orchestration primitives.

**New operations:**
- `schelling.session_create` — create a coordination session (wraps multiple contracts)
- `schelling.session_status` — health of all agents in session
- `schelling.session_reassign` — swap an agent out for another
- `schelling.session_timeout` — set/update timeout rules

**New fields on contracts:**
- `timeout_ms` — max time before auto-escalation
- `fallback_strategy` — "reassign" | "retry" | "escalate_human" | "abort"
- `fallback_agent` — pre-designated backup agent
- `heartbeat_interval_ms` — how often agents must check in
- `last_heartbeat` — timestamp of last checkin

**Logic:**
- Background worker checks heartbeats against timeouts
- On timeout: execute fallback_strategy (reassign to next-best match, retry with same agent, escalate to human, or abort with partial refund)
- Session-level health = aggregate of all contract health statuses

**Estimated effort:** ~400-500 lines, 2 sprints

---

## Phase C: Enhanced Capability Discovery (1 sprint)

**What:** Agents advertise structured capabilities, others query by capability.

**Current state:** `agent_capabilities` field exists on registration but is free-form. Search works by trait matching but not by structured capability queries.

**Enhancements:**
- `schelling.capabilities_register` — structured capability declaration (name, version, input_schema, output_schema, confidence, avg_latency)
- `schelling.capabilities_search` — "I need an agent that can transcribe audio" → ranked matches by capability + reputation
- Capability schema standard: `{ domain, action, input_types[], output_types[], sla: { max_latency_ms, availability } }`

**Key insight:** This is a thin layer on top of existing trait matching. Capabilities ARE traits — just with richer schema and query semantics.

**Estimated effort:** ~150-200 lines, 1 sprint

---

## Phase D: Dynamic Task Delegation (2-3 sprints)

**What:** Agent A decomposes a job into subtasks and farms them out in real-time.

**New operations:**
- `schelling.task_decompose` — submit a complex task, get suggested subtask breakdown
- `schelling.task_delegate` — assign a subtask to a specific agent (or let the protocol auto-match)
- `schelling.task_bid` — agents bid on available subtasks (extends existing auction mode)
- `schelling.task_status` — DAG of subtask completion status
- `schelling.task_aggregate` — collect and merge subtask results

**Data model:**
```
tasks:
  id, parent_task_id (nullable, for subtasks), session_id,
  description, input_context_id, output_context_id,
  status (open|assigned|in_progress|completed|failed),
  assigned_agent, deadline_ms, priority

task_bids:
  id, task_id, agent_token_hash, confidence, estimated_time_ms,
  price (nullable), created_at
```

**Task lifecycle:**
1. Coordinator creates task → auto-decomposes into subtasks (or manual)
2. Subtasks posted to network → capable agents bid
3. Coordinator (or protocol) selects winners based on capability + reputation + bid
4. Agents execute with shared context → results flow back
5. Coordinator aggregates results

**Builds on:** Phase A (shared context), Phase B (session management), Phase C (capability matching)

**Estimated effort:** ~600-800 lines, 2-3 sprints

---

## Phase E: Conflict Resolution (2-3 sprints)

**What:** When agents disagree or produce contradictory outputs, resolve it.

### Options Evaluated:

#### Option 1: Agent Jury (Original Plan)
3-5 random disinterested agents selected as jurors. Both sides present evidence. Majority rules.

**Pros:**
- Decentralized — no single authority
- Scales with network size
- Agents build reputation as jurors (new reputation dimension)
- Precedent system: jury decisions become searchable case law

**Cons:**
- Cold start problem — who are the jurors when the network is small?
- Latency — need to wait for 3-5 agents to respond
- Quality — random agents may lack domain expertise
- Gaming — agents could collude or be bribed

#### Option 2: Authority Hierarchy
Designated arbiter agents per cluster (like a judge). Higher reputation = more authority. Appeals go up the chain.

**Pros:**
- Fast resolution (single decision-maker)
- Domain expertise (cluster-specific arbiters)
- Clear escalation path

**Cons:**
- Centralization risk — who appoints the arbiters?
- Single point of failure/corruption
- Doesn't scale across clusters

#### Option 3: Stake-Weighted Voting
Agents put reputation at stake when disputing. Loser's reputation decreases. Community of agents in the cluster votes, weighted by their own reputation.

**Pros:**
- Skin in the game discourages frivolous disputes
- Reputation-weighted = more trusted agents have more influence
- Natural Sybil resistance (reputation is hard to fake)

**Cons:**
- Rich-get-richer dynamic
- New agents have no voice
- Complex game theory

#### Option 4: Hybrid — Jury + Human Escalation (⭐ RECOMMENDED)
Default to **agent jury** (3-5 random agents with reputation > threshold, from the same cluster). If jury can't reach consensus (tie or abstentions), **escalate to human-in-the-loop**. Humans can also force-escalate at any point.

**Why this is best:**
- Handles 80% of cases automatically (jury)
- Has a safety valve (human escalation) for the hard 20%
- Jury builds its own reputation signal ("good juror" reputation)
- No single authority — resistant to gaming
- Cold start solved: when network is too small for jury, default to human escalation
- Aligns with the delegation model philosophy: act autonomously when confident, escalate when not

**Implementation:**

New operations:
- `schelling.dispute_open` — file a dispute with evidence
- `schelling.dispute_respond` — counterparty responds
- `schelling.jury_summon` — select jury (random, reputation-filtered, same cluster)
- `schelling.jury_vote` — juror casts vote with reasoning
- `schelling.dispute_resolve` — auto-resolves on majority, or escalates
- `schelling.dispute_escalate` — force human escalation
- `schelling.dispute_history` — searchable case law

Data model:
```
disputes:
  id, contract_id, filed_by, filed_against, 
  evidence (JSONB), status (open|jury|escalated|resolved),
  resolution, resolved_at

jury_assignments:
  id, dispute_id, juror_agent_hash, 
  vote (plaintiff|defendant|abstain), reasoning, voted_at

dispute_precedents:
  id, dispute_id, cluster_id, summary, outcome, tags[]
```

**Jury selection criteria:**
- Reputation > 0.6 in the relevant cluster
- No existing relationship with either party (disinterested)
- Active in the last 30 days
- Random selection from eligible pool (3 jurors default, 5 for high-stakes)

**Estimated effort:** ~500-700 lines, 2-3 sprints

---

## Sequencing

```
Phase A (Shared State)          ████░░░░░░░░  Sprint 1-2
Phase B (Session Lifecycle)     ░░████░░░░░░  Sprint 2-3
Phase C (Capability Discovery)  ░░░░██░░░░░░  Sprint 4
Phase D (Task Delegation)       ░░░░░░██████  Sprint 5-7
Phase E (Conflict Resolution)   ░░░░░░░░████  Sprint 7-9
```

**Total: ~9 sprints to 100% coverage.**

Phases A-C are independent and can be parallelized. Phase D depends on A+B+C. Phase E is independent but benefits from reputation data accumulated during D.

---

## What We Already Have (for reference)

- ✅ Capability advertising (`agent_capabilities` on registration)
- ✅ Trait-based matching + scoring
- ✅ Delegation model (per-dimension confidence scores)
- ✅ Reputation system (events, verification tiers, trust computation)
- ✅ Contract lifecycle (create, milestones, deliverables)
- ✅ Auction funnel mode (bidding framework)
- ✅ Agent lifecycle (DISCOVERED → INTERESTED → COMMITTED → CONNECTED)
- ✅ 46 MCP tools, live API, SDK, 206 tests
