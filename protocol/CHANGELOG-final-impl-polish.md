# CHANGELOG — Final Implementation Plan Polish (2026-02-18)

## Summary

Final polish pass over `implementation-plan.md`, cross-referencing against `spec-v2.md` (all 41 operations, §1–§22).

## Issues Found & Fixed

### 1. Duplicate Phases 16–20 (CRITICAL)
Two versions of each phase existed — a shorter draft and a longer detailed version — from successive editing passes. **Removed the shorter duplicates**, keeping only the detailed versions with full DB schemas, handler signatures, and comprehensive test plans.

### 2. Missing Phase Coverage for `negotiate` and `verify`
- `schelling.negotiate` (§5.18) and `schelling.verify` (§5.19) were listed as "MODIFY" and "REUSE" in the current state table but never explicitly assigned to any phase.
- **Fix:** Added both to Phase 3 (Clustering & Modules) with explicit modification notes — negotiate needs the vertical→cluster context change; verify needs the `VERIFICATION_EXPIRED` error for 7-day-old requests.
- Added as Gap 20 in the Gap Analysis appendix.

### 3. Timeline Table Incomplete
Original timeline only covered Phases 1–12. **Extended to include Phases 13–20** with cumulative estimates. Added coordination kernel subtotals and full implementation estimate (30–37 working days).

### 4. Dependency Graph Missing Phases 13–20
**Extended** the dependency graph to show all phase dependencies for Phases 13–20.

### 5. Migration Execution Order Incomplete
Only listed migrations 001–005. **Extended to 001–011** to cover all phases including coordination kernel.

### 6. File Organization Incomplete
Only listed files from Phases 1–12. **Added** coordination kernel file listing (Phases 13–20) including handlers, core modules, and migration files.

### 7. Rate Limit Inconsistency
Changelog section stated "register: 5/hr" but spec §16.3 says 5/day. **Fixed** to match spec.

### 8. Agent Capability Max Inconsistency
Spec has an internal contradiction: §5.4 says max 50 capabilities, §21.3.2 says max 20. **Noted** in Phase 18 that §5.4 (50) is authoritative as it's in the main operations section.

### 9. Operation Count References
- Gap analysis header said "31 operations" — **updated to 41** (covers §5.1–§5.29 + §4.11 + §21).
- Testing UI test plan said "31 operations" — **updated to 41**.

### 10. Missing REST Endpoint Aliases
Spec §13.3 lists `POST /schelling/inquiries` and `POST /schelling/events` as separate list-action endpoints alongside `schelling.inquire` and `schelling.event`. **Added** these to Phase 16 and Phase 20 transport modifications.

### 11. Global Invariants Expanded
Added invariant #7: all 41 spec operations must have a corresponding implementation phase.

### 12. "Updated" Sections Consolidated
Removed standalone "Updated Dependency Graph", "Updated Timeline", "Updated Migration Execution Order", and "Updated File Organization" sections that duplicated (and potentially conflicted with) the main sections. Content merged into the canonical sections.

## Verification Checklist

| Check | Status |
|---|---|
| All 41 operations have implementation phase | ✅ |
| Phase ordering respects dependencies | ✅ |
| SQL schemas match spec field definitions | ✅ |
| Every phase has test plan | ✅ |
| No duplicate phases | ✅ (was broken, now fixed) |
| Phases sequential 1–20 | ✅ |
| Single coherent changelog | ✅ |
| Algorithm pseudocode correct | ✅ (reviewed cosine sim, bidirectional scoring, reputation, staleness) |
| Deployment/ops sections accurate | ✅ |
| Rate limits match spec §16.3 | ✅ (fixed register rate) |

## Operations Coverage Map

| Operation | Phase |
|---|---|
| schelling.server_info | Phase 3 |
| schelling.intents | Phase 3 |
| schelling.onboard | Phase 3 |
| schelling.register | Phase 1 |
| schelling.update | Phase 5 |
| schelling.refresh | Phase 5 |
| schelling.search | Phase 2 |
| schelling.evaluate | Phase 2 |
| schelling.exchange | Phase 2 |
| schelling.commit | Phase 2 |
| schelling.connections | Phase 2/6 |
| schelling.decline | Phase 4 |
| schelling.reconsider | Phase 4 |
| schelling.withdraw | Phase 10 |
| schelling.message | Phase 6 |
| schelling.messages | Phase 6 |
| schelling.direct | Phase 6 |
| schelling.relay_block | Phase 6 |
| schelling.report | Phase 7 |
| schelling.negotiate | Phase 3 |
| schelling.verify | Phase 3 |
| schelling.reputation | Phase 10 |
| schelling.dispute | Phase 9 |
| schelling.jury_duty | Phase 9 |
| schelling.jury_verdict | Phase 9 |
| schelling.feedback | Phase 7 |
| schelling.my_insights | Phase 7 |
| schelling.analytics | Phase 11 |
| schelling.export | Cross-phase |
| schelling.delete_account | Cross-phase |
| schelling.pending | Phase 6 |
| schelling.group_evaluate | Phase 14 |
| schelling.group_commit | Phase 14 |
| schelling.inquire | Phase 16 |
| schelling.subscribe | Phase 17 |
| schelling.unsubscribe | Phase 17 |
| schelling.notifications | Phase 17 |
| schelling.contract | Phase 19 |
| schelling.contract_update | Phase 19 |
| schelling.event | Phase 20 |
