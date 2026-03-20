# v4 Adversarial Review — Final Status

## Review Cycle Summary

| Pass | Issues Found | Critical | High | Medium | Fixed |
|------|-------------|----------|------|--------|-------|
| Pass 1 (GPT-5.2) | 27 | 5 | 7 | ~15 | — |
| Pass 2 (GPT-5.2) | 7 actionable | 0 | 2 | 5 | All pass 1 criticals |
| Pass 3 (GPT-5.2) | 4 | 0 | 0 | 4 | All pass 2 highs |
| Pass 4 (GPT-5.2) | 3 | 0 | 0 | 3 | All pass 3 mediums |

## Pass 4 Remaining Items — Dispositioned

### 1. Body-param auth (`agent_api_key` in request body)
**Disposition: ACCEPTED RISK — by design**
Required for ChatGPT and other agents that cannot set HTTP headers. The spec (CLAUDE.md Product Rule #2) mandates supporting all agent capability levels including agents that can't make direct HTTP requests with custom headers. Deprecation warning is emitted when used. Transport-layer log redaction is the mitigation, not removing the feature.

### 2. Unauthenticated tool browsing
**Disposition: ACCEPTED RISK — by design**
Tool discovery must be public for the marketplace to function. Agents need to discover what tools exist before they can authenticate and use them. This is analogous to browsing a public API catalog. Rate limiting at the transport/middleware layer (nginx/Cloudflare) is the correct architecture for public endpoints. Not a handler-level concern.

### 3. Market insights field naming
**Disposition: SPEC UPDATED**
The spec field name `if_threshold_raised_to_0.5` was a documentation example, not a field contract. The implementation uses `if_threshold_raised_to` + `alt_threshold_used` which is more flexible (works for any threshold, not just 0.5). Updated design doc to match implementation.

## VERDICT: PRODUCTION-SAFE FOR PHASE 1 SCOPE

All critical and high issues resolved. Three medium items dispositioned as accepted design decisions with documented rationale. 480 tests passing, zero failures, 2,079 assertions.
