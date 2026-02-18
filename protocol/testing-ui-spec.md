# Schelling Protocol — Testing & Visualization UI Specification

**Version:** 1.0  
**Status:** Draft  
**Date:** 2026-02-18  
**Depends on:** spec-v2.md, intent-embedding-spec.md, embedding-spec.md

---

## 1. Overview

This document specifies a web-based developer/admin UI for the Schelling Protocol. The UI serves two purposes: (1) live monitoring and visualization of a running Schelling server, and (2) testing infrastructure for developing agents, tuning algorithms, and simulating populations.

The UI is a single-page application that connects to the Schelling server via its REST API and an optional WebSocket channel for real-time event streaming. All views authenticate using the admin token from the `schelling.analytics` endpoint.

---

## 2. Architecture

### 2.1 Component Hierarchy

```
App
├── AuthGate                         # Admin token entry, session persistence
├── TopNav                           # Page selector, server status indicator, clock
├── Pages
│   ├── Dashboard                    # §3 — Live system view
│   ├── MatchInspector               # §4 — Candidate pair deep-dive
│   ├── IntentSpaceExplorer          # §5 — 3D intent embedding visualization
│   ├── Simulator                    # §6 — Synthetic user + funnel replay
│   ├── AgentTester                  # §7 — Embedding validation + agent harness
│   └── Admin                        # §8 — User management, disputes, A/B, clusters
└── Shared
    ├── EmbeddingRadar               # Radar chart for trait embedding groups
    ├── IntentPoint3D                # 3D scatter point with tooltip
    ├── ScoreBreakdownCard           # Bidirectional score drill-down
    ├── FunnelDiagram                # Stage funnel with conversion rates
    ├── TimelineView                 # Chronological event log for a candidate pair
    ├── UserSummaryCard              # Compact user profile card
    ├── ClusterBadge                 # Intent cluster affinity indicator
    └── WebSocketProvider            # Context provider for real-time event stream
```

### 2.2 Data Flow

```
┌──────────────┐     REST (JSON)      ┌───────────────────┐
│   UI Client  │◄────────────────────►│  Schelling Server  │
│   (Browser)  │     WebSocket (opt)  │   (MCP or REST)    │
└──────┬───────┘◄────────────────────►└───────────────────┘
       │
       │  IndexedDB (local)
       ▼
┌──────────────┐
│ Sim State DB │  Synthetic users, replay logs, saved scenarios
└──────────────┘
```

**REST endpoints consumed.** The UI consumes:

| Endpoint | Used by | Purpose |
|---|---|---|
| `POST /schelling/server_info` | Dashboard, all pages | Server metadata, capabilities, counts |
| `POST /schelling/intents` | Dashboard, Explorer, Simulator | Cluster centroids, configs, user counts |
| `POST /schelling/analytics` | Dashboard, Admin | Funnel metrics, outcomes, agent quality, A/B tests |
| `POST /schelling/register` | Simulator, AgentTester | Create synthetic users |
| `POST /schelling/search` | Simulator, Inspector | Run searches, get candidates |
| `POST /schelling/evaluate` | Simulator, Inspector | Get detailed score breakdowns |
| `POST /schelling/exchange` | Simulator | Get full profile exchange |
| `POST /schelling/commit` | Simulator | Commit to candidate |
| `POST /schelling/connections` | Simulator | Get connections |
| `POST /schelling/message` | Simulator | Send relay messages |
| `POST /schelling/decline` | Simulator | Decline with feedback |
| `POST /schelling/report` | Simulator | Report outcomes |
| `POST /schelling/feedback` | Simulator | Submit structured feedback |
| `POST /schelling/my_insights` | Simulator, Inspector | Learned preferences, staleness |
| `POST /schelling/reputation` | Inspector, Admin | Reputation breakdown |
| `POST /schelling/export` | Admin | Full user data export |
| `POST /schelling/delete_account` | Admin | Account deletion |
| `POST /schelling/pending` | Dashboard | Pending action counts |
| `POST /schelling/dispute` | Admin | View/manage disputes |
| `POST /schelling/jury_duty` | Admin | Jury case management |
| `GET /health` | TopNav | Server liveness check |

**WebSocket channel.** An optional server extension. If available, the server pushes event objects:

```json
{
  "event": "registration" | "search" | "evaluate" | "exchange" | "commit" |
            "connection" | "decline" | "report" | "dispute" | "message" |
            "reconsider" | "withdraw" | "jury_verdict",
  "timestamp": "ISO8601",
  "cluster_id": "matchmaking",
  "metadata": { ... }  // event-specific, anonymized
}
```

If WebSocket is unavailable, the UI falls back to polling `schelling.analytics` and `schelling.server_info` at a configurable interval (default: 10 seconds).

### 2.3 Authentication

The UI stores the admin token in session storage (not local storage — cleared on tab close). All API calls include `admin_token` in the request body for `schelling.analytics`, and pass user tokens as `Authorization: Bearer {token}` headers for user-scoped operations (used only for synthetic test users created by the UI itself).

The UI maintains a pool of synthetic user tokens for simulator operations. These tokens are stored in IndexedDB and are scoped to the current server instance.

### 2.4 Technology Recommendations

These are recommendations, not requirements.

| Layer | Recommendation | Rationale |
|---|---|---|
| Framework | React 18+ or SolidJS | Component model fits hierarchy; ecosystem depth |
| State | Zustand or Jotai | Lightweight; avoids Redux boilerplate for this scale |
| 3D rendering | Three.js via react-three-fiber (R3F) | Intent space visualization needs WebGL |
| Charts | D3.js (custom) or Recharts (quick) | Radar charts, histograms, funnels |
| Styling | Tailwind CSS | Utility-first; fast prototyping; responsive |
| Data fetching | TanStack Query | Caching, polling, deduplication |
| Local persistence | IndexedDB via Dexie.js | Simulator state, synthetic users |
| Dimensionality reduction | UMAP-js (client-side) | 16-dim → 3-dim projection for intent space |
| WebSocket | Native WebSocket API | No library needed for simple event stream |
| Build | Vite | Fast dev server, ESM-native |

---

## 3. Dashboard (Live System View)

The Dashboard is the landing page. It provides a real-time overview of the Schelling server's health, user population, match funnel, and event stream. Mobile-responsive: the layout stacks into a single column on viewports < 768px.

### 3.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [System Health Cards]   [Intent Space Mini-Map]        │
│  4 stat cards in a row   Small 3D scatter (250×250)     │
├─────────────────────────────────────────────────────────┤
│  [Funnel Analytics]             │  [Reputation Distrib] │
│  Interactive funnel diagram     │  Histogram + breakdown│
│  Full width left 60%            │  Right 40%            │
├─────────────────────────────────────────────────────────┤
│  [Real-Time Event Feed]                                 │
│  Full width, scrollable, most recent on top             │
└─────────────────────────────────────────────────────────┘
```

### 3.2 System Health Cards

Four summary cards across the top. Each card shows a primary number, a sparkline trend (last 30 days), and a delta indicator (↑/↓ vs. prior period).

| Card | Primary metric | Source | Sparkline |
|---|---|---|---|
| Active Users | `system_health.active_users_30d` | analytics | Daily active users (30 points) |
| Active Candidates | `total_candidates` from `server_info` | server_info | Daily candidate count |
| Messages Relayed | `message_relay_metrics.total_messages` | analytics | Daily message count |
| Open Disputes | `system_health.disputes_open` | analytics | Daily dispute count |

**Secondary metrics** shown as smaller text beneath each card:

- Active Users: verification level breakdown (anonymous / verified / attested counts)
- Active Candidates: breakdown by primary cluster (matchmaking: N, marketplace: N, ...)
- Messages Relayed: `avg_messages_before_direct`, `direct_opt_in_rate`
- Open Disputes: `avg_verdict_time_hours`, `unanimous_rate`

**Data source:** `POST /schelling/analytics` with `time_range` spanning the last 30 days. Refresh on WebSocket events or every 10 seconds.

### 3.3 Intent Space Mini-Map

A small (250×250px) interactive 3D scatter plot. Same rendering engine as the full Intent Space Explorer (§5) but with reduced controls:

- All registered users as small dots, colored by primary cluster affinity (matchmaking = rose, marketplace = amber, talent = blue, roommates = green, no-cluster = gray).
- Four cluster centroid markers as larger labeled spheres.
- Auto-rotates slowly. Click-drag to rotate manually. Scroll to zoom.
- Click any dot to navigate to that user in the Match Inspector (§4).
- Click "Expand" button in corner to navigate to the full Intent Space Explorer.

**Projection:** UMAP from 16 dimensions to 3 dimensions. Computed client-side from all users' intent embeddings. Recomputed when user count changes by >10% or on manual refresh.

**Data source:** The UI needs all users' intent embeddings. Since the protocol has no "list all users" endpoint, this requires either:
1. The admin analytics endpoint exposes a bulk intent embedding export (recommended server extension), or
2. The UI maintains a local cache built from WebSocket registration events.

The spec recommends option 1: extend `schelling.analytics` with an optional `include_embeddings: true` flag that returns `users: [{user_id_hash, intent_embedding, primary_cluster, reputation_score, status, last_registered_at}]`. The `user_id_hash` is a one-way hash of the user token (not the token itself). This is an admin-only extension for the testing UI.

### 3.4 Funnel Analytics

An interactive funnel diagram showing conversion rates at each stage transition.

**Visual:** A vertical funnel with 7 horizontal bars, one per stage (UNDISCOVERED through COMPLETED). Each bar's width is proportional to the number of users/candidates at that stage. Arrows between bars show conversion rates as percentages. Bars that represent major drop-off points (conversion < 50%) are highlighted in red.

**Data shown per transition:**

| Transition | Metric | Source field |
|---|---|---|
| UNDISCOVERED → DISCOVERED | Search-to-discovery rate | `funnel_metrics.stage_transitions` |
| DISCOVERED → EVALUATED | Evaluate rate | same |
| EVALUATED → EXCHANGED | Exchange rate | same |
| EXCHANGED → COMMITTED | Commit rate | same |
| COMMITTED → CONNECTED | Connection rate | same |
| CONNECTED → COMPLETED | Completion rate | same |

**Annotations on each stage bar:**
- Count of candidates currently at this stage
- Median time spent at this stage (`funnel_metrics.median_time_per_stage`)
- Top rejection reason at this stage (from `rejection_analysis.stage_distribution` cross-referenced with `rejection_analysis.top_reasons`)

**Filters:**
- Cluster dropdown: "All clusters" or a specific cluster_id. Filters analytics to that cluster.
- Time range picker: last 7 days, 30 days, 90 days, custom range.

**Interaction:** Click any stage bar to see the detailed breakdown: list of top rejection reasons at that stage, time distribution histogram, cluster-by-cluster sub-funnel.

**Data source:** `POST /schelling/analytics` with the selected `cluster_id` and `time_range`.

### 3.5 Reputation Distribution

A histogram of reputation scores across all users.

**Primary view:** Histogram with 20 bins (each 0.05 wide) from 0.0 to 1.0. Y-axis: user count. X-axis: reputation score. Vertical line at the cold-start score (0.5). Vertical line at the jury eligibility threshold (0.6).

**Breakdown toggle:** Switch between:
- **By factor:** Five overlaid line charts showing the distribution of each reputation factor (outcome, completion, consistency, dispute, tenure).
- **By cluster:** Stacked histogram colored by primary cluster.
- **By verification level:** Stacked histogram colored by anonymous/verified/attested.

**Data source:** Requires a bulk reputation export from the analytics endpoint. Recommended server extension: `schelling.analytics` with `include_reputation_distribution: true` returns `reputation_histogram: [{bin_start, bin_end, count, cluster_breakdown, verification_breakdown}]` and `factor_distributions: {outcome: [...], completion: [...], ...}`.

### 3.6 Real-Time Event Feed

A scrollable, reverse-chronological list of system events.

**Each event row shows:**
- Timestamp (relative: "3s ago", "2m ago"; hover for absolute ISO 8601)
- Event type badge (colored: registration=green, search=blue, decline=orange, connection=purple, dispute=red, etc.)
- Cluster badge (colored dot + cluster name)
- Summary text: e.g., "New registration in matchmaking (verified)" or "Candidate pair connected (combined_score: 0.78)" or "Decline at EVALUATED — reason: personality_mismatch"

**Filters:**
- Event type checkboxes (show/hide by event type)
- Cluster dropdown
- Search box (free-text filter on summary text)

**Behavior:**
- Auto-scrolls to show new events when the user is at the top. Pauses auto-scroll when the user scrolls down.
- Renders max 500 events in the DOM; older events are virtualized.
- Click an event to navigate to the relevant view: registration → user in Admin, connection → pair in Match Inspector, decline → pair in Match Inspector.

**Data source:** WebSocket events. If unavailable, the feed is disabled and a "WebSocket unavailable — enable server extension for live feed" notice is shown.

---

## 4. Match Inspector

The Match Inspector is a deep-dive view for any candidate pair. It shows both users' embeddings side by side, the full bidirectional score breakdown, narrative data, and the complete funnel history.

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Pair Selector]  candidate_id input or search          │
├──────────────────────────┬──────────────────────────────┤
│  [User A Panel]          │  [User B Panel]              │
│  UserSummaryCard         │  UserSummaryCard              │
│  Trait Radar             │  Trait Radar                  │
│  Intent Position         │  Intent Position              │
├──────────────────────────┴──────────────────────────────┤
│  [Score Breakdown]                                      │
│  Bidirectional score cards + per-component drill-down   │
├─────────────────────────────────────────────────────────┤
│  [Narrative Panel]                                      │
│  Summary, friction, starters                            │
├─────────────────────────────────────────────────────────┤
│  [Funnel Timeline]                                      │
│  Stage transitions, messages, feedback                  │
├─────────────────────────────────────────────────────────┤
│  [What-If Mode]  (collapsible)                          │
│  Dimension sliders + live score recalculation           │
└─────────────────────────────────────────────────────────┘
```

Mobile layout: panels stack vertically, User A above User B. Score breakdown becomes a single-column card stack.

### 4.2 Pair Selector

Two input modes:

1. **Direct entry:** Text input for `candidate_id`. Paste a candidate ID and press Enter.
2. **Search mode:** Enter any user token (from the simulator's synthetic user pool or pasted manually). The UI calls `schelling.search` for that user and displays a ranked list of candidates. Click any candidate to load the pair.

The selector also shows recently inspected pairs (stored in session storage, last 10).

### 4.3 User Panels (Side by Side)

Each panel shows one user from the candidate pair.

**UserSummaryCard contents:**
- Primary cluster badge + affinity scores for all clusters above threshold
- Role (e.g., "seeker", "buyer")
- Intent strings (natural-language)
- Verification level badge
- Reputation score (numeric + color: green ≥0.7, yellow 0.5–0.7, red <0.5)
- Registration age + staleness indicator
- Status (active / paused / delisted)

**Trait Embedding Radar Chart (`EmbeddingRadar`):**
- One radar chart per user showing all 50 trait dimensions, grouped into the 6 groups.
- The chart has 6 axes (one per group), each showing the mean of that group's dimensions.
- Click a group axis to expand into a detailed radar showing all dimensions within that group (e.g., clicking "Personality" shows all 10 personality dimensions).
- Both users' values are overlaid on the same chart in different colors (blue for User A, orange for User B) so alignment and divergence are immediately visible.
- Hover any axis to see the numeric values for both users and the dimension name.

**Intent Position (mini 3D):**
- A small 3D scatter (200×200px) showing both users' positions in the projected intent space, plus the four cluster centroids.
- User A = blue sphere, User B = orange sphere. A line connects them; the line's opacity reflects their intent similarity (higher similarity = more opaque).

**Data source:** The UI needs both users' full embeddings and profile data. This requires the admin-level data access extension recommended in §3.3. Alternatively, if both users are synthetic (created by the simulator), the UI has their tokens and can call `schelling.export` for each.

### 4.4 Score Breakdown

Three primary score cards displayed horizontally:

| Card | Label | Value | Color coding |
|---|---|---|---|
| Left | "Your Fit (A→B)" | `your_fit` from A's perspective | Gradient: 0=red → 0.5=yellow → 1=green |
| Center | "Combined Score" | `combined_score` | Same gradient, larger font |
| Right | "Their Fit (B→A)" | `their_fit` from A's perspective | Same gradient |

**Per-component drill-down** (below the three cards):

A horizontal stacked bar chart showing how each component contributes to the directional fit scores:

For embedding-based clusters:
- Trait similarity (weight 0.40): bar segment sized by weight × score
- Intent similarity (weight 0.20): bar segment
- Preference alignment (weight 0.20): bar segment
- Deal-breaker pass (weight 0.10): green if 1.0, red if 0.0
- Collaborative signal (weight 0.10): bar segment, grayed out if "0.5 (insufficient data)"

Two bars: one for A→B fit, one for B→A fit. Hover any segment to see the raw score and weight.

For structured-data clusters (marketplace): show price overlap, category match, location proximity, condition match with their respective weights.

**Data source:** `POST /schelling/evaluate` with `candidate_ids: [candidate_id]`, called from User A's perspective. The breakdown object provides per-group scores. Component weights are from the cluster configuration (obtained via `schelling.intents`).

### 4.5 Narrative Panel

Three sections, each in a styled card:

1. **Narrative Summary** (`narrative_summary`): Rendered as formatted text. If the server returns a template-generated summary, display it as-is. If the text is more than 200 characters, show first 200 with "Show more" toggle.

2. **Predicted Friction** (`predicted_friction`): Rendered as a bulleted list with warning-triangle icons. Each item is a string.

3. **Conversation Starters** (`conversation_starters`): Rendered as a numbered list with speech-bubble icons.

**Data source:** From `schelling.evaluate` response.

### 4.6 Funnel Timeline

A vertical timeline showing every event in this candidate pair's history, in chronological order.

**Event types displayed:**

| Event | Icon | Display |
|---|---|---|
| Discovered (search) | 🔍 | "User A discovered User B via search (combined: 0.78)" |
| Evaluated | 📊 | "User A evaluated pair (your_fit: 0.82, their_fit: 0.71)" |
| Exchanged | 📄 | "User A requested profile exchange" |
| Committed | ✅ | "User A committed" |
| Connected | 🤝 | "Mutual connection established" |
| Message sent | 💬 | "User A sent message (143 chars)" — content shown on click |
| Direct requested | 📱 | "User A opted into direct communication" |
| Direct established | 📱📱 | "Direct communication established — contact info exchanged" |
| Outcome reported | ⭐ | "User A reported: positive" |
| Feedback submitted | 📝 | "User A submitted feedback (5 dimensions scored)" |
| Declined | ❌ | "User A declined at stage EVALUATED — reason: personality_mismatch" |
| Withdrawn | ↩️ | "User A withdrew from COMMITTED" |
| Reconsidered | 🔄 | "User A reconsidered decline" |
| Dispute filed | ⚠️ | "User A filed dispute" |

Each event shows its timestamp (relative and absolute on hover).

**Data source:** Requires a candidate pair event history from the server. Recommended admin extension: `GET /schelling/admin/candidate/{candidate_id}/timeline` returning an ordered array of events. Alternatively, the UI reconstructs the timeline from the user exports of both users.

### 4.7 What-If Mode

A collapsible panel at the bottom. When expanded, it shows dimension sliders for one user's trait and intent embeddings. Adjusting any slider triggers a live score recalculation.

**Controls:**
- Toggle: "Adjust User A" / "Adjust User B"
- Tabs: "Trait Embedding" / "Intent Embedding"
- For the trait embedding: 50 horizontal sliders, organized by group (collapsible). Each slider ranges [-1.0, +1.0] with 0.05 step. Current value shown numerically. Reset button per dimension and per group.
- For the intent embedding: 16 horizontal sliders, labeled by dimension name (romantic_intent, social_bonding, etc.). Each ranges [-1.0, +1.0] with 0.05 step.
- A "Reset All" button restores original values.

**Live recalculation:**
- As any slider moves, the UI recomputes:
  - Trait cosine similarity (client-side, using the raw vectors)
  - Intent cosine similarity (client-side)
  - Combined score estimate (using the default weights from the cluster config)
  - Cluster affinity changes (cosine similarity to each centroid)
- The three score cards update in real-time with delta indicators (e.g., "0.78 → 0.82 (+0.04)").
- The radar charts update to reflect the modified embedding.
- The intent space mini-map updates the adjusted user's position.

**Limitation note:** The What-If mode computes an approximation of the server-side score. It uses client-side cosine similarity and the default scoring weights. It cannot replicate learned-preference alignment or collaborative filtering components (those require server state). The UI shows a disclaimer: "Estimated scores — preference alignment and collaborative filtering components use default values."

**Data source:** Client-side computation. The original embeddings are obtained from the user panel data. Cluster centroid vectors are obtained from `schelling.intents`.

---

## 5. Intent Space Explorer

A full-page interactive 3D visualization of the intent embedding space.

### 5.1 Layout

```
┌──────────────────────────────────────────┬──────────────┐
│                                          │  [Controls]  │
│                                          │  Filters     │
│         [3D Scatter Plot]                │  Overlays    │
│         Full viewport minus sidebar      │  Legend       │
│                                          │  Details     │
│                                          │              │
└──────────────────────────────────────────┴──────────────┘
```

The 3D scatter occupies ~75% of the viewport width. The control sidebar occupies ~25%.

### 5.2 3D Scatter Plot

**Rendering:** WebGL via Three.js / react-three-fiber. The scene contains:

1. **User points.** Each registered user is a small sphere (radius proportional to reputation score, ranging from 2px to 6px). Color encodes primary cluster affinity:
   - Matchmaking: `#F43F5E` (rose)
   - Marketplace: `#F59E0B` (amber)
   - Talent: `#3B82F6` (blue)
   - Roommates: `#10B981` (green)
   - No cluster (all affinities < 0.5): `#9CA3AF` (gray)
   - Opacity encodes staleness: fresh = 1.0, penalized = 0.6, stale = 0.3

2. **Cluster centroids.** Four larger labeled spheres at the projected positions of the four predefined centroids. Labels float above each centroid: "Matchmaking", "Marketplace", "Talent", "Roommates". Centroids rendered as wireframe spheres to distinguish from user points.

3. **Cluster boundary regions.** Gradient-shaded volumes around each centroid, showing the region where cosine similarity to that centroid > 0.5. Rendered as translucent ellipsoids (the shape in projected 3D space that approximates the high-dimensional similarity threshold). Low opacity (~0.08) so users inside remain visible.

4. **Axes.** Three labeled axes showing the UMAP projection dimensions (labeled "UMAP-1", "UMAP-2", "UMAP-3"). Gray grid lines at the origin.

**Interactions:**
- **Rotate:** Click-drag to orbit. Shift-drag to pan. Scroll to zoom.
- **Hover:** Hovering a user point shows a floating tooltip with: UserSummaryCard (compact version — cluster, intents, reputation, verification level).
- **Click:** Clicking a user point selects it. The sidebar Details panel populates with the full user profile. Shift-click a second user to select a pair; a line connects them and the sidebar shows their bidirectional scores. Double-click to open the pair in Match Inspector.

**Projection method:** UMAP (Uniform Manifold Approximation and Projection) computed client-side. Parameters: `n_neighbors=15`, `min_dist=0.1`, `n_components=3`, `metric='cosine'`. Recomputed when the user population changes significantly (>10% delta) or on manual "Reproject" button click. The projection is cached in IndexedDB.

**Performance:** For populations up to 10,000 users, render all points using instanced meshes (Three.js `InstancedMesh`). For larger populations, use a level-of-detail system: show full points for the nearest 5,000 and simplified particles for the rest. UMAP computation for 10,000 points in 16 dimensions takes ~2–5 seconds in WASM/JS — show a progress indicator.

### 5.3 Synthetic Probe (Drag-to-Match)

A distinctive draggable point (rendered as a diamond or star shape, white color) that the user can place anywhere in the 3D space.

**How it works:**
1. Click "Add Probe" in the sidebar. A probe appears at the origin.
2. Drag the probe around the 3D space using click-drag (Three.js raycasting).
3. As the probe moves, the sidebar shows "Top 10 Matches for This Position" — a live-updating ranked list of the 10 users whose intent embeddings have the highest cosine similarity to the probe's inverse-projected 16-dimensional vector.

**Inverse projection:** The 3D probe position must be mapped back to 16 dimensions. Since UMAP is not trivially invertible, the UI uses an approximate method:
1. For each existing user point, compute the Euclidean distance in 3D projected space from the probe.
2. Use the K nearest points (K=20) to compute a weighted average of their original 16-dimensional embeddings, weighted by inverse distance.
3. Use this interpolated 16-dimensional vector as the probe's intent embedding.
4. Compute cosine similarity between this vector and all users' intent embeddings.
5. Return the top 10.

This is an approximation. The sidebar shows a disclaimer: "Approximate — based on nearest-neighbor interpolation in projected space."

**Top 10 list:** Each entry shows: rank, user's intents (truncated), intent similarity score, primary cluster badge. Click to select in the main scatter.

### 5.4 Module Activation Overlay

A toggle in the sidebar: "Show Module Activation Regions."

When enabled, the 3D scatter adds translucent colored regions showing where each capability module is active:

| Module | Color | Region |
|---|---|---|
| `negotiation` | `#F59E0B` (amber, 0.05 opacity) | Union of marketplace + talent centroid regions |
| `structured_data` | `#8B5CF6` (purple, 0.05 opacity) | Marketplace centroid region |
| `skills` | `#06B6D4` (cyan, 0.05 opacity) | Talent centroid region |

Regions are the same cosine-similarity > 0.5 ellipsoids used for cluster boundaries, but colored by module. When multiple modules overlap, colors blend additively.

### 5.5 Sidebar Controls

**Filters (collapsible section):**
- Cluster affinity: multi-select checkboxes (matchmaking, marketplace, talent, roommates, none). Unchecked clusters' points are hidden.
- Reputation range: dual-handle slider [0.0, 1.0]. Points outside the range are hidden.
- Staleness: checkboxes (fresh, penalized, stale). Uncheck to hide.
- Role: dropdown (all roles across clusters: seeker, buyer, seller, employer, candidate, participant). "All" by default.
- Verification level: checkboxes (anonymous, verified, attested).

**Overlays (collapsible section):**
- Show cluster regions: toggle (default on)
- Show module activation: toggle (default off)
- Show centroids: toggle (default on)
- Show probe: toggle (default off until "Add Probe" is clicked)
- Color mode: dropdown — "By cluster" (default), "By reputation" (green→red gradient), "By staleness" (white→gray gradient), "By role" (distinct colors per role)

**Legend (collapsible section):**
- Color legend matching the current color mode.
- Point size legend: reputation mapping.

**Details (collapsible section):**
- Populates when a user point is clicked. Shows the full user profile: all fields from the registration record, intent embedding as a table of 16 labeled values, trait embedding as a grouped table, reputation breakdown (if available).

### 5.6 Data Source

All users' intent embeddings, primary clusters, reputation scores, staleness status, and verification levels. Same data requirement as the Dashboard mini-map (§3.3). The recommended `include_embeddings` extension to `schelling.analytics` provides this.

---

## 6. Simulator / Replay

The Simulator allows creating synthetic users, running them through the full funnel, and observing how the system behaves. It is the primary tool for testing scoring algorithms, feedback loops, and agent implementations.

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Mode Selector]  Single User | Batch | A/B Test        │
├──────────────────────────┬──────────────────────────────┤
│  [User Builder]          │  [Simulation Output]         │
│  or [Batch Config]       │  Timeline, scores, graphs    │
│  or [A/B Config]         │                              │
└──────────────────────────┴──────────────────────────────┘
```

### 6.2 Single User Mode

**User Builder (left panel):**

Create a synthetic user with full control over all registration fields.

- **Intent section:**
  - Natural-language intent strings: multi-line text input. One intent per line.
  - Intent embedding: 16 labeled sliders (each [-1.0, +1.0], step 0.05). Dimension names from intent-embedding-spec.md (romantic_intent, social_bonding, professional_context, ..., scope_breadth).
  - Quick-fill buttons: "Matchmaking", "Marketplace", "Talent", "Roommates" — sets sliders to the respective centroid values. "Random" — sets each dimension to a uniform random value in [-0.8, 0.8].
  - Below the sliders: live display of cluster affinities (cosine similarity to each centroid, computed client-side). Primary cluster highlighted.

- **Trait embedding section:**
  - 50 labeled sliders, organized by group (6 collapsible groups). Each slider [-1.0, +1.0], step 0.05.
  - Quick-fill: "Random Normal" (each dimension drawn from N(0, 0.3), clamped to [-1, 1]), "Centroid Match" (uses a preset that aligns with the selected intent cluster's typical personality profile), "Flat" (all zeros — not recommended, but available).

- **Profile fields:**
  - City: text input
  - Age range: dropdown (18-24, 25-34, 35-44, 45-54, 55-64, 65+)
  - Description: text area
  - Seeking: text area
  - Interests: comma-separated text input
  - Values text: text area
  - Identity: name + contact text inputs
  - Deal-breakers: key-value editor

- **Metadata:**
  - Agent model: text input (default: "testing-ui-synthetic")
  - Verification level: dropdown (anonymous, verified, attested)
  - Status: dropdown (active, paused, delisted)

- **Actions:**
  - "Register" button: calls `schelling.register` with all fields. Stores the returned `user_token` in the simulator's token pool (IndexedDB). Shows the registration response.
  - "Save Template" button: saves the current builder state as a named template in IndexedDB for reuse.
  - "Load Template" dropdown: loads a previously saved template.

**Simulation Output (right panel):**

After registering a synthetic user, the right panel becomes a step-by-step funnel simulation console.

**Step 1: Search.**
- "Run Search" button. Parameters: top_k (slider, 1–100, default 20), threshold (slider, 0–1, default 0.5), optional cluster filter.
- Output: ranked candidate list. Each row shows: rank, candidate_id, combined_score, your_fit, their_fit, intent_similarity, cluster badge, intents (truncated). Click a row to expand into a mini ScoreBreakdownCard.

**Step 2: Evaluate.**
- Select one or more candidates (checkboxes). "Evaluate Selected" button.
- Output: for each candidate, the full evaluate response: breakdown, shared interests, complementary traits, narrative summary, predicted friction, conversation starters. Displayed as expandable cards.

**Step 3: Exchange.**
- Select a candidate. "Request Exchange" button.
- Output: full profile data if mutual interest exists, or "pending_mutual" status with stage info.

**Step 4: Commit.**
- "Commit" button for a candidate.
- Output: connection info if mutual, or "pending" status.

**Step 5: Message.**
- Text input + "Send Message" button. Messages appear in a chat-like view.
- "Request Direct" button to trigger `schelling.direct`.

**Step 6: Report.**
- Outcome dropdown (positive / neutral / negative). Notes text area. Feedback section with dimension score sliders (deviation-from-ideal, [-1, +1]). "Report" button.

**Step 7: Decline (available at any step).**
- "Decline" button with reason dropdown (from §8.1 standardized codes) and optional feedback (dimension scores, freeform text).
- After declining: "Search Again" button to re-run search. The output shows whether rankings changed based on the feedback (call `schelling.my_insights` before and after to compare).

**Step 8: Insights.**
- "View Insights" button: calls `schelling.my_insights` and displays the full response: rejection patterns, preference drift, suggested adjustments, collaborative suggestions, feedback quality score, profile freshness.

The right panel maintains a running log of all operations performed, in chronological order, as a scrollable timeline. Each operation shows the request (collapsible) and the response (collapsible). This is the replay: an engineer can read through the timeline and see exactly what happened at each step.

### 6.3 Batch Simulation Mode

Generate N random users, register them all, run all-vs-all searches, and visualize the resulting match graph.

**Batch Config (left panel):**

- **Population size:** Numeric input (1–1000, default 50).
- **Cluster distribution:** Percentage sliders that must sum to 100%.
  - Matchmaking: _%
  - Marketplace: _%
  - Talent: _%
  - Roommates: _%
  - Random (off-centroid): _%
- **Embedding generation method:**
  - "Centroid + noise": intent embedding = cluster centroid + Gaussian noise (σ configurable, default 0.2). Trait embedding = random normal (μ=0, σ=0.3).
  - "Fully random": both embeddings uniformly sampled in valid range.
  - "Template-based": use saved user templates with configurable noise applied.
- **Noise parameters:** σ slider for both intent and trait noise (0.0–0.5, step 0.05).
- **City pool:** Comma-separated list of cities to randomly assign.
- **Age range distribution:** percentage per range.
- **Registration options:** verification level mix, identity generation (auto-generate placeholder names).

**Actions:**
- "Generate & Register All": creates N users, registers each via `schelling.register`, stores all tokens. Shows a progress bar.
- "Run All Searches": for each user, calls `schelling.search` (top_k=20). Stores all candidate pairs.
- "Visualize Match Graph": renders the result.

**Simulation Output (right panel):**

1. **Match Graph.** A force-directed graph (D3 force simulation) where:
   - Nodes = users, colored by primary cluster.
   - Edges = candidate pairs where combined_score > threshold. Edge thickness proportional to combined_score.
   - Layout: force simulation with attraction proportional to combined_score.
   - Hover node: show user summary. Click node: select. Click edge: show score breakdown.

2. **Population Statistics.**
   - Distribution of combined_scores: histogram.
   - Average combined_score by cluster pair (e.g., matchmaking↔matchmaking, matchmaking↔roommates).
   - Number of candidates per user: histogram.
   - "Lonely users": count of users with 0 candidates above threshold.
   - Cluster distribution pie chart (actual primary clusters, may differ from configured distribution due to noise).

3. **Intent Space View.** The same 3D scatter from §5, but showing only the batch population. Color by cluster. Centroid markers.

### 6.4 A/B Test Simulator

Run the same population through two scoring variants and compare outcome distributions.

**A/B Config (left panel):**

- **Population:** Use the currently generated batch (from §6.3), or generate a new one.
- **Variant A (control):** Description text. Scoring weight overrides (text input, JSON format):
  ```json
  { "trait_similarity": 0.40, "intent_similarity": 0.20, "preference_alignment": 0.20, "deal_breaker": 0.10, "collaborative": 0.10 }
  ```
- **Variant B (experimental):** Same format but with different weights. e.g., boost intent_similarity to 0.30 and reduce trait_similarity to 0.30.
- **Simulation mode:**
  - "Score comparison only": compute scores for both variants, compare distributions. Fast (no funnel simulation).
  - "Full funnel simulation": simulate agents progressing through the funnel with automated decisions (accept top-K, decline bottom-K). Slow but more realistic.

**Note on scoring variants:** The server's scoring algorithm is not directly configurable per-request. The A/B simulator has two approaches:
1. **Client-side scoring:** Recompute scores locally using different weights. This works for the base scoring components (trait similarity, intent similarity) but cannot replicate learned preferences or collaborative filtering. Used for "Score comparison only" mode.
2. **Server-side variants:** If the server supports the `variant_id` tagging mechanism (§18.2), register half the population with one variant tag and half with another. Then run full funnel simulation and collect outcomes via `schelling.analytics`. Used for "Full funnel simulation" mode.

**Simulation Output (right panel):**

- **Score distribution comparison:** Two overlaid histograms (variant A in blue, variant B in orange) showing the distribution of combined_scores. KS test statistic displayed.
- **Top-match quality:** For each user, compare their #1 candidate's combined_score under variant A vs. variant B. Scatter plot where x = variant A score, y = variant B score. Points above the diagonal = variant B produced a better top match.
- **Rank correlation:** Spearman correlation between candidate rankings under variant A vs. variant B. High correlation means the variants mostly agree; low correlation means they produce meaningfully different orderings.
- **Outcome comparison (full funnel mode only):** Positive outcome rate with 95% CI for each variant, p-value from two-proportion z-test, sample size, whether significance was reached.

---

## 7. Agent Tester

A testing harness for agent implementations. The tester validates embeddings, runs calibration checks, and simulates feedback loops.

### 7.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Tab Bar]  Validator | Calibration | Feedback Loop     │
├─────────────────────────────────────────────────────────┤
│  [Tab Content]                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7.2 Embedding Validator

Validates trait and intent embeddings against the protocol spec constraints.

**Input:**
- Text area for pasting a JSON object containing `embedding` (array of floats) and/or `intent_embedding` (array of floats).
- Alternatively: file upload (JSON file with the same structure).
- Cluster selector dropdown: determines which embedding schema to validate against.

**Validation checks (trait embedding):**

| Check | Rule | Pass/Fail |
|---|---|---|
| Dimensionality | Length equals cluster's `embedding_schema.dimensions` (50 for matchmaking) | ✅/❌ |
| Range | All values in [-1.0, 1.0] | ✅/❌ + list of out-of-range dimensions |
| Finite | No NaN, no Infinity | ✅/❌ + list of non-finite dimensions |
| Non-zero norm | L2 norm > 0 | ✅/❌ + actual norm value |
| Discrimination | At least 5 dimensions with |value| > 0.3 | ⚠️ advisory (not a protocol violation, but a quality warning) |
| Flatness | No more than 40 dimensions with |value| < 0.1 | ⚠️ advisory |
| Group coverage | At least one dimension per group with |value| > 0.2 | ⚠️ advisory |

**Validation checks (intent embedding):**

| Check | Rule | Pass/Fail |
|---|---|---|
| Dimensionality | Length is exactly 16 | ✅/❌ |
| Range | All values in [-1.0, 1.0] | ✅/❌ + list of out-of-range dimensions |
| Finite | No NaN, no Infinity | ✅/❌ + list of non-finite dimensions |
| Non-zero norm | L2 norm > 0 | ✅/❌ + actual norm value |
| Discrimination | At least 3 dimensions with |value| > 0.5 | ⚠️ advisory |
| Cluster proximity | Cosine similarity to each predefined centroid | Informational: shows the primary cluster and all affinities |

**Output:** A validation report card with pass/fail/warning status for each check. Below the report: a radar chart visualizing the trait embedding by group, and a bar chart showing the intent embedding's 16 dimensions with cluster centroid values overlaid for comparison.

### 7.3 Calibration Checker

Feed the agent known user profiles and verify that the generated embeddings land in expected regions of the embedding space.

**Calibration test cases (pre-built):**

The UI ships with a set of canonical test profiles — fictional user descriptions that map to known expected embedding regions. These are hardcoded in the UI.

| Test case | Description | Expected intent region | Expected trait signals |
|---|---|---|---|
| "Classic Romantic" | 28F, wants a life partner, values deep conversation, emotionally open | Near matchmaking centroid | High openness, high emotional_expression, high depth_preference |
| "Couch Seller" | Selling a mid-century modern couch, $200, Brooklyn pickup only | Near marketplace centroid | N/A (structured data) |
| "Senior Developer" | Hiring a React developer, 5+ years, remote OK, 3-month contract | Near talent centroid | N/A (skills embedding) |
| "Social Roommate" | Looking for a roommate who could be a friend, clean, quiet neighborhood | Between roommates and matchmaking centroids | High conscientiousness, moderate social_bonding |
| "Vague Explorer" | "I just want to meet interesting people, I'm not sure what I'm looking for" | Low urgency, moderate social, high scope_breadth | Moderate across most dimensions |
| "Pragmatic Marriage" | Looking for a stable marriage partner, practical compatibility over romance | Near matchmaking centroid but lower emotional_depth, higher formality | High conscientiousness, high security, lower hedonism |

**Workflow:**
1. Select a test case from the dropdown, or create a custom one (text description + expected embedding ranges).
2. Paste the agent-generated embedding(s) for this test case.
3. The checker compares the generated embedding against the expected region:
   - Intent embedding: cosine similarity to the expected centroid/region. Pass if similarity > 0.7.
   - Trait embedding: for each flagged dimension, check if the generated value is in the expected direction (positive or negative) and magnitude range. A dimension "passes" if it's within ±0.3 of the expected value.
4. Output: a scorecard showing each expected signal, the actual value, and pass/fail. Overall calibration score: percentage of signals that pass.

**Custom test cases:** The user can create custom calibration cases:
- Text description (what the agent should be told about the user)
- Expected intent embedding ranges: per-dimension min/max
- Expected trait embedding signals: per-dimension expected direction (positive/negative) and minimum magnitude
- Save to IndexedDB for reuse.

### 7.4 Feedback Loop Tester

Simulates a series of matches, declines, and feedback submissions to verify that an agent correctly applies insights from the learning system.

**Scenario builder:**
1. **Create the test user:** Use the User Builder (§6.2) or a saved template.
2. **Define a sequence of simulated matches + feedback:**

   Each step in the sequence specifies:
   - A synthetic "candidate" (defined by intent + trait embeddings, or selected from the existing population)
   - An expected agent action: "decline" or "accept"
   - If decline: feedback to submit (rejection reason, dimension scores)
   - Expected behavior after feedback: "next search should rank candidates with [dimension] > [value] higher" or "intent should shift toward [direction]"

3. **Run the sequence:**
   - For each step: register the candidate (if synthetic), run search, check if the expected candidate appears, call evaluate, submit the prescribed action + feedback.
   - After each feedback submission: call `schelling.my_insights` and record the insights state.
   - After all steps: compare the final insights (learned preferences, suggested adjustments) against the expected behavior.

4. **Output:**
   - Timeline of all operations with requests/responses.
   - Insights diff: side-by-side comparison of `my_insights` before the first feedback and after the last.
   - Preference drift visualization: line chart showing how `ideal_ranges` shifted over the sequence.
   - Pass/fail for each expected behavior assertion.

**Pre-built scenarios:**

| Scenario | Steps | Tests |
|---|---|---|
| "Learns to avoid low-openness" | 5 declines with negative openness feedback | After: ideal_ranges for openness should shift upward |
| "Converges on a type" | 3 accepts of similar profiles, 3 declines of dissimilar | After: dimension_importance should reflect the accept/decline pattern |
| "Handles contradictory feedback" | Alternating positive/negative feedback on same dimension | After: importance of that dimension should be moderate (not extreme) |
| "Cold start to calibrated" | 10 declines with varied feedback | After: suggested_adjustments should include meaningful threshold and weight adjustments |

---

## 8. Admin Tools

Server management views for user operations, disputes, A/B tests, cluster configuration, and data export.

### 8.1 Layout

```
┌─────────────────────────────────────────────────────────┐
│  [Tab Bar]  Users | Disputes | A/B Tests | Clusters |   │
│             Analytics Export                             │
├─────────────────────────────────────────────────────────┤
│  [Tab Content]                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 8.2 User Management

**Search bar:** Search by user_id_hash, city, primary cluster, intent text, reputation range, verification level, status. The UI issues a filtered query to the admin endpoint.

**Recommended server extension:** `POST /schelling/admin/users` accepting filter parameters and returning paginated results:
```json
{
  "admin_token": "...",
  "filters": {
    "cluster_id": "matchmaking",
    "city": "Brooklyn",
    "min_reputation": 0.3,
    "status": "active",
    "verification_level": "verified"
  },
  "page": 1,
  "page_size": 50
}
```

Returns: `{ users: [{user_id_hash, primary_cluster, cluster_affinities, city, age_range, reputation_score, verification_level, status, last_registered_at, intents, interaction_count}], total, page, pages }`.

**User list:** Paginated table with sortable columns:
| Column | Sortable | Filter |
|---|---|---|
| ID Hash (truncated) | No | Text search |
| Cluster | Yes | Dropdown |
| City | Yes | Text |
| Reputation | Yes | Range |
| Verification | Yes | Dropdown |
| Status | Yes | Dropdown |
| Registered | Yes | Date range |
| Interactions | Yes | Range |

**User detail (click a row):** Expands into a detail panel:
- Full profile: all registration fields
- Trait embedding radar chart
- Intent embedding bar chart with centroid overlay
- Reputation breakdown (5 factors)
- Candidate history: list of all candidate pairs involving this user
- Feedback summary: count of feedback submissions, top rejection reasons
- Staleness info

**Admin actions (per user):**
- "Flag": add an admin flag (stored in a local admin notes table or a server extension).
- "Delist": call `schelling.update` with `status: "delisted"` (requires the user's token — available only if the user is a synthetic test user or via a server admin extension).
- "Export": call `schelling.export` and download as JSON.
- "View in Inspector": navigate to Match Inspector with this user's recent candidates.

### 8.3 Dispute Dashboard

**Pending disputes list:**
- Table: dispute_id, filed_at, cluster, filer reputation, defendant reputation, stage_at_dispute, days_connected, jury_size, verdicts_in, verdict_deadline.
- Sort by verdict_deadline (most urgent first).
- Color-code rows: red if < 24h to deadline, yellow if < 72h.

**Dispute detail (click a row):**
- Filer evidence panel: reason, artifacts, reputation, interaction history.
- Defendant evidence panel: response, counter-artifacts, reputation. "No response yet" if none.
- Jury panel: list of assigned jurors (agent model, reputation). For each juror: verdict status (pending/submitted), verdict (if submitted), reasoning (if submitted).
- Resolution status: pending, for_filer, for_defendant, dismissed.
- Timeline: filing → defendant notification → defendant response → jury assignment → each verdict → resolution.

**Resolution history:**
- Filterable table of resolved disputes. Columns: dispute_id, resolution, filer rep delta, defendant rep delta, cluster, days to resolve, unanimous.
- Aggregate stats: total disputes, resolution rate, average time, unanimous rate, for-filer rate.

### 8.4 A/B Test Manager

**Active tests list:**
- Table: variant_id, description, start_date, sample_size (control + variant), positive_outcome_rate (control + variant), p_value, significant, sufficient_sample.
- Status badges: "Collecting" (insufficient sample), "Significant" (p < 0.05), "Not significant" (sufficient sample, p ≥ 0.05).

**Create new test:**
- Variant ID: text input.
- Description: text area.
- Scoring weight overrides: JSON editor for the variant's weight configuration.
- Allocation percentage: slider (0–100%, what fraction of new registrations go to this variant). Default: 50%.
- Minimum sample size: numeric input (default 100).
- "Start Test" button.

**Test detail (click a row):**
- Live progress: sample size vs. minimum, with progress bar.
- Score distribution comparison: overlaid histograms (like §6.4).
- Outcome rate over time: line chart showing weekly positive outcome rate for control and variant.
- Confidence intervals: visual CI bars for both control and variant.
- Statistical output: pooled proportion, z-score, p-value, effect size.
- "Conclude Test" button: declares a winner or inconclusive result, stops allocation.

**Data source:** `POST /schelling/analytics` — `algorithm_variants` field provides all per-variant statistics.

### 8.5 Cluster Manager

**Cluster list:**
- Table: cluster_id, display_name, user_count, active_candidates, symmetric, active_modules, centroid (first 4 dimensions shown, full on hover).

**Cluster detail (click a row):**
- Full cluster configuration: all fields from §4.6 of the protocol spec.
- Centroid vector: 16-dimension bar chart with dimension labels from intent-embedding-spec.md.
- Funnel config: table showing discovery_fields, evaluation_fields, exchange_fields, connection_fields, mutual_gate_stage.
- Deal-breaker config: enabled, hard_filters list.
- Active modules: list with module version and configuration.
- User count and candidate count.

**Edit cluster (admin-only, for custom clusters):**
- Centroid editor: 16 sliders or direct numeric input.
- Configuration form: all editable fields.
- "Preview Impact" button: shows how many users would change primary cluster if this centroid changes. Computes cluster affinities for all users with the proposed centroid and compares to current assignments.
- "Save" button: writes changes via a recommended server extension `POST /schelling/admin/clusters/{cluster_id}`.

**Add new cluster:**
- Form with all required cluster configuration fields.
- Centroid builder: 16 sliders with live preview showing position relative to existing centroids (mini 3D scatter).
- "Create" button.

**Note:** Pre-defined clusters (matchmaking, marketplace, talent, roommates) are read-only. Only custom clusters can be edited or created.

### 8.6 Analytics Export

A data export panel.

**Export options:**
- **Format:** JSON or CSV.
- **Scope:**
  - Full analytics: everything from `schelling.analytics`.
  - Funnel metrics only.
  - Outcome metrics only.
  - Agent quality metrics only.
  - Reputation distribution.
  - Decline analytics.
  - Jury metrics.
  - All of the above (one file per scope, zipped).
- **Time range:** last 7 / 30 / 90 / 365 days, or custom range.
- **Cluster filter:** all clusters or a specific one.

**"Export" button:** Calls `schelling.analytics` with the selected parameters, transforms the response into the selected format, and triggers a browser download.

**Scheduled exports (future consideration):** Note that the current protocol has no push mechanism. Scheduled exports would require a server-side cron extension or a background task in the UI (which only works while the tab is open). For production use, server-side export to S3/GCS via a cron job is recommended but out of scope for this UI spec.

---

## 9. Recommended Server Extensions

The testing UI assumes certain data access capabilities that are not currently in the protocol spec. These are recommended server extensions for admin use only.

| Extension | Endpoint | Purpose | Consumed by |
|---|---|---|---|
| Bulk embedding export | `POST /schelling/analytics` with `include_embeddings: true` | Returns all users' intent embeddings + metadata | Dashboard mini-map, Intent Space Explorer |
| Reputation distribution | `POST /schelling/analytics` with `include_reputation_distribution: true` | Returns binned reputation histogram | Dashboard |
| User search | `POST /schelling/admin/users` | Filtered, paginated user list | Admin: User Management |
| Candidate timeline | `GET /schelling/admin/candidate/{id}/timeline` | Ordered event history for a candidate pair | Match Inspector: Timeline |
| User admin actions | `POST /schelling/admin/users/{id_hash}/flag`, `.../delist` | Admin moderation | Admin: User Management |
| Cluster management | `POST /schelling/admin/clusters/{id}` | Create/edit custom clusters | Admin: Cluster Manager |
| WebSocket event stream | `WS /schelling/events` | Real-time event push | Dashboard: Event Feed |
| Bulk user token resolution | `POST /schelling/admin/resolve` | Map user_id_hash → user data (admin only) | Match Inspector |

All admin extensions require the `admin_token` and are not available to regular users or agents.

---

## 10. Interaction Patterns

### 10.1 Real-Time Updates

All Dashboard components subscribe to the WebSocketProvider context. When events arrive:

| Event type | Dashboard update |
|---|---|
| `registration` | Increment Active Users card. Add point to Intent Space mini-map. Prepend to Event Feed. |
| `search` | Prepend to Event Feed. |
| `connection` | Increment Active Candidates card. Prepend to Event Feed. |
| `decline` | Prepend to Event Feed. Update funnel conversion counts. |
| `report` | Update reputation distribution. Prepend to Event Feed. |
| `message` | Increment Messages Relayed card. Prepend to Event Feed. |
| `dispute` | Increment Open Disputes card. Prepend to Event Feed. |
| `jury_verdict` | Update Open Disputes card. Prepend to Event Feed. |

The Match Inspector, if open to a specific candidate pair, also subscribes to events filtered by that pair's ID — updating the timeline in real time when new events arrive.

### 10.2 Polling Fallback

When WebSocket is unavailable:
- Dashboard polls `schelling.analytics` + `schelling.server_info` every 10 seconds.
- Match Inspector polls candidate-specific data every 30 seconds (only if the panel is active).
- Intent Space Explorer and other views do not auto-refresh; they show a "Refresh" button.

### 10.3 Navigation

All views are deep-linkable. URL structure:

| URL | View |
|---|---|
| `/` | Dashboard |
| `/inspector?candidate={id}` | Match Inspector for a specific pair |
| `/inspector?user={token}` | Match Inspector in search mode for a user |
| `/explorer` | Intent Space Explorer |
| `/explorer?user={id_hash}` | Explorer with a user pre-selected |
| `/simulator` | Simulator (Single User mode) |
| `/simulator/batch` | Simulator (Batch mode) |
| `/simulator/ab` | Simulator (A/B Test mode) |
| `/agent-tester` | Agent Tester (Validator tab) |
| `/agent-tester/calibration` | Agent Tester (Calibration tab) |
| `/agent-tester/feedback` | Agent Tester (Feedback Loop tab) |
| `/admin` | Admin (Users tab) |
| `/admin/disputes` | Admin (Disputes tab) |
| `/admin/ab` | Admin (A/B Tests tab) |
| `/admin/clusters` | Admin (Clusters tab) |
| `/admin/export` | Admin (Analytics Export tab) |

### 10.4 Cross-View Navigation

Components include navigation links to related views:

- UserSummaryCard: "View in Explorer" → opens Explorer with the user pre-selected. "View Candidates" → opens Inspector in search mode.
- ScoreBreakdownCard: "Open in Inspector" → opens Inspector for the candidate pair.
- ClusterBadge: click → opens Explorer filtered to that cluster.
- Event Feed items: click → navigates to the relevant view (see §3.6).
- Dashboard mini-map: click a point → opens Inspector with that user.
- Batch Simulation match graph: click a node → opens Inspector. Click an edge → opens Inspector for that pair.

---

## 11. Responsive Design

### 11.1 Breakpoints

| Breakpoint | Width | Layout changes |
|---|---|---|
| Desktop | ≥ 1280px | Full layout as described in each section |
| Tablet | 768px – 1279px | Two-column layouts collapse to single column. Sidebar panels move below main content. |
| Mobile | < 768px | Single column. All panels stacked vertically. 3D views reduced to 2D projections. Sliders become compact accordions. |

### 11.2 Mobile-Specific Adaptations

**Dashboard (mobile):**
- Health cards: 2×2 grid instead of 4-across.
- Intent Space mini-map: hidden (too small to be useful). Replaced with a "View Intent Space" button linking to Explorer.
- Funnel: rendered as a vertical list of stats rather than a wide funnel graphic.
- Event Feed: full width, simplified event cards.

**Match Inspector (mobile):**
- User panels: stacked vertically (A above B), each full width.
- Radar charts: tap to expand into full-screen overlay.
- Score cards: stacked vertically.
- What-If mode: accordion with grouped sliders.

**Other pages (mobile):**
- Intent Space Explorer: 2D scatter projection (UMAP to 2D instead of 3D). Touch-drag to pan, pinch to zoom.
- Simulator: User Builder and Simulation Output are separate scrollable sections (tab-like).
- Agent Tester: full-width forms, results below.
- Admin: table views become card lists.

---

## 12. Error Handling

### 12.1 API Errors

All API calls are wrapped in a global error handler. Error responses from the server (containing `code` and `message` fields per §14 of the protocol spec) are displayed as toast notifications:

| Error category | UI behavior |
|---|---|
| Authentication (`UNAUTHORIZED`) | Redirect to AuthGate. Clear session. |
| Not found (`USER_NOT_FOUND`, `CANDIDATE_NOT_FOUND`) | Toast: "Not found: {message}". Disable the current action. |
| Validation (`INVALID_INPUT`, `INVALID_INTENT_EMBEDDING`, ...) | Toast: "Validation error: {message}". Highlight the offending field if identifiable. |
| Rate limit (HTTP 429) | Toast: "Rate limited — retry in {retry_after}s". Disable the action button with a countdown. |
| Server error (`INTERNAL_ERROR`, HTTP 5xx) | Toast: "Server error — please try again". Log the full response for debugging. |
| Network error | Toast: "Connection lost — retrying...". Automatic retry with exponential backoff (1s, 2s, 4s, max 30s). |

### 12.2 WebSocket Reconnection

If the WebSocket disconnects:
1. Show a yellow "Reconnecting..." banner at the top of the Dashboard.
2. Attempt reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s).
3. After 5 failed attempts, show: "Live updates unavailable. Using polling." and fall back to polling mode.
4. When reconnected, remove the banner and resume normal operation.

### 12.3 Stale Data Indicator

All data displays show the time since last refresh. If data is older than 60 seconds (and WebSocket is disconnected), a subtle "Data may be stale" indicator appears with a "Refresh" button.

---

## 13. Performance Considerations

### 13.1 Data Volume Targets

| Metric | Design target | Degradation handling |
|---|---|---|
| Registered users | Up to 50,000 | Explorer uses LOD. Dashboard mini-map samples. |
| Candidate pairs | Up to 500,000 | Inspector fetches on demand. Batch sim capped at 1,000. |
| Event feed | 10,000 events | Virtualized list, DOM limit 500 |
| UMAP projection | 50,000 × 16 dims | ~10–30s compute time. Show progress bar. Cache in IndexedDB. |
| What-If recalc | 50 dim × 2 users | < 1ms. No debouncing needed. |
| Batch search (1000 users × top-20) | 1000 API calls | Rate-limited to 10/s to avoid server rate limits. Progress bar. ETA display. |

### 13.2 Caching Strategy

| Data | Cache location | TTL | Invalidation |
|---|---|---|---|
| Server info | Memory (Zustand) | 60s | WebSocket event |
| Analytics | Memory | 30s | WebSocket event or manual refresh |
| User embeddings | IndexedDB | Until population changes >10% | Manual or on new UMAP projection |
| UMAP projection | IndexedDB | Until embeddings change | Recomputed on demand |
| Synthetic user tokens | IndexedDB | Permanent (per server instance) | Manual cleanup |
| Saved templates | IndexedDB | Permanent | Manual delete |
| Calibration test cases | Bundled (static) | Permanent | App update |

### 13.3 Bundle Size Budget

Target: < 500KB initial load (gzipped), excluding Three.js which lazy-loads on first navigation to Explorer or Dashboard.

| Chunk | Estimated size (gzipped) |
|---|---|
| Core (React, router, state, UI framework) | ~120KB |
| Charts (D3/Recharts, radar, funnel, histograms) | ~80KB |
| Three.js + R3F (lazy) | ~180KB |
| UMAP-js (lazy) | ~30KB |
| Application code | ~60KB |
| Total | ~470KB |

---

## 14. Development Priorities

Recommended build order based on dependency graph and testing value:

| Phase | Components | Dependencies |
|---|---|---|
| 1 | AuthGate, TopNav, Dashboard (health cards + funnel + event feed) | REST API only. No server extensions needed (analytics endpoint exists). |
| 2 | Agent Tester (Validator + Calibration) | No server access needed — runs entirely client-side. |
| 3 | Simulator (Single User mode) | Requires server access. Uses standard protocol endpoints. |
| 4 | Match Inspector | Requires admin extensions (candidate timeline, user data access). |
| 5 | Intent Space Explorer | Requires bulk embedding export extension. Requires Three.js + UMAP. |
| 6 | Admin Tools (Users, Disputes, Export) | Requires admin extensions (user search, dispute management). |
| 7 | Simulator (Batch + A/B) | Builds on Single User mode. A/B needs variant tagging. |
| 8 | Cluster Manager, A/B Test Manager | Requires cluster management extension. |
| 9 | Dashboard (mini-map, reputation distribution), WebSocket integration | Polish. Requires bulk embeddings and reputation distribution extensions. |

Phase 1–3 can be built against the existing protocol spec with no server extensions. Phase 4+ requires the recommended extensions from §9.

---

*End of specification.*
