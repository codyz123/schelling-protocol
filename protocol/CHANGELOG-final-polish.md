# Final Polish Pass — Changelog

**Date:** 2026-02-18

## spec-v2.md Changes

### Consistency fixes

1. **Operation count**: Changed "41 operations" → "40 operations" in §5 header. Actual count: 40 distinct operations (REST aliases `inquiries` and `events` are action modes of `inquire` and `event`, not separate operations).

2. **Pending action type names**: §5.29 used names inconsistent with §22.6. Fixed to match §22.6 canonical names: `inquiry_received` → `new_inquiry`, `contract_proposed` → `new_contract`, `event_received` → `new_event`, `ack_overdue` → `event_ack_required`.

3. **Error code names**: Standardized across §14, operation definitions, and §22.5:
   - `MAX_SUBSCRIPTIONS_EXCEEDED` → `MAX_SUBSCRIPTIONS` (§14 aligned with §21.2.2 and §22.5)
   - `ALREADY_ACKNOWLEDGED` → `EVENT_ALREADY_ACKED` (§14 aligned with §21.5.2 and §22.5)

4. **Rate limit contradiction**: `schelling.contract_update` was "5 per contract per 24 hours" in §16.3 but "20 per hour" in §22.4. Aligned §22.4 to §16.3's more specific limit (5/contract/24h).

5. **Agent capabilities max count**: §5.4 said "Max 50 capabilities" but §21.3.2 said "Maximum 20 capabilities." Fixed §5.4 to 20 (§21.3 is the authoritative definition).

6. **Rate limit table entry**: Changed `schelling.inquiries` (not a real operation) to `schelling.inquire (answer/list)` in §16.3.

### Completeness fixes

7. **REST endpoint table** (§13.3): Added missing entries for `schelling.group_evaluate`, `schelling.group_commit`, and `schelling.notifications`.

8. **Error codes — missing from §14**: Added `CONTRACT_ALREADY_TERMINAL` to the main error code table (was in §22.5 and referenced by `schelling.contract` but absent from §14).

9. **Error codes — unreferenced codes now referenced**:
   - `JUROR_REPLACED`: Added to `schelling.jury_verdict` error codes.
   - `QUESTION_TOO_LONG` / `ANSWER_TOO_LONG`: Added to `schelling.inquire` error codes.
   - `INVALID_EVENT_TYPE`: Added to `schelling.event` error codes.
   - `INVALID_CONTRACT_TYPE`: Added to `schelling.contract` error codes.

10. **Rate limits — missing operations**: Added `schelling.group_evaluate` (20/hr), `schelling.group_commit` (10/hr), and `schelling.notifications` (50/hr) to §16.3.

11. **Privacy section** (§12.2): Added cross-reference to §22.2 for visibility of coordination kernel data types (inquiries, agent capabilities, contracts, events, subscriptions).

### Duplicate/contradictory content

12. **Duplicate roommates description**: Removed redundant "Updated" roommates cluster description at the end of §4.11 (identical content already in §4.9).

13. **§22.5 duplicate error code definitions**: Replaced full duplicate table with a reference to §14 (the canonical error code table) plus a list of coordination-kernel-specific codes.

14. **§22.3 duplicate REST entry**: Removed `schelling.notifications` from §22.3's supplementary table (now in the main §13.3 table).

## intent-embedding-spec.md

No changes needed. Centroid vectors match §4.3 of main spec. Dimension definitions are consistent. Version identifier (`intent-schelling-1.0`) is correctly referenced.

## embedding-spec.md

No changes needed. 50-dimensional schema matches §6.1 of main spec. Dimension names and indices align. Version identifier (`schelling-1.0`) is correctly referenced.
