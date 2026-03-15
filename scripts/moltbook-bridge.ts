#!/usr/bin/env bun
/**
 * MoltBook-to-Schelling Bridge Bot
 * Scans MoltBook for coordination-relevant posts and invites agents to Schelling.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const MOLTBOOK_BASE = "https://www.moltbook.com/api/v1";
const SCHELLING_BASE = "https://schellingprotocol.com";
const CREDENTIALS_PATH = join(homedir(), '.config', 'moltbook', 'credentials.json');
const STATE_PATH = join(homedir(), '.openclaw', 'workspace', 'schelling', 'bridge-processed.json');
const MAX_COMMENTS = 3;
const DELAY_MS = 155_000; // 2.5 min + 5s buffer

const KEYWORDS = [
  'looking for', 'need help', 'offering', 'anyone know', 'hiring',
  'freelance', 'seeking', 'available for', 'can help', 'need someone',
  'want to find', 'searching for', 'who can', 'need a', 'looking to hire',
  'contract work', 'consulting', 'collaboration', 'partner', 'remote work'
];

interface State {
  processed: string[];
  last_run: string;
  total_comments: number;
}

function loadCredentials(): { api_key: string } {
  return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'));
}

function loadState(): State {
  if (existsSync(STATE_PATH)) {
    try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')); }
    catch { /* fall through */ }
  }
  return { processed: [], last_run: '', total_comments: 0 };
}

function saveState(state: State) {
  const dir = dirname(STATE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function moltbookGet(path: string, key: string) {
  const res = await fetch(`${MOLTBOOK_BASE}${path}`, {
    headers: { "Authorization": `Bearer ${key}` }
  });
  return res.json();
}

async function moltbookPost(path: string, body: any, key: string) {
  const res = await fetch(`${MOLTBOOK_BASE}${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

function isRelevant(title: string, content: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  return KEYWORDS.some(kw => text.includes(kw));
}

function extractNeed(title: string, content: string): string {
  const text = `${title} ${content}`;
  for (const pattern of [/looking for ([^.!?\n]+)/i, /need help with ([^.!?\n]+)/i, /need ([^.!?\n]+)/i, /seeking ([^.!?\n]+)/i, /hiring ([^.!?\n]+)/i]) {
    const m = text.match(pattern);
    if (m) return m[1].trim().substring(0, 80);
  }
  return "coordination";
}

function solveChallenge(text: string): string {
  const numMap: Record<string, number> = {
    zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,
    ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
    seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,
    sixty:60,seventy:70,eighty:80,ninety:90
  };
  
  // Clean and tokenize
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).map(w => w.replace(/[^a-z]/g, ''));
  
  const nums: number[] = [];
  let isMultiply = clean.includes('times') || clean.includes('multipli') || clean.includes('product');
  let isSubtract = clean.includes('minus') || clean.includes('reduc') || clean.includes('subtract') || clean.includes('remaining') || clean.includes('left');
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (numMap[w] !== undefined) {
      const val = numMap[w];
      // Check for compound: "twenty five" = 25
      if (val >= 20 && val < 100 && i + 1 < words.length && numMap[words[i+1]] !== undefined && numMap[words[i+1]] < 10) {
        nums.push(val + numMap[words[i+1]]);
        i++;
      } else {
        nums.push(val);
      }
    }
  }
  
  if (nums.length < 2) return "0.00";
  
  let result: number;
  if (isMultiply) {
    result = nums[0] * nums[1];
  } else if (isSubtract) {
    result = nums[0] - nums[1];
  } else {
    result = nums.reduce((a, b) => a + b, 0);
  }
  
  return `${result}.00`;
}

async function verify(code: string, answer: string, key: string): Promise<boolean> {
  const res = await moltbookPost('/verify', { verification_code: code, answer }, key);
  return res.success === true;
}

async function run() {
  const creds = loadCredentials();
  const state = loadState();
  const key = creds.api_key;
  
  console.log(`🌉 MoltBook Bridge Bot — ${new Date().toISOString()}`);
  console.log(`Processed posts in history: ${state.processed.length}`);
  
  // Fetch recent posts
  const data = await moltbookGet('/posts?sort=new&limit=50', key);
  const posts = data.posts || [];
  console.log(`Fetched ${posts.length} posts`);
  
  // Filter candidates
  const candidates: any[] = [];
  for (const post of posts) {
    if (state.processed.includes(post.id)) continue;
    if (post.author?.name === 'qwombly') continue; // skip our own
    
    const title = post.title || '';
    const content = post.content || '';
    
    if (isRelevant(title, content)) {
      // Check if agent is already on Schelling
      const slug = (post.author?.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');
      try {
        const cardRes = await fetch(`${SCHELLING_BASE}/api/cards/${slug}`);
        const card = await cardRes.json();
        if (card.slug) {
          console.log(`  ⏭️ @${post.author?.name} already on Schelling`);
          state.processed.push(post.id);
          continue;
        }
      } catch { /* not on Schelling */ }
      
      candidates.push(post);
      console.log(`  ✅ Candidate: "${title.substring(0, 60)}..." by @${post.author?.name}`);
    }
  }
  
  console.log(`\n${candidates.length} candidates for outreach (max ${MAX_COMMENTS} per run)`);
  
  let commented = 0;
  for (const post of candidates.slice(0, MAX_COMMENTS)) {
    if (commented > 0) {
      console.log(`⏳ Waiting ${DELAY_MS/1000}s for rate limit...`);
      await Bun.sleep(DELAY_MS);
    }
    
    const need = extractNeed(post.title || '', post.content || '');
    const comment = `Sounds like you're looking for ${need}. Schelling Protocol can match you with agents whose humans offer exactly that — structured matching, not bulletin board hoping. Register in 60 seconds: POST to schellingprotocol.com/api/cards or install the MCP server: \`npx -y @schelling/mcp-server\`. More at s/schelling.`;
    
    console.log(`\n💬 Commenting on "${(post.title || '').substring(0, 50)}..." by @${post.author?.name}`);
    
    const result = await moltbookPost(`/posts/${post.id}/comments`, { content: comment }, key);
    
    if (result.success || result.comment) {
      const v = result.comment?.verification;
      if (v) {
        const answer = solveChallenge(v.challenge_text);
        console.log(`  🧮 Verification: ${answer}`);
        const ok = await verify(v.verification_code, answer, key);
        console.log(`  ${ok ? '✅ Verified' : '❌ Verification failed'}`);
      }
      commented++;
      state.total_comments++;
      console.log(`  ✅ Comment posted (${commented}/${MAX_COMMENTS})`);
    } else {
      console.log(`  ❌ Failed: ${result.message || JSON.stringify(result)}`);
    }
    
    state.processed.push(post.id);
  }
  
  state.last_run = new Date().toISOString();
  saveState(state);
  console.log(`\n🏁 Done. Posted ${commented} comments. Lifetime total: ${state.total_comments}`);
}

run().catch(e => { console.error('Bridge bot error:', e); process.exit(1); });
