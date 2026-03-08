# Schelling Protocol — Video Content Pipeline

## Architecture

### Rendering Stack (no external dependencies needed)

```
Script (JSON scene definition)
  → Canvas tool (HTML/CSS → PNG frames at 30fps)
  → ElevenLabs API (script text → MP3 narration)
  → ffmpeg (frames + audio → MP4, add captions/transitions)
  → Final MP4 (1080x1920 shorts + 1920x1080 YouTube)
```

**Why this stack:**
- Canvas tool is already available — renders arbitrary HTML to PNG. No install needed.
- ffmpeg 8.0 is installed. Handles all compositing, transitions, captions.
- ElevenLabs API works (tested — 34 voices, TTS confirmed).
- No Remotion, no headless browser recording, no new dependencies.
- Deterministic: same scene definition → same output every time.

### Scene Format

Each video is defined as a JSON scene file:

```json
{
  "meta": {
    "title": "Find a Roommate in 3 API Calls",
    "duration_target_sec": 60,
    "aspect": "9:16",
    "resolution": [1080, 1920]
  },
  "voice": {
    "voice_id": "CwhRBWXzGAHq8TQ4Fs17",
    "model": "eleven_monolingual_v1"
  },
  "scenes": [
    {
      "id": "hook",
      "duration_sec": 5,
      "narration": "What if your AI agent could find you a roommate?",
      "visual": {
        "type": "title_card",
        "headline": "Your AI agent finds you a roommate.",
        "subhead": "3 API calls. No platform. No signup.",
        "style": "dark"
      }
    },
    {
      "id": "demo_seek",
      "duration_sec": 12,
      "narration": "One POST request. Natural language. Your agent describes what you need, and the protocol returns ranked matches with scores.",
      "visual": {
        "type": "terminal",
        "commands": [
          {
            "input": "curl -s -X POST .../quick_seek -d '{\"intent\": \"Roommate in Fort Collins, clean, quiet, $800/mo\"}'",
            "output": "{ \"candidates\": [{ \"score\": 0.94, ... }], \"total_matches\": 3 }",
            "typing_speed": "fast"
          }
        ]
      }
    }
  ]
}
```

### Frame Rendering

Each scene type maps to an HTML template:

1. **title_card** — Large text, gradient background, logo
2. **terminal** — Fake terminal with typing animation, syntax-highlighted JSON
3. **match_results** — Cards with score bars filling up, delegation gauges
4. **split** — Left: terminal/code. Right: visual explanation
5. **diagram** — Protocol flow, lifecycle stages
6. **stats** — Animated counters, score comparisons

Frame math: 12-second scene at 30fps = 360 frames. Generator creates HTML per frame (typing position, animation state), renders via canvas → PNG.

### Audio Pipeline

1. Split narration text by scene
2. POST each to ElevenLabs /v1/text-to-speech/{voice_id}
3. ffmpeg concat with silence padding to hit target durations
4. Audio drives timing — if narration runs long, extend scene

### Compositing

```bash
ffmpeg -framerate 30 -i frames/%06d.png -c:v libx264 -pix_fmt yuv420p raw.mp4
ffmpeg -i raw.mp4 -i narration.mp3 -c:v copy -c:a aac -shortest output.mp4
ffmpeg -i output.mp4 -vf "subtitles=captions.srt" final.mp4
```

---

## Video Series

### Series 1: "Schelling in 60 Seconds" (Shorts/Reels/TikTok)
Format: 1080x1920, 45-75 seconds | Voice: Roger (casual) | Freq: 3x/week

1. "Find a Roommate in 3 API Calls"
2. "Your Agent Negotiates Your Salary"
3. "AI Agents Need a Craigslist"
4. "The Delegation Model Explained"
5. "One Protocol, Every Coordination Problem"
6. "What Happens After the Match?"

### Series 2: "Build With Schelling" (YouTube)
Format: 1920x1080, 3-8 min | Voice: George (warm British) | Freq: 1x/week

1. "Build a Roommate Finder in 5 Minutes"
2. "Add Schelling to Your AI Agent"
3. "The Matching Algorithm Deep Dive"
4. "Delegation Confidence: Teaching Agents When to Ask"

### Series 3: "Schelling Finds" (Both formats)
Use scripts/schelling-finds.ts for real match data, then visualize.

---

## Implementation Plan

### Phase 1: Pipeline Core (Day 1)
- Scene JSON parser
- HTML template system (6 visual types)
- Canvas frame renderer (batch PNG)
- ElevenLabs audio generator
- ffmpeg compositing
- SRT caption generator

### Phase 2: First Video (Day 1-2)
- Scene: "Find a Roommate in 3 API Calls"
- Real data from live API
- Output: 9:16 short + 16:9 YouTube

### Phase 3: Template Library (Day 2-3)
- All 6 visual types tested
- Reusable color schemes, fonts
- Templates that pull live API data

### Phase 4: Automation (Day 3-4)
- One-command: scripts/generate-video.ts <scene.json>
- Batch: scripts/batch-videos.ts
- Cron: 3 shorts + 1 long per week

### Phase 5: Distribution (Needs Cody)
- YouTube channel + OAuth
- TikTok account

---

## Technical Constraints

- Canvas render: ~0.5-1s/frame. 60s@30fps = 1800 frames ≈ 30 min render
- ElevenLabs free tier: 10K chars/month ≈ 12 videos. May need upgrade.
- Storage: ~20-50MB per video
- ffmpeg drawtext needs font path (/System/Library/Fonts/)

---

## Style Guide

### Visual
- Background: #0a0a0f (near-black) or #0d1117 (GitHub dark)
- Accent: #58a6ff (blue) + #f0883e (orange for scores)
- Terminal: GitHub Dark colors
- Font: SF Mono (code), SF Pro (titles)
- Logo: Schelling focal point SVG in corner

### Narration (Focal Voice)
- Conversational and a little sassy — not corporate, not cringe
- Short sentences. Punchy.
- Lead with outcome, not technology
- "Your agent finds you a roommate" not "The protocol facilitates coordination"
- Break up technical jargon with casual asides — keep the substance, lose the density
- Focal has personality: confident, slightly cheeky, explains hard things simply

### Pacing
- Shorts: 2-3 sec per visual beat. Never static >4 sec.
- YouTube: 5-8 sec per concept.
- Always motion: typing, bars filling, fades.
