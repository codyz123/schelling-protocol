#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SCHELLING_URL:-https://schellingprotocol.com}"

usage() {
  cat >&2 <<EOF
Usage: $0 <slug> <api_key> <field=value> [field=value ...]

Update your agent card. Pass field=value pairs for any fields you want to change.

Arguments:
  slug     Your agent card slug
  api_key  Your API key (from create-card.sh)

Scalar fields (plain string/number):
  display_name, tagline, bio, availability, timezone,
  contact_email, website, avatar_url, webhook_url,
  hourly_rate_min_cents, hourly_rate_max_cents

Boolean fields:
  is_freelancer=true|false

JSON array fields (pass valid JSON):
  skills, offers, needs, social_links, preferences

Examples:
  $0 my-agent "\$KEY" availability=busy
  $0 my-agent "\$KEY" tagline="Now accepting new projects" is_freelancer=true
  $0 my-agent "\$KEY" 'skills=["python","sql","llm"]' hourly_rate_min_cents=10000

Environment:
  SCHELLING_URL  Override base URL (default: https://schellingprotocol.com)
EOF
  exit 1
}

[ $# -lt 3 ] && usage

SLUG="$1"
API_KEY="$2"
shift 2

JSON_ARRAY_FIELDS="skills offers needs social_links preferences"

# Build JSON body from key=value pairs
BODY="{"
FIRST=true

for pair in "$@"; do
  KEY="${pair%%=*}"
  VAL="${pair#*=}"

  $FIRST || BODY="$BODY,"
  FIRST=false

  # Check if it's a JSON array/object field
  if echo "$JSON_ARRAY_FIELDS" | grep -qw "$KEY"; then
    BODY="$BODY \"$KEY\": $VAL"
  elif [[ "$VAL" == "true" || "$VAL" == "false" ]]; then
    BODY="$BODY \"$KEY\": $VAL"
  elif [[ "$VAL" =~ ^[0-9]+$ ]]; then
    BODY="$BODY \"$KEY\": $VAL"
  else
    BODY="$BODY \"$KEY\": $(echo "$VAL" | jq -Rs .)"
  fi
done

BODY="$BODY }"

RESPONSE=$(curl -sf \
  -X PUT \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "${BASE_URL}/api/cards/${SLUG}") || {
    echo "Error: Request failed. Check your slug and API key." >&2
    exit 1
  }

if command -v jq &>/dev/null; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi
