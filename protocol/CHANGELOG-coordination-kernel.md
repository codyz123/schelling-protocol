# Coordination Kernel Extensions — Changelog

**Date:** 2026-02-18
**Spec version:** schelling-2.0
**Scope:** 5 new features added to spec-v2.md and implementation-plan.md

---

## Summary

Added 5 features that extend the Schelling Protocol from a matching protocol to a coordination kernel — enabling ongoing agent-to-agent collaboration after the initial match.

| # | Feature | Operations | Stage | Impl Phase |
|---|---------|-----------|-------|------------|
| 1 | Pre-commitment dialogue | `schelling.inquire` (ask/answer/list) | EVALUATED (2) | Phase 16 |
| 2 | Push-based discovery | `schelling.subscribe`, `schelling.unsubscribe`, `schelling.notifications` | Any (auth) | Phase 17 |
| 3 | Agent capabilities | Extension to `schelling.register`, `schelling.update`, `schelling.search` | DISCOVERED (1) | Phase 18 |
| 4 | Structured agreements | `schelling.contract`, `schelling.contract_update` | COMMITTED (4) | Phase 19 |
| 5 | Lifecycle events | `schelling.event` (emit/ack/list) | CONNECTED (5) | Phase 20 |

---

## Changes to spec-v2.md

### §5 Operations
- Updated operation count from 33 to 41
- Added §5.30–5.37 cross-reference to §21 Coordination Kernel Extensions
- Updated `schelling.pending` action types to include: `inquiry_received`, `subscription_match`, `contract_proposed`, `contract_amendment`, `event_received`, `ack_overdue`

### §5.4 schelling.register
- Added `agent_capabilities` optional field: array of `{capability: string, parameters: object?, confidence: float}`
- Added `agent_capabilities` to output fields

### §5.5 schelling.update
- Added `agent_capabilities` to updatable fields (full replacement, not merge)

### §5.6 schelling.search
- Added `capability_filters` input parameter: array of capability strings, conjunctive/AND, prefix matching supported
- Added `agent_capabilities` to candidate output fields (visible at stage 1)

### §13.3 REST Transport
- Added 8 new endpoints: `inquire`, `inquiries`, `subscribe`, `unsubscribe`, `contract`, `contract_update`, `event`, `events`

### §14 Error Codes
- Added 18 new error codes: `QUESTION_TOO_LONG`, `ANSWER_TOO_LONG`, `INQUIRY_NOT_FOUND`, `ALREADY_ANSWERED`, `MAX_SUBSCRIPTIONS_EXCEEDED`, `SUBSCRIPTION_NOT_FOUND`, `CONTRACT_NOT_FOUND`, `CONTRACT_EXPIRED`, `CONTRACT_NOT_PENDING`, `CONTRACT_NOT_ACTIVE`, `CANNOT_RESPOND_OWN_PROPOSAL`, `INVALID_CONTRACT_TYPE`, `INVALID_CONTRACT_ACTION`, `EVENT_NOT_FOUND`, `ACK_DEADLINE_PASSED`, `INVALID_EVENT_TYPE`, `ALREADY_ACKNOWLEDGED`

### §16.3 Rate Limiting
- Added rate limits for all 8 new operations

### §20 Reserved Operations
- Removed `schelling.subscribe` from reserved list (now implemented)

### §21 Coordination Kernel Extensions (existing section, updated)
- Updated max subscriptions from 5 to 10 per user
- Added `capability_filters` to `schelling.subscribe` input fields
- Updated `MAX_SUBSCRIPTIONS` error code description to reflect 10-subscription limit

### §22 Integration Notes (existing section)
- Privacy/visibility matrix includes agent capabilities, inquiry Q&A, contracts, events
- Stage requirements documented per feature
- Data export and deletion cascade specified for all new data types

---

## Changes to implementation-plan.md

### New Phases Added

| Phase | Feature | Complexity | Est. Time | Dependencies |
|-------|---------|-----------|-----------|-------------|
| 16 | Pre-commitment dialogue (`schelling.inquire`) | M | 2–3 days | Phase 1, 2 |
| 17 | Push-based discovery (`schelling.subscribe`) | L | 3–4 days | Phase 1, 2 |
| 18 | Agent capabilities | M | 2 days | Phase 1, 15 |
| 19 | Structured agreements (`schelling.contract`) | L | 3–4 days | Phase 1, 2, 9 |
| 20 | Lifecycle events (`schelling.event`) | M | 2–3 days | Phase 1, 19 |

### New SQL Tables

| Table | Phase | Purpose |
|-------|-------|---------|
| `inquiries` | 16 | Q&A records for candidate pairs |
| `subscriptions` | 17 | Standing discovery queries |
| `subscription_notifications` | 17 | Match notifications from subscriptions |
| `agent_capabilities` | 18 | Normalized capability records for filtering |
| `contracts` | 19 | Structured agreements between parties |
| `contract_amendments` | 19 | Amendment proposals on active contracts |
| `lifecycle_events` | 20 | Milestone/update/completion/issue events |

### New Background Jobs

| Job | Phase | Purpose |
|-----|-------|---------|
| Inquiry expiry sweep | 16 | Mark unanswered questions as expired after 7 days |
| Subscription expiry sweep | 17 | Expire subscriptions past TTL, reset daily notification counters |
| Contract expiry sweep | 19 | Expire proposals past deadline, active contracts past expires_at |
| Event ack check | 20 | Mark events as `ack_overdue`, create reputation events |

### Independence

All 5 features are independently implementable. The only inter-feature dependency is Phase 20 (events) optionally referencing Phase 19 (contracts) for contract-associated events. Each phase includes handler signatures, SQL schemas, and test plans.

---

## Design Principles (consistent across all features)

1. **Server stays dumb.** Stores data, does math, relays JSON blobs. No interpretation of question content, contract terms, or event payloads.
2. **Poll-based architecture preserved.** No push notifications. Notifications via pending actions, retrieved by polling `schelling.pending`.
3. **Privacy by default.** All new data visible only to the two parties in a candidate pair. Included in export, deleted on account deletion.
4. **Reputation integration.** Completed contracts and completion events feed positive signals. Terminated contracts and unacknowledged events feed negative signals.
5. **Rate limiting everywhere.** Every new operation has explicit rate limits to prevent abuse.
