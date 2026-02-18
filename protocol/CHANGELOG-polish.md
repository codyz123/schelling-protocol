# Changelog — Polish Pass

**Date:** 2026-02-18
**Scope:** Clarifications, consistency fixes, missing edge cases. No new features or scope.
**Documents modified:** `spec-v2.md`, `implementation-plan.md`

---

## Consistency Fixes

### 1. Feedback quality scoring weights mismatch (§18.6 vs §8.4)
**Category:** consistency
**File:** `spec-v2.md` §18.6
**Problem:** §8.4 defines 4 factors for feedback quality (completeness 0.20, consistency 0.30, specificity 0.20, behavioral coherence 0.30) but §18.6 defined only 3 factors with different weights (completeness 0.30, consistency 0.40, specificity 0.30), missing behavioral coherence entirely. §8.4 was updated during the adversarial fix pass; §18.6 was not.
**Fix:** Updated §18.6 to match §8.4's 4-factor model with correct weights. Added cross-reference and note about discount for low-quality feedback.

### 2. intent_embedding marked Required but backward compat says "if omitted"
**Category:** consistency
**File:** `spec-v2.md` §5.4
**Problem:** The `intent_embedding` field in `schelling.register` was marked `Required: Yes` but the description said "For backward compatibility, if omitted..." — a direct contradiction.
**Fix:** Changed to `Required: Conditional` and clarified "Required for new registrations" with the backward compat exception applying only to v1 agent migration.

### 3. relay-block.ts misplaced in Phase 5 instead of Phase 6
**Category:** structural
**File:** `implementation-plan.md`
**Problem:** `relay-block.ts` handler was listed under Phase 5 (Profile Update) but is a conversation feature belonging in Phase 6 (Message Relay). Phase 5's test plan and definition of done also included relay-block tests.
**Fix:** Moved relay-block.ts to Phase 6 new files, moved tests/DoD items to Phase 6, updated Phase 6 transport tools (3→4 endpoints), updated file organization tree.

### 4. Trait similarity mapping formula not shown
**Category:** clarity
**File:** `spec-v2.md` §17.2
**Problem:** §17.3 shows the cosine-to-[0,1] mapping formula for intent similarity (`(cosine + 1) / 2`) but the trait similarity component in §17.2 only said "mapped from [-1, 1] to [0, 1]" without the formula.
**Fix:** Added explicit `(cosine + 1) / 2` formula reference to the trait similarity row, with cross-reference to §17.3.

### 5. REST transport table missing /health endpoint
**Category:** consistency
**File:** `spec-v2.md` §13.3
**Problem:** The `GET /health` endpoint is mentioned in text and referenced by the testing-ui-spec but was not listed in the REST endpoint table.
**Fix:** Added `(health check) | GET /health` row to the table.

---

## Missing Error Codes in Operation Definitions

### 6. schelling.reconsider missing PERMANENT_DECLINE
**Category:** edge case
**File:** `spec-v2.md` §5.12
**Problem:** §5.11 text says `schelling.reconsider` returns `PERMANENT_DECLINE` for permanent declines, but §5.12's error code list didn't include it. An implementer reading only §5.12 would miss this case.
**Fix:** Added `PERMANENT_DECLINE` to error codes list and added behavior note explaining the condition.

### 7. schelling.search missing USER_PAUSED
**Category:** edge case
**File:** `spec-v2.md` §5.6
**Problem:** The `USER_PAUSED` error code exists in §14 but wasn't listed under search's error codes. No guidance on what happens when a paused user tries to search.
**Fix:** Added `USER_PAUSED` to error codes. Added "Caller status check" paragraph explaining that paused users cannot search.

### 8. schelling.verify missing VERIFICATION_EXPIRED
**Category:** edge case
**File:** `spec-v2.md` §5.19
**Problem:** Verify requests expire after 7 days per the spec text, and `VERIFICATION_EXPIRED` is defined in §14, but the error code wasn't listed in the operation's error codes or behavior.
**Fix:** Added `VERIFICATION_EXPIRED` to error codes. Updated provide behavior to note the error for expired requests.

---

## Edge Case Coverage

### 9. Decline output missing repeat_count
**Category:** edge case
**File:** `spec-v2.md` §5.11
**Problem:** The escalating decline system (1st→2nd→permanent) exists but agents had no way to know the current repeat count. An agent couldn't warn a user "this is your 2nd decline of this person — one more is permanent."
**Fix:** Added `repeat_count` (integer) to decline output fields. Also clarified `expires_at` as `string or null` (null for permanent).

### 10. Commit mutual_no_identity doesn't create pending action
**Category:** edge case
**File:** `spec-v2.md` §5.9
**Problem:** When `schelling.commit` returns `"mutual_no_identity"` (both committed but one lacks identity data), there was no mechanism to notify the party missing identity data.
**Fix:** Added note that the server creates a `provide_identity` pending action for the party missing identity data. Added `provide_identity` and `mutual_gate_expired` to the pending action types in §5.29.

### 11. Consistency scoring thresholds unclear
**Category:** clarity
**File:** `spec-v2.md` §9.5
**Problem:** Two different thresholds are mentioned — 5 outcome events to compute consistency, 10 outcome events for the reputation penalty — but they appeared in different paragraphs without clear distinction, making them easy to confuse.
**Fix:** Consolidated into a labeled "Minimum data thresholds" paragraph that explicitly distinguishes the two thresholds and their rationale.

---

## Clarity Improvements

### 12. Score quantization at DISCOVERED not reflected in search output
**Category:** clarity
**File:** `spec-v2.md` §5.6
**Problem:** §12.2 says DISCOVERED-stage scores are "quantized to 2 decimal places" but the search output field descriptions didn't mention this. An implementer could return full-precision scores at DISCOVERED.
**Fix:** Added quantization notes to `your_fit`, `their_fit`, `combined_score`, and `intent_similarity` output field descriptions with cross-reference to §12.2.

### 13. Cluster config missing mutual_gate_timeout_days
**Category:** consistency
**File:** `spec-v2.md` §4.6
**Problem:** §5.8 introduces `mutual_gate_timeout_days` as "configurable per cluster" but the field wasn't listed in the cluster configuration table (§4.6).
**Fix:** Added `mutual_gate_timeout_days` (integer, optional, default 30) to the cluster configuration fields table.

---

## Summary

| Category | Count |
|---|---|
| Consistency | 5 |
| Edge case | 5 |
| Clarity | 3 |
| **Total** | **13** |

All fixes are purely corrective — no new features, operations, fields (beyond output-only `repeat_count`), or architectural changes were introduced. The `repeat_count` output field and `provide_identity`/`mutual_gate_expired` pending action types surface information that was already computed or implied by the spec but not exposed to agents.
