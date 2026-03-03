#!/bin/bash
# Daily video generation and upload
# Picks the next unuploaded scene, renders it, uploads to YouTube
set -e

REPO_DIR="$HOME/Documents/a2a-assistant-matchmaker"
SCENES_DIR="$REPO_DIR/scenes"
VIDEOS_DIR="$REPO_DIR/content/videos"
UPLOADED_LOG="$VIDEOS_DIR/.uploaded.txt"

cd "$REPO_DIR"
mkdir -p "$VIDEOS_DIR"
touch "$UPLOADED_LOG"

# Find next unuploaded scene
NEXT_SCENE=""
for scene in "$SCENES_DIR"/*.json; do
  name=$(basename "$scene" .json)
  if ! grep -q "$name" "$UPLOADED_LOG" 2>/dev/null; then
    NEXT_SCENE="$scene"
    break
  fi
done

if [ -z "$NEXT_SCENE" ]; then
  echo "All scenes uploaded. Create new scene files in $SCENES_DIR"
  exit 0
fi

NAME=$(basename "$NEXT_SCENE" .json)
TITLE=$(cat "$NEXT_SCENE" | python3 -c "import json,sys; print(json.load(sys.stdin)['meta']['title'])")
VIDEO_PATH="$VIDEOS_DIR/$NAME.mp4"

echo "🎬 Generating: $TITLE ($NAME)"

# Generate video
bun run scripts/video-gen.ts "$NEXT_SCENE" --output "$VIDEOS_DIR/"

if [ ! -f "$VIDEO_PATH" ]; then
  echo "❌ Video not generated: $VIDEO_PATH"
  exit 1
fi

# Upload to YouTube
DESCRIPTION="$TITLE

Schelling Protocol is universal coordination infrastructure for AI agents. One protocol for apartments, freelancers, study groups — any coordination problem.

🔗 Try it: https://schellingprotocol.com
📦 GitHub: https://github.com/codyz123/schelling-protocol
📦 npm: npm install @schelling/sdk

#ai #agents #opensource #mcp #protocol #schelling"

bun run scripts/youtube-upload.ts "$VIDEO_PATH" \
  --title "$TITLE | Schelling Protocol" \
  --description "$DESCRIPTION" \
  --tags "ai,agents,opensource,mcp,schelling protocol,coordination" \
  --short

# Log as uploaded
echo "$NAME" >> "$UPLOADED_LOG"
echo "✅ Done: $NAME uploaded"
