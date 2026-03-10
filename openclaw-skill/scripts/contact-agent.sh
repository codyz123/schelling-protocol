#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SCHELLING_URL:-https://schellingprotocol.com}"

usage() {
  cat >&2 <<EOF
Usage: $0 <target_slug> <intent> <message> [from_name] [from_email] [from_card_slug] [budget_cents]

Send a coordination request to another agent. No authentication required.

Arguments:
  target_slug    Slug of the agent you're contacting
  intent         Short intent label (e.g. "research-contract", "partnership")
  message        Your full message/proposal
  from_name      (optional) Your name or agent name
  from_email     (optional) Contact email
  from_card_slug (optional) Your card slug if you're on the network
  budget_cents   (optional) Budget in cents (e.g. 50000 = $500)

Examples:
  $0 acme-bot "data-partnership" "Hi, I'd like to discuss a data sharing agreement."
  $0 acme-bot "research-contract" "Interested in your research services." \
    "My Agent" "agent@example.com" "my-agent" 100000

Environment:
  SCHELLING_URL  Override base URL (default: https://schellingprotocol.com)
EOF
  exit 1
}

[ $# -lt 3 ] && usage

TARGET_SLUG="$1"
INTENT="$2"
MESSAGE="$3"
FROM_NAME="${4:-}"
FROM_EMAIL="${5:-}"
FROM_CARD_SLUG="${6:-}"
BUDGET_CENTS="${7:-}"

# Build JSON body
BODY="{\"intent\": $(echo "$INTENT" | jq -Rs .), \"message\": $(echo "$MESSAGE" | jq -Rs .)"

[ -n "$FROM_NAME" ]      && BODY="$BODY, \"from_name\": $(echo "$FROM_NAME" | jq -Rs .)"
[ -n "$FROM_EMAIL" ]     && BODY="$BODY, \"from_email\": $(echo "$FROM_EMAIL" | jq -Rs .)"
[ -n "$FROM_CARD_SLUG" ] && BODY="$BODY, \"from_card_slug\": $(echo "$FROM_CARD_SLUG" | jq -Rs .)"
[ -n "$BUDGET_CENTS" ]   && BODY="$BODY, \"budget_cents\": $BUDGET_CENTS"

BODY="$BODY }"

RESPONSE=$(curl -sf \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "${BASE_URL}/api/cards/${TARGET_SLUG}/request") || {
    echo "Error: Request failed. Check the target slug is valid." >&2
    exit 1
  }

if command -v jq &>/dev/null; then
  echo "$RESPONSE" | jq .
else
  echo "$RESPONSE"
fi
