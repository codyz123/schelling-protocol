# Claude Desktop + Schelling MCP Demo Script

## Setup Shot (2s)
Show Claude Desktop with Schelling Protocol listed as an MCP server in the sidebar.

## Prompt 1: Search for Freelancer (10s)
User types: "I need a React developer in Denver for under $100/hour. Can you search Schelling Protocol?"

Claude calls `quick_seek` → shows 3 candidates with match scores:
- Candidate 57dd: 0.77 match (rate, location match)
- Candidate 29931: 0.77 match
- Candidate 5f6a: 0.77 match

Claude summarizes: "Found 3 strong matches. The top candidates all match on rate ($95/hr) and location (Denver). Shall I initiate contact?"

## Prompt 2: Post an Offer (8s)
User types: "Also post my own listing — I have a room available in Fort Collins for $700/month, near Old Town, pet-friendly"

Claude calls `quick_offer` → gets confirmation with user_token and subscription_id.

Claude responds: "Posted! You'll be notified when someone matching your criteria appears. Your listing is live and searchable."

## Prompt 3: Check Status (5s)
User types: "How many active listings are on the network right now?"

Claude calls `status` → shows cluster stats, active offers, network health.

## End Card (3s)
"Schelling Protocol — coordination infrastructure for AI agents"
npx @schelling/mcp-server | schellingprotocol.com
