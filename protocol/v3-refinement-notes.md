# Schelling Protocol v3 — Refinement Notes

**Date:** 2026-02-25
**Scope:** Coherence, redundancy, completeness, vision alignment, readability, and writing tightness pass.

---

## Changes Made

### Coherence Fixes

1. **Removed phantom `schelling.seek` reference.** §7.3 NL-Enabled Operations table listed `schelling.seek (§10)` which was never defined. Replaced with `schelling.search (§10.1)` and removed the resulting duplicate row.

2. **Added cross-reference §-numbers to NL operations table.** All six entries now have explicit section references (e.g., `schelling.onboard (§6.1)`).

3. **Added group-specific fields to `schelling.register` (§6.2) and `schelling.update` (§6.3).** `auto_fill` and `group_deadline` were defined in §9.4 but missing from the actual register/update input field tables. Now present in both places with cross-references.

4. **Fixed `describe` vs `server_info` distinction.** §5.4 now explicitly states `describe` is the agent-friendly compact overview for LLM context windows, while `server_info` is the machine-readable technical counterpart.

5. **Cross-referenced §31.2 (Cold Start Priors)** to §5.3 (cluster_info), §4.5 (cluster templates), and §12.3 (model tiers).

6. **Fixed §32.6 table.** "Cross-vertical" → "Cross-cluster" and "Within-vertical" → "Within-cluster" for terminology consistency.

7. **Replaced all protocol-level "vertical" references** with "domain" or "cluster" as appropriate. "Vertical" now only appears in Appendix B when referencing v2's actual `vertical_id` field name.

### Completeness Additions

8. **Fleshed out §24.3 (`schelling.messages`).** Was "Same as v2." Now has full input fields (user_token, candidate_id, since, limit, cursor), output fields (messages, total, next_cursor), MessageRecord schema, gating, and error codes.

9. **Fleshed out §24.4 (`schelling.direct`).** Added `mutual` output field, max length for contact_info, gating, error codes.

10. **Fleshed out §24.5 (`schelling.relay_block`).** Was one line. Now has full input fields (user_token, candidate_id, blocked), output, behavior description, gating, error codes.

11. **Fleshed out §25.2 (`schelling.event`).** Was "Same schema as previous version." Now has complete input fields for all three actions (emit, ack, list), output fields, event types, payload limits, ack deadlines.

12. **Fleshed out §30.2 (`schelling.my_insights`).** Was a prose list. Now has proper input/output field tables with types and descriptions.

13. **Fleshed out §30.3 (`schelling.analytics`).** Same — now has input fields (admin_token, cluster_id, time_range) and structured output field table.

14. **Expanded §15.5.4 (Location Tool).** Replaced "Same as v2" output reference with proper per-action output field tables (distance, filter_radius, timezone_overlap).

15. **Added §11.6 (Fast-Path to Full-Protocol Transition).** New subsection explaining how participants created via fast-paths transition to full protocol operations, with a concrete table of common transitions.

16. **Added §19.8 (Deliverable Disputes).** New subsection covering how disputes interact with deliverables: metadata-only evidence for jurors, acceptance history, contract terms context, re-delivery during dispute, and reputation impact.

17. **Added `GROUP_FULL` and `AUCTION_CLOSED` to §8.3 error codes.** These error codes were defined in §28 but never referenced by any operation. They apply to `schelling.interest` in group/auction modes.

18. **Clarified `USER_SUSPENDED` in §28.** Added note that any authenticated operation returns this when the account is under suspension.

19. **Clarified `INCOMPATIBLE_CLUSTERS` in §28.** Added explanation that both quick_match parties must resolve to the same cluster.

20. **Clarified withdrawal + deliverable interaction (§8.7).** Specified that pending deliverables get status `"cancelled_withdrawal"` while accepted deliverables are unaffected.

### Vision Alignment

21. **Rewrote §1.1 purpose statement.** Expanded from "dating, hiring, marketplace, roommates..." to a broader list emphasizing Schelling as THE universal coordination hub. Added the core "human says get me X → agent uses Schelling → human never knew" framing directly in the introduction.

22. **Added design principle #9: "Human-invisible by default."** Makes the human-invisible pattern explicit as a core design principle.

23. **Reordered trait examples in §3.2.** Dating examples moved from first to last. Now leads with hiring/freelance, services, marketplace, roommates, social coordination, then dating.

24. **Diversified visibility recommendations in §13.6.** Replaced dating-centric recommendation table with domain-diverse table covering services, hiring, marketplace, roommates, social, dating, etc. Added "Example domains" column.

25. **Reframed §15.5.2 (Appearance Embedding → Visual Embedding).** Renamed from "Appearance Embedding Tool" to "Visual Embedding Tool." Reframed for general visual feature extraction (marketplace items, portfolios, real estate) not just dating. Updated field descriptions to be domain-neutral.

### Writing Tightness

26. **Removed hedging language.** Fixed "might map to" → "maps to" in §7.4 NL cluster context.

27. **Tightened §35 (Future Extensions).** Removed aspirational prose. Now a clean table with extension name, description, and status. Reserved operations now include `schelling.escrow` with a note that implementations MUST NOT reuse these names.

28. **Tightened design principle #6.** "Users can start with almost nothing" → "An agent can start with a single natural-language sentence."

29. **Tightened design principle #8.** "lowering the barrier for agent integration" → "enabling zero-integration-effort onboarding for any agent."

30. **Changed `describe` protocol.purpose field** from "across any vertical" to "across any domain."

---

## What Was NOT Changed

- **Section ordering.** The current order tells a logical story and was preserved.
- **Core data model (§3).** Trait/preference/operator system is solid.
- **Funnel state machine (§8).** Well-specified and correct.
- **Contract system (§17).** Thorough as-is.
- **Privacy section (§26).** Complete and rigorous.
- **Appendix B (Migration from v2).** Accurate reference material; "vertical_id" retained as it's a v2 field name.
- **Rate limits (Appendix A).** Reasonable defaults.
- **Example flows (Appendix C).** Already diverse (hiring, services, sports, auction, crafts — no dating examples).

## Remaining Observations

1. **The spec is large (~4200 lines).** This is inherent to the scope. The `schelling.describe` endpoint (§5.2) serves as the agent-facing summary.

2. **NL parsing accuracy is implementation-dependent.** The spec correctly treats NL as syntactic sugar and always returns parsed results for verification. This is the right approach.

3. **No WebSocket spec for real-time.** §35 reserves this for a future version. Current poll-based approach via `schelling.pending` and `schelling.notifications` is sufficient for v3.

4. **Tool billing is metadata-only.** The spec defines pricing fields but does not specify a payment protocol. This is correct — payment is out of scope for a coordination protocol.
