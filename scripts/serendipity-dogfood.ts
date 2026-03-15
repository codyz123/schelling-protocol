#!/usr/bin/env bun
/**
 * Serendipity Dogfood: Phase 0
 * 
 * 1. Creates an agent card for Alex (or reuses existing)
 * 2. Creates 30 synthetic agent cards with diverse profiles
 * 3. Publishes Alex's real signal (extracted from his actual context)
 * 4. Publishes 30 synthetic signals
 * 5. Retrieves and displays match results
 */

const API = process.env.API_URL || "http://localhost:3456";
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_KEY) {
  console.error("❌ Set OPENAI_API_KEY environment variable");
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────

async function api(method: string, path: string, body?: any, apiKey?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
      dimensions: 256,
    }),
  });
  const data = await res.json();
  return data.data[0].embedding;
}

function uuid() {
  return crypto.randomUUID();
}

// ─── Alex's Real Signal (extracted from his actual files) ───

const alexSignal = {
  needs: [
    { tag: "co-founder-technical", weight: 0.7, context: "Building multiple side projects (Schelling, Alder AI, Podcastomatic) alone, needs technical partners" },
    { tag: "accountant-crypto-savvy", weight: 0.6, context: "Multiple income streams, startup equity, needs tax help" },
    { tag: "health-specialist-cfs", weight: 0.8, context: "Chronic fatigue syndrome, complex health stack, actively researching treatments" },
    { tag: "real-estate-agent-colorado", weight: 0.5, context: "Looking to buy a house in northern Colorado" },
    { tag: "podcast-producer", weight: 0.4, context: "Two podcasts recorded but bottlenecked on production and distribution" },
    { tag: "creative-collaborator", weight: 0.5, context: "Musician, screenwriter, essayist — wants to ship more creative work but lacks accountability partners" },
    { tag: "investor-or-advisor", weight: 0.3, context: "Keeper struggling with fundraising, side projects need capital strategy" },
  ],
  offers: [
    { tag: "ai-agent-infrastructure", weight: 1.0, context: "Building Schelling Protocol — agent coordination layer. Deep expertise in MCP, agent orchestration, OpenClaw" },
    { tag: "startup-product-leadership", weight: 0.9, context: "CPO at Keeper, 10+ years building products, strong product sense" },
    { tag: "ai-automation-consulting", weight: 0.8, context: "Building Alder AI — custom AI automation for healthcare SMBs" },
    { tag: "music-production", weight: 0.5, context: "Released album 'Mode of Being', produces music as creative outlet" },
    { tag: "philosophical-writing", weight: 0.6, context: "Writing Retrocausal Manifesto, 10-essay series on agency and meaning" },
    { tag: "matchmaking-technology", weight: 0.7, context: "Building AI matchmaking at Keeper — psychometric profiling, compatibility algorithms" },
  ],
  interests: [
    "agent-coordination", "stoicism", "meaning-making", "indie-music",
    "screenwriting", "climbing", "health-optimization", "ai-infrastructure",
    "psychometrics", "philosophy-of-mind", "creative-expression", "entrepreneurship"
  ],
  personality: {
    style: "direct, analytical, clinical, truth-seeking, contrarian",
    energy: "introvert-leaning, high-openness, melancholic temperament",
    collaboration: "prefers async, small teams, values competence over credentials"
  },
  context: {
    location: "Fort Collins, CO",
    timezone: "America/Denver",
    stage: "multi-project-founder",
    industry: "ai"
  },
  summary: "32-year-old founder in Fort Collins building multiple AI projects: Schelling Protocol (agent coordination), Alder AI (healthcare automation consulting), and co-founding Keeper (AI matchmaking). Deeply into stoic philosophy, meaning-making, and creative expression — has an album, writes essays, two podcasts in production. Dealing with chronic health issues. Looking for a house in Colorado. Values brutal honesty, ships fast, and wants to find co-conspirators who care about building things that matter. Natural outsider and contrarian."
};

// ─── 30 Synthetic Profiles ──────────────────────────────────

const syntheticProfiles = [
  {
    slug: "rust-agent-dev",
    display_name: "Marcus Chen",
    needs: [
      { tag: "co-founder-product", weight: 0.8, context: "building agent infra tools, needs product/design partner" },
      { tag: "seed-funding", weight: 0.5, context: "bootstrapping, exploring fundraising" },
    ],
    offers: [
      { tag: "rust-systems-programming", weight: 1.0, context: "5 years Rust, built 3 MCP servers" },
      { tag: "agent-infrastructure", weight: 0.9, context: "building agent runtime in Rust" },
    ],
    interests: ["agent-coordination", "type-systems", "stoicism", "hiking", "open-source"],
    personality: { style: "methodical, precise, open-source advocate", energy: "introvert", collaboration: "async, code reviews" },
    context: { location: "Boulder, CO", timezone: "America/Denver", stage: "early-stage-founder", industry: "ai" },
    summary: "Rust developer in Boulder building an agent runtime. Wants to start a company around agent infrastructure but needs a product-minded co-founder. Into stoicism and hiking. Methodical, ships clean code."
  },
  {
    slug: "denver-cpa",
    display_name: "Sarah Kim",
    needs: [
      { tag: "small-business-clients", weight: 0.9, context: "growing solo CPA practice" },
      { tag: "tech-savvy-referrals", weight: 0.6, context: "wants startup/tech founder clients" },
    ],
    offers: [
      { tag: "tax-accounting-crypto", weight: 1.0, context: "CPA specializing in crypto tax and startup accounting" },
      { tag: "financial-planning", weight: 0.7, context: "helps founders with financial strategy" },
    ],
    interests: ["personal-finance", "rock-climbing", "board-games", "cryptocurrency"],
    personality: { style: "organized, detail-oriented, warm", energy: "ambivert", collaboration: "scheduled meetings, async follow-ups" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "solo-practitioner", industry: "accounting" },
    summary: "CPA in Denver specializing in crypto tax and startup accounting. Building a solo practice, looking for tech founder clients. Climbs at Movement gym on weekends. Organized and reliable."
  },
  {
    slug: "health-researcher",
    display_name: "Dr. Aisha Patel",
    needs: [
      { tag: "tech-collaboration", weight: 0.7, context: "wants to build health tracking tools for patients" },
      { tag: "patient-community-access", weight: 0.5, context: "researching CFS, needs participants" },
    ],
    offers: [
      { tag: "cfs-treatment-expertise", weight: 1.0, context: "integrative medicine doctor specializing in chronic fatigue" },
      { tag: "health-optimization", weight: 0.9, context: "functional medicine, supplement stacks, lifestyle protocols" },
    ],
    interests: ["health-optimization", "functional-medicine", "ai-in-healthcare", "yoga", "neuroscience"],
    personality: { style: "empathetic, evidence-based, curious", energy: "ambivert", collaboration: "research partnerships, co-authoring" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "mid-career", industry: "healthcare" },
    summary: "Integrative medicine doctor in Denver specializing in chronic fatigue syndrome. Researching novel treatment protocols. Wants to build tech tools for patient tracking but lacks engineering skills. Evidence-based but open to unconventional approaches."
  },
  {
    slug: "podcast-engineer",
    display_name: "Jake Torres",
    needs: [
      { tag: "podcast-clients", weight: 0.9, context: "freelance audio engineer looking for recurring clients" },
      { tag: "content-creation-partner", weight: 0.4, context: "wants to co-host a music production podcast" },
    ],
    offers: [
      { tag: "podcast-production", weight: 1.0, context: "full-service podcast production — editing, mixing, mastering, distribution" },
      { tag: "audio-engineering", weight: 0.9, context: "10 years audio engineering, studio and live" },
      { tag: "music-production", weight: 0.7, context: "produces electronic music on the side" },
    ],
    interests: ["music-production", "podcasting", "audio-technology", "synthesizers", "indie-music"],
    personality: { style: "creative, easygoing, detail-oriented on audio", energy: "extrovert", collaboration: "weekly check-ins, creative sessions" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "freelancer", industry: "media" },
    summary: "Freelance podcast producer and audio engineer in Fort Collins. Does full-service production — you record, he handles everything else. Also produces electronic music. Looking for recurring podcast clients and music collaborators."
  },
  {
    slug: "essay-philosopher",
    display_name: "Nora Blackwell",
    needs: [
      { tag: "writing-accountability", weight: 0.8, context: "has 50 essay drafts but publishes nothing" },
      { tag: "philosophical-sparring-partner", weight: 0.7, context: "wants someone to argue ideas with" },
    ],
    offers: [
      { tag: "philosophical-writing", weight: 1.0, context: "published in Aeon, The Point, N+1" },
      { tag: "editing-and-feedback", weight: 0.8, context: "former literary magazine editor" },
    ],
    interests: ["philosophy-of-mind", "meaning-making", "creative-expression", "continental-philosophy", "literary-criticism"],
    personality: { style: "intellectual, contrarian, witty, rigorous", energy: "introvert", collaboration: "async writing exchanges, occasional deep calls" },
    context: { location: "Brooklyn, NY", timezone: "America/New_York", stage: "independent-writer", industry: "publishing" },
    summary: "Published philosopher and essayist in Brooklyn. Writes about agency, meaning, and consciousness. Has 50 unpublished drafts because she can never stop revising. Former literary magazine editor. Looking for a thinking partner who actually ships."
  },
  {
    slug: "healthcare-ai-founder",
    display_name: "David Park",
    needs: [
      { tag: "ai-automation-partner", weight: 0.9, context: "wants to add AI automation to his healthcare SaaS" },
      { tag: "sales-channel", weight: 0.6, context: "needs more distribution for his product" },
    ],
    offers: [
      { tag: "healthcare-domain-expertise", weight: 1.0, context: "10 years in health tech, knows the buyer" },
      { tag: "enterprise-sales", weight: 0.8, context: "sold to 200+ medical practices" },
      { tag: "seed-investment", weight: 0.5, context: "angel invests in health-adjacent startups" },
    ],
    interests: ["ai-in-healthcare", "entrepreneurship", "golf", "health-optimization"],
    personality: { style: "strategic, relationship-oriented, pragmatic", energy: "extrovert", collaboration: "regular calls, partnership-oriented" },
    context: { location: "Austin, TX", timezone: "America/Chicago", stage: "growth-stage-founder", industry: "healthcare" },
    summary: "Health tech founder in Austin with a SaaS serving 200+ medical practices. Wants to add AI automation but doesn't have the technical depth. Angel invests in adjacent startups. Pragmatic, relationship-driven, knows the healthcare buyer."
  },
  {
    slug: "indie-musician-co",
    display_name: "Eli Sutherland",
    needs: [
      { tag: "music-collaborator", weight: 0.9, context: "looking for a co-producer for new album" },
      { tag: "music-distribution", weight: 0.6, context: "wants to figure out modern distribution and marketing" },
    ],
    offers: [
      { tag: "music-production", weight: 1.0, context: "3 self-produced albums, bedroom producer" },
      { tag: "songwriting", weight: 0.8, context: "strong melodic and lyrical sense" },
    ],
    interests: ["indie-music", "analog-synths", "screenwriting", "philosophy", "hiking"],
    personality: { style: "creative, introspective, perfectionist", energy: "deep introvert", collaboration: "async file sharing, occasional in-person sessions" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "independent-artist", industry: "music" },
    summary: "Indie musician in Denver, 3 self-produced albums. Looking for a co-producer for the next project. Also writes screenplays. Perfectionist who needs someone to push him to finish things. Into analog synths and philosophy."
  },
  {
    slug: "real-estate-noco",
    display_name: "Patricia Morales",
    needs: [
      { tag: "tech-savvy-buyers", weight: 0.8, context: "specializes in relocating tech workers to northern CO" },
    ],
    offers: [
      { tag: "real-estate-northern-colorado", weight: 1.0, context: "15 years selling in FoCo, Loveland, Bellvue, Laporte" },
      { tag: "property-investment-advice", weight: 0.7, context: "owns 4 rental properties herself" },
    ],
    interests: ["real-estate", "mountain-living", "hiking", "community-building"],
    personality: { style: "outgoing, knowledgeable, persistent", energy: "extrovert", collaboration: "phone calls, showings, responsive texts" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "established", industry: "real-estate" },
    summary: "Real estate agent in Fort Collins, 15 years experience in northern Colorado. Specializes in relocating tech workers. Knows Bellvue, Laporte, and mountain properties well. Also an investor — owns 4 rentals."
  },
  {
    slug: "matchmaking-researcher",
    display_name: "Dr. Lena Ivanova",
    needs: [
      { tag: "industry-partner", weight: 0.8, context: "wants to apply psychometric research to real products" },
      { tag: "ai-engineering-help", weight: 0.6, context: "brilliant researcher, weak on implementation" },
    ],
    offers: [
      { tag: "psychometrics-research", weight: 1.0, context: "PhD in psychometrics, published on compatibility prediction" },
      { tag: "matchmaking-algorithms", weight: 0.9, context: "developed novel compatibility scoring models" },
    ],
    interests: ["psychometrics", "ai-matchmaking", "personality-psychology", "statistics", "opera"],
    personality: { style: "rigorous, collaborative, curious", energy: "ambivert", collaboration: "research partnership, co-publishing" },
    context: { location: "Zurich, Switzerland", timezone: "Europe/Zurich", stage: "academic", industry: "research" },
    summary: "Psychometrics researcher in Zurich studying compatibility prediction. Published papers on novel matching algorithms. Wants to apply research to real products but needs an industry partner with AI engineering chops."
  },
  {
    slug: "screenwriter-la",
    display_name: "Marco Reyes",
    needs: [
      { tag: "writing-partner", weight: 0.8, context: "writing a sci-fi series, needs a co-writer for worldbuilding" },
      { tag: "tech-advisor", weight: 0.5, context: "writing about AI agents, needs technical accuracy" },
    ],
    offers: [
      { tag: "screenwriting", weight: 1.0, context: "WGA member, 2 produced features" },
      { tag: "storytelling", weight: 0.9, context: "exceptional narrative structure" },
    ],
    interests: ["screenwriting", "science-fiction", "ai-ethics", "philosophy-of-mind", "surfing"],
    personality: { style: "imaginative, disciplined, collaborative", energy: "ambivert", collaboration: "writers room style, daily check-ins during sprints" },
    context: { location: "Los Angeles, CA", timezone: "America/Los_Angeles", stage: "mid-career", industry: "entertainment" },
    summary: "WGA screenwriter in LA, 2 produced features. Writing a sci-fi series about AI agents and needs technical accuracy. Looking for a co-writer who understands both the philosophy and the engineering of AI."
  },
  {
    slug: "ai-sales-rep",
    display_name: "Tanya Okonkwo",
    needs: [
      { tag: "ai-product-to-sell", weight: 0.9, context: "experienced enterprise sales, looking for an AI product to represent" },
    ],
    offers: [
      { tag: "enterprise-sales", weight: 1.0, context: "sold $2M ARR at 2 SaaS companies" },
      { tag: "healthcare-network", weight: 0.8, context: "deep network in healthcare administration" },
    ],
    interests: ["ai-in-healthcare", "sales-strategy", "networking", "fitness"],
    personality: { style: "driven, persuasive, relationship-builder", energy: "extrovert", collaboration: "daily standups, commission-based" },
    context: { location: "Chicago, IL", timezone: "America/Chicago", stage: "looking-for-next-role", industry: "sales" },
    summary: "Enterprise sales pro in Chicago with $2M ARR track record. Deep healthcare admin network. Looking for an AI product to represent — preferably healthcare automation. Commission-hungry, results-oriented."
  },
  {
    slug: "climbing-partner-foco",
    display_name: "Kai Bergström",
    needs: [
      { tag: "climbing-partner", weight: 1.0, context: "just moved to FoCo, no climbing partners yet" },
      { tag: "local-community", weight: 0.7, context: "new to town, looking for friends" },
    ],
    offers: [
      { tag: "climbing-expertise", weight: 0.9, context: "V8 boulderer, trad lead to 5.11" },
      { tag: "outdoor-guiding", weight: 0.6, context: "knows Horsetooth, Lumpy Ridge, RMNP" },
    ],
    interests: ["climbing", "philosophy", "coffee", "trail-running", "stoicism"],
    personality: { style: "chill, philosophical, adventurous", energy: "ambivert", collaboration: "in-person, spontaneous" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "software-engineer", industry: "tech" },
    summary: "Software engineer who just moved to Fort Collins. V8 boulderer looking for partners at Wicked Cave and Horsetooth. Into stoicism and philosophy. Knows RMNP climbing well. Looking for community."
  },
  {
    slug: "vc-ai-focus",
    display_name: "Priya Sharma",
    needs: [
      { tag: "ai-dealflow", weight: 1.0, context: "partner at seed fund, needs quality AI infrastructure deals" },
    ],
    offers: [
      { tag: "seed-investment", weight: 1.0, context: "$500K-$2M checks, AI infra focus" },
      { tag: "founder-mentorship", weight: 0.8, context: "former founder, strong network" },
      { tag: "fundraising-strategy", weight: 0.7, context: "helps portfolio companies raise Series A" },
    ],
    interests: ["ai-infrastructure", "agent-coordination", "entrepreneurship", "meditation"],
    personality: { style: "strategic, supportive, thesis-driven", energy: "ambivert", collaboration: "monthly board meetings, async updates" },
    context: { location: "San Francisco, CA", timezone: "America/Los_Angeles", stage: "investor", industry: "venture-capital" },
    summary: "Seed-stage VC in SF focused on AI infrastructure. Writes $500K-$2M checks. Former founder. Looking for agent coordination and AI infra deals specifically. Supportive, thesis-driven investor."
  },
  {
    slug: "functional-med-coach",
    display_name: "Bridget O'Neill",
    needs: [
      { tag: "tech-platform-for-clients", weight: 0.7, context: "wants an app for tracking client health protocols" },
      { tag: "marketing-help", weight: 0.5, context: "great practitioner, bad at marketing" },
    ],
    offers: [
      { tag: "health-optimization", weight: 1.0, context: "functional medicine health coach, specializes in fatigue and brain fog" },
      { tag: "supplement-protocol-design", weight: 0.9, context: "designs custom supplement stacks" },
    ],
    interests: ["health-optimization", "functional-medicine", "biohacking", "cooking", "hiking"],
    personality: { style: "nurturing, evidence-curious, holistic", energy: "ambivert", collaboration: "weekly sessions, protocol adjustments" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "solo-practitioner", industry: "health" },
    summary: "Functional medicine health coach in Fort Collins specializing in fatigue and brain fog. Designs custom supplement protocols. Wants a tech platform to track client progress but can't build one. Great clinician, bad marketer."
  },
  {
    slug: "mcp-plugin-dev",
    display_name: "Nina Volkov",
    needs: [
      { tag: "distribution-channel", weight: 0.8, context: "builds MCP servers but has no way to reach users" },
      { tag: "business-partner", weight: 0.6, context: "pure engineer, needs someone to handle GTM" },
    ],
    offers: [
      { tag: "mcp-server-development", weight: 1.0, context: "built 12 MCP servers, expert in the protocol" },
      { tag: "typescript-engineering", weight: 0.9, context: "senior TS/Node developer" },
    ],
    interests: ["agent-coordination", "open-source", "mcp", "developer-tools", "cats"],
    personality: { style: "technical, quiet, ships fast", energy: "introvert", collaboration: "async PRs, minimal meetings" },
    context: { location: "Portland, OR", timezone: "America/Los_Angeles", stage: "indie-developer", industry: "ai" },
    summary: "Indie developer in Portland who's built 12 MCP servers. Expert in the protocol but has zero distribution. Needs a business-minded partner to help reach users. Ships fast, hates meetings."
  },
  {
    slug: "creative-coworking",
    display_name: "River Hayes",
    needs: [
      { tag: "tenants-creatives", weight: 0.9, context: "opening a creative coworking space, needs founding members" },
    ],
    offers: [
      { tag: "studio-space", weight: 1.0, context: "renovating warehouse into music/art/writing studios" },
      { tag: "community-organizing", weight: 0.8, context: "connected to FoCo arts scene" },
    ],
    interests: ["creative-expression", "community-building", "indie-music", "architecture", "sustainability"],
    personality: { style: "warm, visionary, connector", energy: "extrovert", collaboration: "in-person, community events" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "launching", industry: "creative" },
    summary: "Opening a creative coworking space in Fort Collins — music studios, writing desks, art space. Looking for founding members. Deeply connected to the local arts scene. Vision: a Schelling point for creatives in NoCo."
  },
  // 15 more diverse profiles
  {
    slug: "data-scientist-health",
    display_name: "James Liu",
    needs: [{ tag: "health-data-sources", weight: 0.8, context: "building predictive health models" }],
    offers: [{ tag: "data-science", weight: 1.0, context: "PhD ML, health outcomes prediction" }, { tag: "statistical-analysis", weight: 0.9, context: "clinical trial analysis" }],
    interests: ["health-optimization", "machine-learning", "longevity", "running"],
    personality: { style: "analytical, methodical", energy: "introvert", collaboration: "data-driven partnerships" },
    context: { location: "Seattle, WA", timezone: "America/Los_Angeles", stage: "researcher", industry: "health-tech" },
    summary: "Health data scientist in Seattle building predictive models for chronic conditions. Needs diverse health data sources. Strong ML and statistics background."
  },
  {
    slug: "marketing-freelancer",
    display_name: "Alexa Dunn",
    needs: [{ tag: "tech-clients", weight: 0.9, context: "wants AI/SaaS companies as clients" }],
    offers: [{ tag: "content-marketing", weight: 1.0, context: "grew 3 startups from 0 to 50K blog traffic" }, { tag: "seo", weight: 0.8, context: "technical SEO specialist" }],
    interests: ["content-strategy", "ai-tools", "writing", "travel"],
    personality: { style: "strategic, creative, results-oriented", energy: "ambivert", collaboration: "monthly retainer, async" },
    context: { location: "Austin, TX", timezone: "America/Chicago", stage: "freelancer", industry: "marketing" },
    summary: "Freelance content marketer in Austin. Grew 3 SaaS startups from zero to 50K monthly blog traffic. Wants AI/developer tool clients specifically."
  },
  {
    slug: "therapist-founder",
    display_name: "Dr. Megan Walsh",
    needs: [{ tag: "tech-co-founder", weight: 0.9, context: "wants to build an AI therapy companion app" }],
    offers: [{ tag: "clinical-psychology", weight: 1.0, context: "licensed psychologist, CBT and ACT specialist" }, { tag: "therapy-product-insight", weight: 0.9, context: "knows what actually works in mental health" }],
    interests: ["mental-health", "ai-ethics", "stoicism", "meditation", "meaning-making"],
    personality: { style: "empathetic, evidence-based, entrepreneurial", energy: "ambivert", collaboration: "weekly co-founder calls" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "exploring-startup", industry: "mental-health" },
    summary: "Licensed psychologist in Denver who wants to build an AI therapy companion. CBT/ACT specialist. Into stoicism and meaning-making. Needs a technical co-founder who cares about mental health."
  },
  {
    slug: "web3-builder",
    display_name: "Dmitri Kozlov",
    needs: [{ tag: "ai-integration", weight: 0.7, context: "building decentralized identity for agents" }],
    offers: [{ tag: "blockchain-engineering", weight: 1.0, context: "smart contracts, decentralized identity" }, { tag: "protocol-design", weight: 0.9, context: "designed 2 L2 protocols" }],
    interests: ["decentralization", "agent-coordination", "cryptography", "philosophy"],
    personality: { style: "idealistic, technical, contrarian", energy: "introvert", collaboration: "async, open-source" },
    context: { location: "Berlin, Germany", timezone: "Europe/Berlin", stage: "indie-builder", industry: "crypto" },
    summary: "Protocol designer in Berlin working on decentralized identity for AI agents. Thinks agent coordination needs to be trustless. Wants to integrate AI reasoning with on-chain verification."
  },
  {
    slug: "retreat-organizer",
    display_name: "Sage Whitfield",
    needs: [{ tag: "speakers-and-facilitators", weight: 0.8, context: "organizing a founder retreat on meaning and work" }],
    offers: [{ tag: "event-production", weight: 1.0, context: "organized 20+ retreats" }, { tag: "community-facilitation", weight: 0.9, context: "expert facilitator" }],
    interests: ["meaning-making", "entrepreneurship", "stoicism", "nature", "meditation"],
    personality: { style: "warm, intentional, deep", energy: "ambivert", collaboration: "curated gatherings" },
    context: { location: "Taos, NM", timezone: "America/Denver", stage: "organizer", industry: "events" },
    summary: "Retreat organizer in Taos who runs founder gatherings focused on meaning, purpose, and philosophical alignment. Looking for speakers and facilitators for upcoming retreat on 'building things that matter.'"
  },
  {
    slug: "ai-writer-tools",
    display_name: "Sam Okafor",
    needs: [{ tag: "beta-testers", weight: 0.8, context: "built an AI writing tool, needs early users" }],
    offers: [{ tag: "ai-writing-tools", weight: 1.0, context: "built AI editor that understands voice" }, { tag: "nlp-engineering", weight: 0.9, context: "NLP PhD, fine-tuned writing models" }],
    interests: ["creative-expression", "natural-language-processing", "philosophy", "jazz"],
    personality: { style: "thoughtful, product-minded, creative", energy: "introvert", collaboration: "feedback loops, user interviews" },
    context: { location: "New York, NY", timezone: "America/New_York", stage: "early-stage-founder", industry: "ai" },
    summary: "NLP researcher turned founder in NYC. Built an AI writing tool that preserves your voice instead of homogenizing it. Looking for early users who write regularly — essayists, bloggers, authors."
  },
  {
    slug: "remote-pm",
    display_name: "Anika Johansson",
    needs: [{ tag: "side-project-to-join", weight: 0.8, context: "bored at big tech, wants a meaningful side project" }],
    offers: [{ tag: "product-management", weight: 1.0, context: "senior PM at a FAANG, 7 years" }, { tag: "user-research", weight: 0.8, context: "runs user research programs" }],
    interests: ["ai-infrastructure", "meaningful-work", "hiking", "board-games", "philosophy"],
    personality: { style: "organized, empathetic, strategic", energy: "ambivert", collaboration: "structured sprints, clear goals" },
    context: { location: "Seattle, WA", timezone: "America/Los_Angeles", stage: "employed-looking-for-meaning", industry: "tech" },
    summary: "Senior PM at a FAANG in Seattle. Bored. Wants to contribute to a meaningful side project — especially in AI infrastructure or coordination. Strong at user research and roadmapping."
  },
  {
    slug: "noco-architect",
    display_name: "Tom Briggs",
    needs: [{ tag: "residential-clients", weight: 0.9, context: "architect seeking custom home projects" }],
    offers: [{ tag: "residential-architecture", weight: 1.0, context: "designs custom homes in mountain settings" }, { tag: "sustainable-building", weight: 0.8, context: "passive house certified" }],
    interests: ["architecture", "sustainability", "mountain-living", "photography"],
    personality: { style: "visual, thoughtful, craftsmanship-oriented", energy: "introvert", collaboration: "design sessions, site visits" },
    context: { location: "Loveland, CO", timezone: "America/Denver", stage: "established", industry: "architecture" },
    summary: "Residential architect in Loveland specializing in mountain homes and sustainable design. Passive house certified. Looking for clients who want custom homes in northern Colorado."
  },
  {
    slug: "ai-ethics-prof",
    display_name: "Dr. Carmen Reyes",
    needs: [{ tag: "industry-case-studies", weight: 0.8, context: "writing book on agent ethics, needs real examples" }],
    offers: [{ tag: "ai-ethics-consulting", weight: 1.0, context: "tenured professor, published 30+ papers" }, { tag: "academic-credibility", weight: 0.8, context: "can lend academic weight to projects" }],
    interests: ["ai-ethics", "agent-coordination", "philosophy-of-mind", "writing"],
    personality: { style: "rigorous, curious, socratic", energy: "ambivert", collaboration: "research partnerships" },
    context: { location: "Cambridge, MA", timezone: "America/New_York", stage: "tenured-professor", industry: "academia" },
    summary: "AI ethics professor at MIT writing a book on autonomous agent ethics. Needs real-world case studies from people building agent coordination systems. Can provide academic credibility and ethical frameworks."
  },
  {
    slug: "fitness-coach-tech",
    display_name: "Derek Simmons",
    needs: [{ tag: "tech-clients-health", weight: 0.9, context: "personal trainer specializing in desk workers" }],
    offers: [{ tag: "personal-training", weight: 1.0, context: "CSCS certified, specializes in fatigue and desk-worker rehab" }, { tag: "health-optimization", weight: 0.8, context: "training protocols for chronic fatigue" }],
    interests: ["health-optimization", "strength-training", "biohacking", "nutrition"],
    personality: { style: "motivating, practical, science-based", energy: "extrovert", collaboration: "3x/week training sessions" },
    context: { location: "Fort Collins, CO", timezone: "America/Denver", stage: "trainer", industry: "fitness" },
    summary: "Personal trainer in Fort Collins specializing in desk workers and people with chronic fatigue. CSCS certified. Designs training protocols that work around low energy days. Science-based approach."
  },
  {
    slug: "longevity-biotech",
    display_name: "Dr. Kyle Erickson",
    needs: [{ tag: "ai-partner", weight: 0.8, context: "wants AI to analyze clinical trial data faster" }],
    offers: [{ tag: "longevity-research", weight: 1.0, context: "runs longevity biotech startup" }, { tag: "clinical-trials-access", weight: 0.9, context: "running 3 trials on fatigue interventions" }],
    interests: ["longevity", "health-optimization", "neuroscience", "ai-in-healthcare"],
    personality: { style: "driven, scientific, visionary", energy: "ambivert", collaboration: "research partnerships" },
    context: { location: "San Diego, CA", timezone: "America/Los_Angeles", stage: "startup-founder", industry: "biotech" },
    summary: "Biotech founder in San Diego running clinical trials on fatigue interventions. Has data, needs AI analysis. Running 3 active trials studying novel fatigue treatments."
  },
  {
    slug: "philosopher-youtuber",
    display_name: "Elias Thorne",
    needs: [{ tag: "philosophical-guests", weight: 0.8, context: "hosts philosophy YouTube channel, needs interesting guests" }, { tag: "audience-growth", weight: 0.6, context: "12K subs, wants to grow" }],
    offers: [{ tag: "video-production", weight: 0.9, context: "high-quality philosophy content" }, { tag: "audience-access", weight: 0.7, context: "12K engaged philosophy subscribers" }],
    interests: ["philosophy-of-mind", "stoicism", "meaning-making", "filmmaking", "ai-ethics"],
    personality: { style: "charismatic, deep, Socratic", energy: "ambivert", collaboration: "guest interviews, co-produced content" },
    context: { location: "Portland, OR", timezone: "America/Los_Angeles", stage: "creator", industry: "media" },
    summary: "Philosophy YouTuber in Portland, 12K subscribers. Creates long-form content on meaning, agency, and consciousness. Looking for interesting guests — especially founders who think deeply about what they're building."
  },
  {
    slug: "divorce-attorney-co",
    display_name: "Rachel Kim-Novak",
    needs: [{ tag: "ai-document-processing", weight: 0.7, context: "wants AI to automate family law document prep" }],
    offers: [{ tag: "legal-services-colorado", weight: 1.0, context: "family law attorney in Colorado" }],
    interests: ["legal-tech", "ai-tools", "running", "cooking"],
    personality: { style: "pragmatic, empathetic, efficient", energy: "ambivert", collaboration: "professional consultations" },
    context: { location: "Denver, CO", timezone: "America/Denver", stage: "partner", industry: "legal" },
    summary: "Family law attorney in Denver. Wants AI to automate the tedious document prep that eats 40% of her team's time. Open to working with AI builders on a pilot."
  },
  {
    slug: "bookkeeper-remote",
    display_name: "Mei Lin Chen",
    needs: [{ tag: "startup-clients", weight: 0.9, context: "specializes in early-stage startup bookkeeping" }],
    offers: [{ tag: "bookkeeping", weight: 1.0, context: "CPA, remote bookkeeping for startups" }, { tag: "financial-modeling", weight: 0.7, context: "runway models, burn rate analysis" }],
    interests: ["startups", "financial-modeling", "baking", "travel"],
    personality: { style: "detail-oriented, reliable, quiet", energy: "introvert", collaboration: "monthly reports, async" },
    context: { location: "Remote", timezone: "America/Los_Angeles", stage: "freelancer", industry: "finance" },
    summary: "Remote CPA specializing in early-stage startup bookkeeping. Does runway models, burn rate analysis, and tax prep. Looking for AI/tech startup clients specifically."
  },
];

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  console.log("🔮 Serendipity Dogfood — Phase 0\n");

  // 1. Create Alex's card
  console.log("1️⃣  Creating Alex's agent card...");
  const alexCard = await api("POST", "/api/cards", {
    slug: "alex-rivera",
    display_name: "Alex Rivera",
    tagline: "Building AI coordination infrastructure",
    card_type: "human",
    skills: ["ai-infrastructure", "mcp", "agent-orchestration", "product-leadership", "music-production"],
    availability: "available",
  });
  
  const alexApiKey = alexCard.api_key;
  const alexCardId = alexCard.card?.id;
  if (!alexApiKey) {
    console.error("  ❌ Failed to create card:", JSON.stringify(alexCard).slice(0, 200));
    process.exit(1);
  }
  console.log(`  ✅ Card created: ${alexCard.slug}`);
  console.log(`  🔑 API Key: ${alexApiKey.slice(0, 8)}...`);

  // 2. Create synthetic cards
  console.log("\n2️⃣  Creating 30 synthetic agent cards...");
  const syntheticKeys: Record<string, { apiKey: string; cardId: string }> = {};
  
  for (const profile of syntheticProfiles) {
    const card = await api("POST", "/api/cards", {
      slug: profile.slug,
      display_name: profile.display_name,
      tagline: profile.summary.slice(0, 200),
      card_type: "human",
      skills: profile.interests.slice(0, 5),
      availability: "available",
    });
    const key = card.api_key;
    const id = card.card?.id;
    if (key) {
      syntheticKeys[profile.slug] = { apiKey: key, cardId: id };
      process.stdout.write(".");
    } else {
      process.stdout.write("x");
    }
  }
  console.log(` ✅ ${Object.keys(syntheticKeys).length} cards created`);

  // 3. Generate embeddings and publish signals
  console.log("\n3️⃣  Generating embeddings (OpenAI text-embedding-3-small, 256 dims)...");
  
  // Alex's signal
  console.log("  📡 Generating Alex's embeddings...");
  const alexNeedsText = alexSignal.needs.map(n => `${n.tag}: ${n.context}`).join("; ");
  const alexOffersText = alexSignal.offers.map(o => `${o.tag}: ${o.context}`).join("; ");
  
  const [alexNeedsEmb, alexOffersEmb, alexProfileEmb] = await Promise.all([
    embed(alexNeedsText),
    embed(alexOffersText),
    embed(alexSignal.summary),
  ]);
  console.log("  ✅ Alex's embeddings generated");

  // Publish Alex's signal
  console.log("  📤 Publishing Alex's signal...");
  const alexSignalId = uuid();
  const alexSigResult = await api("PUT", `/api/serendipity/signals/${alexSignalId}?card=alex-rivera`, {
    needs: alexSignal.needs,
    offers: alexSignal.offers,
    interests: alexSignal.interests,
    personality: alexSignal.personality,
    context: alexSignal.context,
    needs_embedding: alexNeedsEmb,
    offers_embedding: alexOffersEmb,
    profile_embedding: alexProfileEmb,
    summary: alexSignal.summary,
    ttl_days: 30,
  }, alexApiKey);
  console.log(`  ✅ Signal published:`, JSON.stringify(alexSigResult).slice(0, 100));

  // Synthetic signals
  console.log("\n4️⃣  Publishing 30 synthetic signals (generating embeddings for each)...");
  let publishedCount = 0;
  
  for (const profile of syntheticProfiles) {
    const keys = syntheticKeys[profile.slug];
    if (!keys) continue;
    
    const needsText = profile.needs.map(n => `${n.tag}: ${n.context}`).join("; ");
    const offersText = profile.offers.map(o => `${o.tag}: ${o.context}`).join("; ");
    
    const [needsEmb, offersEmb, profileEmb] = await Promise.all([
      embed(needsText),
      embed(offersText),
      embed(profile.summary),
    ]);

    const sigId = uuid();
    await api("PUT", `/api/serendipity/signals/${sigId}?card=${profile.slug}`, {
      needs: profile.needs,
      offers: profile.offers,
      interests: profile.interests,
      personality: profile.personality,
      context: profile.context,
      needs_embedding: needsEmb,
      offers_embedding: offersEmb,
      profile_embedding: profileEmb,
      summary: profile.summary,
      ttl_days: 30,
    }, keys.apiKey);
    
    publishedCount++;
    process.stdout.write(".");
  }
  console.log(` ✅ ${publishedCount} synthetic signals published`);

  // 5. Check matches
  console.log("\n5️⃣  Checking Alex's matches...\n");
  const matches = await api("GET", "/api/serendipity/matches?card=alex-rivera", null, alexApiKey);
  
  const matchList = matches.data || matches.matches || matches || [];
  
  if (!Array.isArray(matchList) || matchList.length === 0) {
    console.log("❌ No matches found. The matching engine may need threshold tuning.");
    console.log("   Raw response:", JSON.stringify(matches, null, 2).slice(0, 500));
    return;
  }

  console.log(`🔮 Found ${matchList.length} matches for Alex:\n`);
  console.log("═".repeat(80));
  
  for (let i = 0; i < matchList.length; i++) {
    const m = matchList[i];
    const score = m.score?.toFixed(3) || m.composite?.toFixed(3) || "?";
    const type = m.match_type || m.matchType || "unknown";
    const breakdown = m.score_breakdown ? 
      (typeof m.score_breakdown === 'string' ? JSON.parse(m.score_breakdown) : m.score_breakdown) : {};
    
    // Get the other side's signal info
    const other = m.other_signal || m.otherSignal || {};
    const otherContext = typeof other.context === 'string' ? JSON.parse(other.context) : (other.context || {});
    const otherNeeds = typeof other.needs === 'string' ? JSON.parse(other.needs) : (other.needs || []);
    const otherOffers = typeof other.offers === 'string' ? JSON.parse(other.offers) : (other.offers || []);
    const otherInterests = typeof other.interests === 'string' ? JSON.parse(other.interests) : (other.interests || []);
    
    console.log(`\n${i + 1}. [${score}] ${type.toUpperCase()}`);
    console.log(`   📍 ${otherContext.location || "?"} | ${otherContext.stage || "?"} | ${otherContext.industry || "?"}`);
    console.log(`   📝 ${other.summary || "(no summary)"}`);
    if (otherNeeds.length) console.log(`   🔍 Needs: ${otherNeeds.map((n: any) => n.tag).join(", ")}`);
    if (otherOffers.length) console.log(`   💡 Offers: ${otherOffers.map((o: any) => o.tag).join(", ")}`);
    if (otherInterests.length) console.log(`   ❤️  Interests: ${otherInterests.join(", ")}`);
    if (breakdown.complementarity !== undefined) {
      console.log(`   📊 Scores: complementarity=${breakdown.complementarity?.toFixed(2)} interest=${breakdown.interest?.toFixed(2)} similarity=${breakdown.similarity?.toFixed(2)} context=${breakdown.context?.toFixed(2)}`);
    }
    console.log("─".repeat(80));
  }
  
  console.log(`\n✅ Dogfood complete. ${matchList.length} matches found.`);
  console.log("Review the matches above. Are they people Alex would actually want to meet?");
}

main().catch(console.error);
