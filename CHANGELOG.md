# Changelog

All notable changes to Schelling Protocol.

## [3.0.0] - 2026-02-28

### Added
- **Interactive API docs** at `/docs` — Swagger UI served from the live API
- **GitHub Actions CI** — automated test runner on push/PR to main
- **Python examples** — `find_developer.py`, `roommate_search.py` for the Python AI agent community
- **Production smoke test** — `scripts/smoke-test.sh` runs 12 checks against live API
- **Auto-seed on startup** — demo data (housing + freelancers) seeded when DB is empty
- **Actionable error hints** — all common errors include `hint` fields guiding developers
- **NL parser improvements** — rate extraction ($X/hr), budget parsing, location fixes
- **agent_seek / agent_lookup** — convenience operations for agent integration (one-call search with alias persistence)
- **OpenAPI spec additions** — agent_seek and agent_lookup documented with full schema
- **QUICKSTART.md** — zero-install curl walkthrough against live API
- **Examples directory** — TypeScript, Python, and curl examples, all tested against production
- **Launch blog post draft** — `content/launch-post.md`
- **Full lifecycle demo** — 11-stage demo script verified against production
- **§15 Delegation Model** — agent autonomy signals, delegation confidence scoring
- **README badges** — CI status, protocol version, license, live API link

### Fixed
- NL parser location regex no longer matches "looking" as "in"
- Match scores (were returning 0.00) — normalization, fuzzy Jaccard, `near` operator
- README stale references (test counts, spec links)

### Changed
- GET / returns JSON discovery document (agent-first, no HTML)
- Root response is a directive, not a catalog
- weight=1.0 softened from hard filter to strongest soft preference
- Lifecycle stages made non-mandatory

## [2.0.0] - 2026-02-26

Initial deployment with v3.0 protocol spec, 40+ operations, SQLite backend, Railway hosting.
