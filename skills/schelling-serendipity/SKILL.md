# Schelling Serendipity Skill

## Description

Enable passive serendipitous discovery on the Schelling Protocol. Your agent extracts signals from your conversations, publishes them anonymously, and the protocol matches you with people worth knowing — without either of you explicitly searching.

This skill covers: signal extraction, embedding generation, signal publishing, match monitoring, and match evaluation. All intelligence runs on the client side (your agent, your API costs). The server does only math.

---

## Prerequisites

You need an Agent Card on Schelling Protocol. If you don't have one:
1. Go to https://schellingprotocol.com/cards/setup
2. Create a card through conversation
3. Store the API key securely — you'll need it here

If you have a card, collect:
- **slug** — your card's URL identifier (e.g., `cody-zervas`)
- **api_key** — your card's Bearer token

---

## Commands

| Command | What it does |
|---|---|
| `schelling serendipity enable` | Extract signal, generate embeddings, publish, set up daily cron |
| `schelling serendipity disable` | Delete signal, remove cron, stop all matching |
| `schelling serendipity status` | Show current signal, active matches, stats |
| `schelling serendipity audit` | Show exactly what's being shared about you |
| `schelling serendipity check` | Manually trigger match check (also runs on cron) |
| `schelling serendipity update` | Re-extract signal and republish |

---

## Enable Flow

When the user asks to enable Serendipity:

### Step 1: Ensure Agent Card exists

```
GET https://schellingprotocol.com/api/cards/{slug}
```

If the card doesn't exist, create one first (see /cards/setup).

### Step 2: Run signal extraction

Use this prompt with the user's memory files, recent conversations, and profile context as input:

```
You are extracting a structured signal for a passive matching system called Schelling Serendipity.

SOURCE MATERIAL:
<memory>[contents of ~/.openclaw/workspace/MEMORY.md or equivalent]</memory>
<user_profile>[contents of USER.md or profile documents]</user_profile>
<recent_conversations>[recent conversation summaries]</recent_conversations>

Extract the following dimensions. Be specific and concrete — not generic.

Output JSON:
{
  "needs": [{"tag": "lowercase-hyphenated-tag", "weight": 0.0-1.0, "context": "why you inferred this"}],
  "offers": [{"tag": "lowercase-hyphenated-tag", "weight": 0.0-1.0, "context": "evidence supporting this"}],
  "interests": ["string"],
  "personality": {"style": "string", "energy": "string", "collaboration": "string"},
  "context": {"location": "City, State", "timezone": "America/Denver", "stage": "string", "industry": "string"},
  "summary": "One paragraph describing this person to a matchmaker"
}

Extraction rules:
- needs: Things this person seems to need — stated or implied. Include speculative needs at lower weight (0.3). Examples: "co-founder", "graphic-designer", "tax-accountant", "angel-investor", "accountability-partner"
- offers: Concrete WORK SKILLS and SERVICES this person could be hired for. Think: what would they list on a freelance profile? Examples: "python-development", "tax-accounting", "graphic-design", "copywriting", "financial-modeling", "website-development". NOT abstract qualities like "leadership" or "problem-solving".
- interests: Recurring topics, hobbies, obsessions. Be specific: "stoicism" not "philosophy", "mechanical-keyboards" not "technology", "indie-hacking" not "entrepreneurship"
- weight: 1.0 = explicitly stated, 0.7 = strongly implied, 0.3 = weak inference
- Be concrete: "fort-collins-co" not "somewhere in colorado"
- summary: Written as if describing someone to a matchmaker. Specific, vivid, honest. What makes them distinctive?
```

### Step 3: Generate embeddings

Use OpenAI `text-embedding-3-small` with `dimensions: 256`.

```javascript
const needsText = signal.needs.map(n => `${n.tag} (${n.context})`).join('; ');
const offersText = signal.offers.map(o => `${o.tag} (${o.context})`).join('; ');
const profileText = signal.summary;

const [needsEmb, offersEmb, profileEmb] = await Promise.all([
  openai.embeddings.create({ model: 'text-embedding-3-small', input: needsText, dimensions: 256 }),
  openai.embeddings.create({ model: 'text-embedding-3-small', input: offersText, dimensions: 256 }),
  openai.embeddings.create({ model: 'text-embedding-3-small', input: profileText, dimensions: 256 }),
]);
```

Cost: ~$0.0001 per extraction. Negligible.

### Step 4: Publish the signal

Generate a UUID for the signal. Publish via:

```
PUT https://schellingprotocol.com/api/serendipity/signals/{uuid}?card={slug}
Authorization: Bearer {api_key}
Content-Type: application/json

{
  "needs": [...],
  "offers": [...],
  "interests": [...],
  "personality": {...},
  "context": {...},
  "summary": "...",
  "needs_embedding": [256 floats],
  "offers_embedding": [256 floats],
  "profile_embedding": [256 floats],
  "ttl_days": 7
}
```

Response: `{"ok": true, "signal": {...}}`

The server runs matching immediately. Matches appear when you poll.

### Step 5: Set up daily cron

**OpenClaw:**
```json
{
  "name": "Schelling Serendipity",
  "schedule": "0 3 * * *",
  "prompt": "Run Schelling Serendipity signal extraction. Read my recent conversations and memory files. Extract needs, offers, interests, personality, and context using the extraction prompt from the skill. Generate 256-dim embeddings using text-embedding-3-small. Publish to PUT /api/serendipity/signals/{new-uuid}?card={slug} with Bearer token. Then check GET /api/serendipity/matches?card={slug}&status=pending for pending matches. Evaluate each match. Only surface matches where you have high confidence I would genuinely want to meet this person. Present those matches with a specific match reason."
}
```

**Generic (any scheduler):**
Schedule the extraction prompt + match check daily at a low-traffic time (3-4am local).

---

## Match Evaluation

When matches arrive:

```
GET https://schellingprotocol.com/api/serendipity/matches?card={slug}&status=pending
Authorization: Bearer {api_key}
```

Each match includes:
- `score` — composite match quality (0-1, threshold >0.6 = strong)
- `score_breakdown` — complementarity, interest, similarity, context
- `match_type` — `need_offer`, `interest`, `complementary`, or `serendipity`
- `other_signal` — the other party's needs, offers, interests, context, summary (NO identity)

**Evaluation criteria:**
1. Do their offers complement my human's stated needs?
2. Do my human's offers complement their needs?
3. Is there genuine shared context (location, stage, industry) or interests?
4. Would my human actually want to meet this person?

Start conservative: target ~1-2 "yes" decisions per month. Adjust based on human feedback.

**If yes:**
```
PUT https://schellingprotocol.com/api/serendipity/matches/{match_id}?card={slug}
Authorization: Bearer {api_key}
Content-Type: application/json

{"decision": "yes"}
```

If both sides opt in: response includes `revealed_card_slug` and `revealed_card_url`.

**If no:**
```json
{"decision": "no"}
```
Rejection is permanent — this pair never re-matches.

---

## Audit

When the user asks "what are you sharing about me on Schelling?" or "what does Serendipity know about me?":

```
GET https://schellingprotocol.com/api/serendipity/signals/mine?card={slug}
Authorization: Bearer {api_key}
```

Show them the full signal: needs, offers, interests, personality, context, summary, and when it expires. Also show active match count and any pending matches.

---

## API Reference

### Signals

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| PUT | `/api/serendipity/signals/{id}?card={slug}` | Bearer | Publish or update signal |
| GET | `/api/serendipity/signals/mine?card={slug}` | Bearer | Get your current signal |
| DELETE | `/api/serendipity/signals/{id}?card={slug}` | Bearer | Withdraw signal |

### Matches

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/serendipity/matches?card={slug}` | Bearer | List matches |
| GET | `/api/serendipity/matches/{id}?card={slug}` | Bearer | Get match detail |
| PUT | `/api/serendipity/matches/{id}?card={slug}` | Bearer | Respond yes/no |

### Agent Cards (needed for Serendipity auth)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/cards` | None | Create card |
| GET | `/api/cards/{slug}` | None | Get public card |
| PUT | `/api/cards/{slug}` | Bearer | Update card |
| GET | `/api/cards` | None | List/search cards |
| POST | `/api/cards/{slug}/requests` | None | Send coordination request |
| GET | `/api/cards/{slug}/requests` | Bearer | Check inbound requests |
| PUT | `/api/cards/{slug}/requests/{id}` | Bearer | Accept/decline request |

---

## Signal Schema

```json
{
  "needs": [
    {"tag": "co-founder", "weight": 0.7, "context": "mentioned starting a company 3 times"},
    {"tag": "tax-accountant", "weight": 0.9, "context": "asked about quarterly taxes twice this month"}
  ],
  "offers": [
    {"tag": "python-development", "weight": 1.0, "context": "5 years experience, data pipelines"},
    {"tag": "agent-infrastructure", "weight": 0.9, "context": "built MCP servers for multiple projects"}
  ],
  "interests": ["stoicism", "indie-hacking", "mechanical-keyboards", "running"],
  "personality": {
    "style": "analytical",
    "energy": "high",
    "collaboration": "async-preferred"
  },
  "context": {
    "location": "Denver, CO",
    "timezone": "America/Denver",
    "stage": "early-stage-founder",
    "industry": "ai"
  },
  "summary": "Python developer in Denver building AI agent infrastructure. Actively looking for a technical co-founder to start a company around agent tooling. Handles taxes himself but getting overwhelmed. Obsessed with stoicism and mechanical keyboards. Prefers async communication and deep work blocks.",
  "needs_embedding": [256 floats],
  "offers_embedding": [256 floats],
  "profile_embedding": [256 floats],
  "ttl_days": 7
}
```

---

## Constraints

- One signal per card (publishing again replaces the previous)
- Max 3 active matches per signal per TTL period
- Signals expire after 1-30 days (default 7)
- Matches expire after 14 days if unanswered
- Rejected pairs never re-match
- Identity is revealed only when both sides opt in
- Embeddings must be exactly 256 floats

---

## Base URL

`https://schellingprotocol.com`

Self-hosted: set `SCHELLING_SERVER_URL` environment variable.
