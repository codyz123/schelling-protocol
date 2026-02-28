#!/usr/bin/env bun
/**
 * Scan for tweets/content where people are asking for or discussing
 * something like the Schelling Protocol. Output opportunities for engagement.
 * 
 * Search queries that indicate Schelling-relevant conversations:
 * - "agent marketplace" / "agent coordination"
 * - "TaskRabbit for AI" / "TaskRabbit for agents" / "TaskRabbit 2.0"
 * - "agents negotiate" / "agent matchmaking" / "agent discovery"
 * - "MCP server marketplace" / "agent to agent"
 * - "hire an agent" / "agent hiring"
 * - "AI coordination protocol" / "agent protocol"
 * 
 * Uses web search to find recent discussions. For Twitter-specific scanning,
 * we'd need Twitter API access (task #717 in Productiv).
 */

const SEARCH_QUERIES = [
  '"TaskRabbit for AI" OR "TaskRabbit for agents" OR "TaskRabbit 2.0 agents"',
  '"agent marketplace" OR "agent matchmaking" site:x.com OR site:twitter.com',
  '"AI agent coordination" OR "agent discovery protocol"',
  '"agents negotiate on behalf" OR "agent negotiation"',
  '"MCP server marketplace" OR "MCP server directory"',
  '"hire an AI agent" OR "agent hiring platform"',
  '"agent to agent" coordination OR protocol OR marketplace',
];

const results: Array<{query: string; title: string; url: string; snippet: string}> = [];

for (const query of SEARCH_QUERIES) {
  try {
    // Use Brave Search API if available, otherwise log the query
    const apiKey = process.env.BRAVE_API_KEY;
    if (!apiKey) {
      console.log(`[SKIP] No BRAVE_API_KEY — would search: ${query}`);
      continue;
    }
    
    const params = new URLSearchParams({
      q: query,
      count: '5',
      freshness: 'pw', // past week
    });
    
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { 'X-Subscription-Token': apiKey },
    });
    
    if (!res.ok) {
      console.error(`[ERROR] ${query}: ${res.status}`);
      continue;
    }
    
    const data = await res.json() as any;
    for (const r of data.web?.results || []) {
      results.push({
        query,
        title: r.title,
        url: r.url,
        snippet: r.description?.slice(0, 200) || '',
      });
    }
  } catch (e) {
    console.error(`[ERROR] ${query}:`, e);
  }
}

if (results.length === 0) {
  console.log('\nNo results found (or no API key). Search queries to run manually on X:');
  console.log('');
  console.log('1. "TaskRabbit" agents OR AI');
  console.log('2. "agent marketplace" OR "agent matchmaking"');
  console.log('3. "agent coordination" protocol');
  console.log('4. "agents negotiate" OR "agent negotiation"');
  console.log('5. "MCP server" marketplace OR directory');
  console.log('6. "agent to agent" communication OR coordination');
  console.log('7. "AI hiring" agent OR platform');
  console.log('');
  console.log('Run these on x.com/search with "Latest" tab for freshest results.');
} else {
  console.log(`\n=== Found ${results.length} opportunities ===\n`);
  for (const r of results) {
    console.log(`📌 ${r.title}`);
    console.log(`   ${r.url}`);
    console.log(`   ${r.snippet}`);
    console.log('');
  }
}

// Save results for the content pipeline
const outDir = `${import.meta.dir}/../content/opportunities`;
const fs = await import('fs');
fs.mkdirSync(outDir, { recursive: true });
const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(
  `${outDir}/${date}-scan.json`,
  JSON.stringify({ date, queries: SEARCH_QUERIES, results }, null, 2),
);
console.log(`\nSaved to content/opportunities/${date}-scan.json`);
