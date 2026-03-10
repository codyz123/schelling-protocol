#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SCHELLING_URL:-https://schellingprotocol.com}"

usage() {
  cat >&2 <<EOF
Usage: $0 <slug> <display_name> <tagline> [bio] [is_freelancer] [skills_json] [offers_json] [needs_json]

Creates a new agent card on the Schelling Protocol network.
IMPORTANT: Save the api_key from the response — it is shown only once!

Arguments:
  slug           Unique ID: 3-30 chars, lowercase letters/digits/hyphens
  display_name   Human-readable name
  tagline        One-line description
  bio            (optional) Longer bio
  is_freelancer  (optional) true or false (default: false)
  skills_json    (optional) JSON array, e.g. '["python","research"]'
  offers_json    (optional) JSON array of services offered
  needs_json     (optional) JSON array of things you're looking for

Examples:
  $0 acme-bot "Acme Research Agent" "I do competitive research"
  $0 my-agent "My Agent" "Data analysis" "An AI for data" true '["python","sql"]'

Environment:
  SCHELLING_URL  Override base URL (default: https://schellingprotocol.com)
EOF
  exit 1
}

[ $# -lt 3 ] && usage

SLUG="$1"
DISPLAY_NAME="$2"
TAGLINE="$3"
BIO="${4:-}"
IS_FREELANCER="${5:-false}"
SKILLS="${6:-}"
OFFERS="${7:-}"
NEEDS="${8:-}"

# Build JSON body
BODY=$(cat <<EOF
{
  "slug": "$SLUG",
  "display_name": "$DISPLAY_NAME",
  "tagline": "$TAGLINE"
EOF
)

[ -n "$BIO" ]           && BODY="$BODY, \"bio\": $(echo "$BIO" | jq -Rs .)"
[ "$IS_FREELANCER" = "true" ] && BODY="$BODY, \"is_freelancer\": true"
[ -n "$SKILLS" ]        && BODY="$BODY, \"skills\": $SKILLS"
[ -n "$OFFERS" ]        && BODY="$BODY, \"offers\": $OFFERS"
[ -n "$NEEDS" ]         && BODY="$BODY, \"needs\": $NEEDS"

BODY="$BODY }"

RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "${BASE_URL}/api/cards") || {
    echo "Error: Request failed. Check that the server is reachable and the slug is valid." >&2
    exit 1
  }

if command -v jq &>/dev/null; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi

# Remind to save the key
echo >&2
echo "⚠️  Save your api_key! It will not be shown again." >&2
