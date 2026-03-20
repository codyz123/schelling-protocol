# Adversarial Review — Schelling Protocol v4 Submission Layer

Date: 2026-03-19
Scope reviewed:
- `DESIGN-v4-submissions.md`
- `DESIGN-v4-analysis.md`
- `003_v4_submissions.sql`
- `submit.ts`
- `match.ts`
- `market-insights.ts`
- `tool-marketplace.ts`
- `v4-submissions.test.ts`

## Executive Verdict
This implementation is **not production-safe for trust infrastructure**. There are critical security and correctness failures that allow abuse, violate core spec behavior, and create false confidence via weak tests.

Top blockers:
1. **Required tools are computed but never enforced** (`match.ts:268-287`, `match.ts:295`) so mandatory disclosure gates are bypassed.
2. **Auth key hashing deviates from spec** (SHA-256 instead of bcrypt), making key compromise materially worse (`submit.ts:36-38`, spec `DESIGN-v4-submissions.md:28`).
3. **Cross-match math does not implement the spec algorithm** (`match.ts:261-263` vs `DESIGN-v4-submissions.md:221-227`).
4. **No anti-abuse/rate-limit hooks in these handlers**, enabling Sybil/spam/pollution attacks called out in the design analysis (`DESIGN-v4-analysis.md:155-186`).
5. **Tests miss critical invariants and include weak/invalid assertions** (`v4-submissions.test.ts:582-623`).

---

## 1. Security Issues

### Critical
- **Required-tool gate bypass in matching**
  - Evidence: `requiredToolsMet` is computed (`match.ts:268-287`) and then ignored; candidate inclusion depends only on composite score (`match.ts:295`).
  - Impact: malicious agents can be surfaced to candidates despite failing mandatory structured data requirements.
  - Exploit: publish high-similarity embeddings, omit required compliance tools, still enter candidate pools.

- **No rate limiting / anti-spam controls in v4 handlers**
  - Evidence: no submission/match/insight/tool throttle checks in `submit.ts`, `match.ts`, `market-insights.ts`, `tool-marketplace.ts`.
  - Impact: embedding pollution, market probing, and brute-force map extraction are trivial.
  - Matches threat model in analysis: `DESIGN-v4-analysis.md:155-176`.

### High
- **API key hashing is weak relative to spec**
  - Evidence: `createHash("sha256")` in `submit.ts:36-38`; spec calls for bcrypt hash (`DESIGN-v4-submissions.md:28`).
  - Impact: offline cracking risk rises sharply if DB leaks; unsalted fast hash is insufficient for bearer secrets.

- **Credential accepted in request params (`agent_api_key`)**
  - Evidence: `extractApiKey` prioritizes body field (`submit.ts:53-57`), same pattern in other handlers.
  - Impact: accidental key leakage through logs/telemetry/request capture.

- **Resource exhaustion vectors (unbounded payload sizes)**
  - Evidence: no length/size caps on `intent_text`, `tags`, `structured_data`, `schema`.
  - Impact: DB bloat and CPU/memory DoS via huge JSON payloads.

### Medium
- **Unhandled JSON parse can crash handlers**
  - Evidence: direct `JSON.parse(...)` without guards throughout `match.ts`, `market-insights.ts`, `tool-marketplace.ts`, `submit.ts:list`.
  - Impact: malformed row can trigger runtime exceptions and endpoint instability.

- **Tool recommendation silently downgrades to anonymous behavior when auth/submission lookup fails**
  - Evidence: `handleToolRecommend` skips errors if submission_id provided but auth invalid (`tool-marketplace.ts:267-287`).
  - Impact: confusing behavior and potential probing surface.

---

## 2. Correctness Bugs

### Critical
- **Spec scoring formula not implemented**
  - Spec: directional weighted cross-score with `w_ab`, `w_ba` (`DESIGN-v4-submissions.md:221-227`).
  - Code: simple average `(simAB + simBA)/2` when either offer exists (`match.ts:261-263`), no per-direction weights.

- **Thresholding applied to composite, not cross-score as spec candidate filter step**
  - Spec step 2: filter by `cross_score >= threshold` (`DESIGN-v4-submissions.md:254-258`).
  - Code: filter by `composite >= minScore` (`match.ts:293-296`).

### High
- **`ttl_mode='until'` accepts missing/invalid `until_datetime` and silently falls back**
  - Evidence: `computeExpiresAt` returns fixed TTL unless both `ttl_mode==='until'` and `untilDatetime` truthy (`submit.ts:70-75`); no validation of datetime format or future-ness.

- **Submission update permits empty `intent_text`**
  - Evidence: update trims but does not validate non-empty (`submit.ts:349`).
  - Impact: invalid state can be introduced post-create.

- **Weight normalization can produce NaN/Infinity**
  - Evidence: `weightSum = alpha + beta + gamma`; no checks for zero/negative (`match.ts:231-234`).
  - Impact: broken ranking/filter behavior.

### Medium
- **`requiredToolsB` merged but effectively unused in eligibility**
  - Evidence: `allRequiredTools` computed (`match.ts:270`) but only used as length guard; no final constraint.

- **List pagination accepts negative values**
  - Evidence: `limit = Math.min(params.limit ?? 50, 200)`, `offset = params.offset ?? 0` (`submit.ts:464-465`), no lower-bound check.

- **`avg_satisfaction_boost` is misnamed/miscalculated**
  - Evidence: computed from `crossScore` differences, not tool satisfaction or composite improvement (`market-insights.ts:149-166`).

- **Unused input fields indicate incomplete implementation**
  - `intent_hint` unused in `handleToolRecommend` (`tool-marketplace.ts:240-245`).
  - `requiredToolsA` unused in market insights (`market-insights.ts:81`).

---

## 3. Design Gaps

- **Negotiation record write/read endpoints are absent**
  - Spec defines negotiation operation and tamper-evident flow (`DESIGN-v4-submissions.md:323-339`), but only schema exists (`003_v4_submissions.sql:97-114`).

- **No staged disclosure mechanics in these handlers**
  - Spec defines stage semantics (`DESIGN-v4-submissions.md:312-322`), but no APIs here to progress or enforce disclosure by stage.

- **No watcher/subscription behavior for low/zero-match submissions**
  - Called out as key design in analysis (`DESIGN-v4-analysis.md:141-150`, `535-537`), absent in current implementation.

- **Tool schema matching semantics are not schema-driven**
  - Analysis proposes field `match_type` semantics (`DESIGN-v4-analysis.md:121-127`, `529-531`), but matcher uses generic heuristics only.

- **No embedding versioning/model metadata per submission**
  - Analysis recommends model-version tagging and migration strategy (`DESIGN-v4-analysis.md:87-93`, `523-525`), absent in schema/handlers.

---

## 4. Performance Concerns

### High
- **O(n) full-pool scans for matching and insights**
  - `handleMatch` scans all active submissions from other agents (`match.ts:236-247`).
  - `handleMarketInsights` does same (`market-insights.ts:85-93`).
  - This will fail at scale; design doc itself flags ANN need (`DESIGN-v4-submissions.md:441-442`).

- **Embeddings stored as JSON TEXT, parsed per row**
  - Schema stores JSON arrays (`003_v4_submissions.sql:35-36`) with repeated parse overhead in hot paths.
  - High CPU and memory churn vs binary vector storage.

### Medium
- **`SELECT *` in list/match paths loads unnecessary large fields**
  - `handleSubmissionsList` fetches full rows (`submit.ts:468-483`) though API omits embeddings.
  - `handleMatch` fetches `s.*` for all candidates (`match.ts:241`).

- **No composite indexes aligned with hottest predicates**
  - Frequent predicates: `status='active' AND expires_at>? AND agent_id!=?`; current single-column indexes may degrade under scale.

---

## 5. API Design Issues

- **Inconsistent/weak error taxonomy**
  - Not-found and ownership failures returned as `INVALID_INPUT` instead of `NOT_FOUND`/`FORBIDDEN` (e.g., `submit.ts:312-315`, `tool-marketplace.ts:232`).

- **Auth handling duplicated instead of centralized**
  - `extractApiKey` exists in `submit.ts`, but other files reimplement parsing manually.

- **Public vs authenticated semantics are muddy**
  - `tool/list` is public (`tool-marketplace.ts:177`) but still accepts auth fields in input type.
  - `tool/recommend` behavior changes silently based on optional auth/submission lookup.

- **Output contract drift from spec examples**
  - Spec uses `if_threshold_raised_to_0.5` (`DESIGN-v4-submissions.md:285-287`), code returns `if_threshold_raised` (`market-insights.ts:42`, `189-193`).

---

## 6. Test Coverage Gaps

- **No tests for `handleToolDeprecate`** despite implemented handler (`tool-marketplace.ts:368-404`).
- **No tests that required tools are enforced during matching** (critical behavior currently broken).
- **No tests for `ttl_mode='until'` validation** (missing datetime, invalid datetime, past datetime).
- **No tests for weight-edge cases** (`alpha/beta/gamma` zero, negative, non-numeric).
- **No tests for pagination bounds** (negative limit/offset, high offsets).
- **No tests for malformed JSON rows / parse-failure hardening**.
- **No tests for expired submissions exclusion in list/match consistency**.
- **No tests for auth via bearer header path in all handlers**.
- **No tests for `intent_hint` (currently dead param) in tool recommend**.
- **Weak test that does not assert correctness**
  - `does not match orthogonal vectors` uses wrong target submission and only asserts `result.ok` is defined (`v4-submissions.test.ts:582-623`), providing almost no signal.

Additional process issue:
- In this workspace snapshot the test file imports `../src/...` paths that are missing, so tests are not runnable here (observed via `bun test` module-not-found). This blocks confidence entirely in this isolated package.

---

## 7. Spec Compliance Deviations

- **Embedding dimensionality mismatch**
  - Spec canonical: 256 (`DESIGN-v4-submissions.md:176`)
  - Code/migration enforce 512 (`submit.ts:6`, `003_v4_submissions.sql:35 comment`).

- **Hashing mismatch**
  - Spec: bcrypt hash (`DESIGN-v4-submissions.md:28`)
  - Code: SHA-256 (`submit.ts:36-38`).

- **Cross-score formula mismatch**
  - Spec: directional weighted formula (`DESIGN-v4-submissions.md:221-229`)
  - Code: symmetric average fallback (`match.ts:261-263`).

- **Candidate filter criterion mismatch**
  - Spec step uses cross-score threshold (`DESIGN-v4-submissions.md:254-258`)
  - Code filters on composite (`match.ts:293-296`).

- **Market insights schema drift**
  - Field naming differs and tool-boost semantics differ from spec intent (`DESIGN-v4-submissions.md:277-287`, `market-insights.ts:149-166`, `189-193`).

- **Data model naming divergence**
  - Spec table names (`agents`, `candidates`, `tools`) vs migration names (`v4_agents`, `submission_candidates`, `coordination_tools`). Could be intentional additive strategy, but it is a protocol-contract divergence unless adapter guarantees are explicit.

---

## 8. Adversarial Scenarios

1. **Mandatory-disclosure bypass farming**
   - Attack: submit high-similarity embeddings with zero required structured tools.
   - Why it works: `requiredToolsMet` ignored in match inclusion.
   - Outcome: attacker appears in candidate lists despite not meeting policy/tool requirements.

2. **Embedding pollution spam**
   - Attack: flood thousands of submissions with broad/high-norm embeddings.
   - Why it works: no submission rate limit in handlers; O(n) matching magnifies impact.
   - Outcome: relevance degradation + CPU exhaustion.

3. **Tool namespace squatting**
   - Attack: pre-publish likely future tool IDs.
   - Why it works: first publisher effectively claims ID; others blocked unless same publisher.
   - Outcome: ecosystem capture and schema fragmentation.

4. **Resource-exhaustion via giant JSON payloads**
   - Attack: oversized `structured_data`/`schema` blobs and massive arrays.
   - Why it works: no input size ceilings.
   - Outcome: memory pressure, slow queries, potential process crashes.

5. **Credential leakage by design path**
   - Attack: exploit systems that log request bodies where `agent_api_key` is passed as param.
   - Why it works: API allows body credential over header.
   - Outcome: key theft, account takeover.

6. **Market probing at scale**
   - Attack: create many Sybil agents/submissions and repeatedly call match/insights to map demand.
   - Why it works: no visible throttling/anti-Sybil controls in this layer.
   - Outcome: strategic intel extraction and ranking manipulation.

---

## Recommended Immediate Remediation (Blocker Priority)

1. Enforce required-tools gating in `handleMatch` before candidate inclusion; add tests for bidirectional requirements.
2. Replace SHA-256 key storage with salted password hashing (bcrypt/argon2id), rotate existing keys.
3. Align scoring logic with spec: directional weighted cross-score, explicit cross-threshold filter, validated weight bounds.
4. Add strict validation: `until_datetime` required/parseable/future for `ttl_mode='until'`; non-empty update `intent_text`; payload size limits.
5. Add abuse controls in these handlers (submission/match/insight/tool publish quotas and burst limits).
6. Harden JSON parsing with safe guards and fail-closed error handling.
7. Expand tests for all critical paths above; remove weak assertions.

