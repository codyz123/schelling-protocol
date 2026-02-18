# Changelog: User Journey Fixes

**Date:** 2026-02-18
**Triggered by:** User journey analysis (`user-journeys.md`) identifying 3 critical issues

---

## Fix 1: Peer Roles in Talent Cluster (Issue: Forced Asymmetry)

**Problem:** The talent cluster forced `employer`/`candidate` roles, making co-founder search impossible — two people both seeking a co-founder would both register as `employer` and never see each other.

**Solution:** Added `peer_roles` concept to cluster role configuration. A peer role enables same-role matching within an otherwise asymmetric cluster. The talent cluster now has three roles: `employer`, `candidate`, and `peer`.

**Files changed:**
- `spec-v2.md` §4.5 (roles): Added `peer_roles` field to role configuration table. Expanded role search behavior documentation.
- `spec-v2.md` §4.6 (cluster config): Added `peer_roles` field.
- `spec-v2.md` §4.9 (talent description): Updated to mention peer role.
- `spec-v2.md` §4.10 (adding clusters): Relaxed "exactly two roles" to "at least two complementary roles, optionally peer roles."
- `spec-v2.md` §5.6 (search filtering): Added peer role exception to complementary-role filtering.
- `intent-embedding-spec.md` (talent centroid): Added peer role guidance table showing how co-founder intent embeddings differ from the hiring centroid.
- `implementation-plan.md`: Added Phase 13.

**Design notes:** Minimal change — one new field (`peer_roles`) on cluster config, one new role on talent cluster, one rule change in search. Peer users are invisible to complementary-role searches and vice versa, creating clean separation.

---

## Fix 2: Multi-Party Group Formation (Issue: Pair-Only Matching)

**Problem:** The roommates cluster only supported size-2 groups, but real roommate situations need 3–4+ compatible people. Pairwise matching alone can't ensure group compatibility.

**Solution:** Added `§4.11 Multi-Party Group Formation` with two new operations (`schelling.group_evaluate`, `schelling.group_commit`) and per-cluster `group_size` configuration. Server stays dumb — it computes pairwise scores and stores group membership. Agents handle combinatorial optimization.

**Files changed:**
- `spec-v2.md` §1.1: Updated "group-ready architecture" principle from future tense to present.
- `spec-v2.md` §2: Updated `Group` and `Candidate pair` terminology definitions.
- `spec-v2.md` §4.9 (roommates): Updated to reference multi-party, group size 2–6.
- `spec-v2.md` §4.11: New section — full multi-party specification including:
  - Cluster config fields (`group_size`, `group_min_pairwise`)
  - `schelling.group_evaluate` operation (pairwise matrix)
  - `schelling.group_commit` operation (propose/join/complete groups)
  - Agent coordination pattern (worked example)
- `spec-v2.md` §5: Updated operation count from 31 to 33.
- `implementation-plan.md`: Added Phase 14.

**Design notes:** 
- Server does only pairwise math (N*(N-1)/2 comparisons) — no group optimization.
- `group_min_pairwise` threshold ensures no weak pair within a group.
- All members must independently commit (no one is added without consent).
- Groups dissolve if membership drops below minimum.
- Existing pair-only clusters unaffected (`group_size: {min:2, max:2}` is the default).

---

## Fix 3: Structured Attributes & Hard Filters (Issue: Categorical Needs)

**Problem:** "Mandarin-speaking estate attorney in Denver" requires exact categorical matching, not fuzzy embedding similarity. The protocol had no mechanism for structured, filterable attributes beyond basic deal-breakers.

**Solution:** Added `structured_attributes` field to registration (arbitrary key-value pairs) and `hard_filters`/`soft_filters` to search. Server performs exact string matching — no NLP. Filters narrow the candidate set, then embedding similarity ranks within it.

**Files changed:**
- `spec-v2.md` §4.8: Expanded to "Deal-Breaker Configuration & Structured Attribute Filtering." Added full structured attributes specification including recommended attribute keys, conventions, and integration with `schelling.onboard`.
- `spec-v2.md` §5.4 (register): Added `structured_attributes` input field.
- `spec-v2.md` §5.5 (update): Added `structured_attributes` to updatable fields.
- `spec-v2.md` §5.6 (search): Added `hard_filters` and `soft_filters` input fields. Added `structured_attributes` to candidate output. Added filtering rule (applied before scoring).
- `implementation-plan.md`: Added Phase 15. Note: Phase 1 schema already included `structured_attributes` column.

**Design notes:**
- Server stays dumb: exact string equality only. Agents responsible for canonical values.
- Hard filters are conjunctive (AND): all must match. Soft filters are scoring bonuses (+0.05/match, capped +0.15).
- Structured attributes visible at stage 1 (DISCOVERED) — enables early filtering without waiting for profile exchange.
- Recommended attribute key conventions provided but not enforced — agents converge on standards via `schelling.onboard`.

---

## Consistency Check

Verified across all spec files after applying fixes:

1. **spec-v2.md** — All cross-references consistent. §4.5 ↔ §4.6 ↔ §4.9 ↔ §4.10 ↔ §4.11 ↔ §5.6 all agree on peer roles, group sizes, and structured attributes.
2. **intent-embedding-spec.md** — Talent centroid section updated with peer role guidance. Centroid values unchanged (peer users still land near talent centroid via cosine similarity).
3. **embedding-spec.md** — No changes needed (personality embedding is orthogonal to all three fixes).
4. **implementation-plan.md** — Phases 13–15 added with correct dependency references. Phase 1 already included `structured_attributes` column in schema migration.
5. **user-journeys.md** — Not modified (analysis document, not spec). All three critical issues identified there are now addressed.
