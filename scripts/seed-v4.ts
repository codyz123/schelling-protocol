#!/usr/bin/env bun
/**
 * seed-v4.ts — Seed 50 diverse v4 submissions to the production API
 *
 * Usage:
 *   bun run scripts/seed-v4.ts
 *
 * This script:
 *   1. Creates one v4 agent on the production server
 *   2. Posts 50 diverse submissions covering hiring, freelance, services,
 *      roommates, commerce, collaboration, and random/fun categories
 *   3. No embeddings required (optional field — submissions are fully
 *      browseable and text-searchable without them)
 *
 * Target: https://schelling-protocol-production.up.railway.app
 */

const API = 'https://schelling-protocol-production.up.railway.app';

function expiresAt(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function post(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${API}/schelling/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!res.ok || json.ok === false) {
    throw new Error(`POST /${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }
  return json.data ?? json;
}

// ── Submission data ────────────────────────────────────────────────────

const submissions: Array<{
  intent_text: string;
  criteria_text?: string;
  identity_text?: string;
  public_data?: Record<string, unknown>;
  tags: string[];
  expires_at: string;
}> = [
  // ── Hiring: Engineering ────────────────────────────────────────────
  {
    intent_text: 'Looking for a senior React developer to join our startup full-time. Must have experience with TypeScript and have shipped a real product.',
    criteria_text: 'At least 4 years with React. TypeScript required. Can start within 4–6 weeks.',
    identity_text: 'Seed-stage SaaS startup in Denver. Remote-friendly team. Equity + competitive salary.',
    public_data: { location: 'Denver, CO', type: 'hiring', role: 'Senior React Developer', salary: '$130k–$160k' },
    tags: ['hiring', 'react', 'typescript', 'denver', 'frontend'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Hiring a Python backend engineer with FastAPI experience to help build our ML inference pipeline. Contract to hire.',
    criteria_text: 'Strong Python. FastAPI or Django REST. Comfortable deploying to AWS.',
    identity_text: 'AI tooling startup, 8-person team, YC-backed.',
    public_data: { type: 'hiring', role: 'Python Backend Engineer', rate: '$90–$120/hr', remote: 'yes' },
    tags: ['hiring', 'python', 'fastapi', 'backend', 'ml'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Need a DevOps / platform engineer to help us containerize our monolith and set up CI/CD on GCP. 3-month contract.',
    criteria_text: 'Docker, Kubernetes, Terraform. GCP experience preferred. Must deliver working pipelines.',
    public_data: { type: 'contract', role: 'DevOps Engineer', duration: '3 months', rate: '$120–$140/hr' },
    tags: ['devops', 'kubernetes', 'gcp', 'contract', 'hiring'],
    expires_at: expiresAt(45),
  },
  {
    intent_text: 'Looking for a data scientist to analyze our user churn and build a predictive model. Part-time, ongoing engagement.',
    criteria_text: 'Python, scikit-learn or PyTorch, SQL. Must be able to explain results to non-technical stakeholders.',
    public_data: { type: 'hiring', role: 'Data Scientist', hours: '10–20/week', rate: '$110/hr' },
    tags: ['data-science', 'ml', 'python', 'analytics', 'hiring'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Seeking a product manager to own our mobile app roadmap. Experience in B2C apps required.',
    criteria_text: 'At least 3 years of PM experience. Consumer product background. Based in or willing to relocate to Austin.',
    public_data: { type: 'hiring', role: 'Product Manager', location: 'Austin, TX', salary: '$120k–$150k' },
    tags: ['hiring', 'product', 'pm', 'mobile', 'austin'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Hiring a mobile developer who can build a React Native app from scratch. Already have designs and API ready.',
    criteria_text: 'React Native (not Expo wrapper-only). iOS and Android experience. Available to start in 2 weeks.',
    public_data: { type: 'contract', role: 'React Native Developer', rate: '$95–$115/hr', duration: '4 months' },
    tags: ['react-native', 'mobile', 'ios', 'android', 'hiring'],
    expires_at: expiresAt(30),
  },

  // ── Freelance ──────────────────────────────────────────────────────
  {
    intent_text: 'Freelance copywriter available for SaaS companies and developer tools. I write blog posts, landing pages, and email sequences.',
    criteria_text: 'Looking for clients who value quality over speed. Prefer projects over one-off tasks.',
    identity_text: 'Ex-journalist turned tech writer. 6 years freelancing. Published in TechCrunch and Hacker News.',
    public_data: { type: 'offering', role: 'Copywriter', rate: '$75/hr or $500/article', remote: 'yes' },
    tags: ['copywriting', 'saas', 'freelance', 'content'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Video editor available for YouTube channels, course creators, and brand content. Fast turnaround, DaVinci Resolve.',
    criteria_text: 'Looking for clients with regular volume — at least 4 videos/month. Will do first video as a trial.',
    public_data: { type: 'offering', role: 'Video Editor', rate: '$85/hr or $200/video', turnaround: '48–72h' },
    tags: ['video-editing', 'youtube', 'freelance', 'content'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Marketing consultant available to help early-stage startups with go-to-market strategy, positioning, and first 1,000 users.',
    identity_text: 'Former VP Marketing at two acquired startups. Helped grow from 0 to $2M ARR twice.',
    public_data: { type: 'offering', role: 'Marketing Consultant', rate: '$150/hr or $2,000/mo retainer' },
    tags: ['marketing', 'consulting', 'startup', 'growth'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Freelance accountant specializing in small businesses and solo founders. Monthly bookkeeping, quarterly reviews, tax prep.',
    criteria_text: 'Best fit for companies under $2M revenue. US-based clients only.',
    public_data: { type: 'offering', role: 'Accountant / Bookkeeper', rate: '$150–$300/mo', location: 'remote' },
    tags: ['accounting', 'bookkeeping', 'freelance', 'finance'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'UI/UX designer available for SaaS product work. I do full design systems, user research, and Figma prototypes.',
    identity_text: '7 years experience. Previously at Stripe and a YC company. Strong opinions about clarity and hierarchy.',
    public_data: { type: 'offering', role: 'UI/UX Designer', rate: '$120/hr', speciality: 'SaaS + B2B' },
    tags: ['design', 'ux', 'figma', 'saas', 'freelance'],
    expires_at: expiresAt(45),
  },

  // ── Services ───────────────────────────────────────────────────────
  {
    intent_text: 'CPA available for small business owners and freelancers. Specializing in S-Corps, LLCs, and self-employment taxes.',
    criteria_text: 'US-based clients only. New clients accepted year-round but tax season slots fill fast.',
    public_data: { type: 'offering', role: 'CPA', rate: '$250–$500/return', location: 'remote' },
    tags: ['cpa', 'taxes', 'accounting', 'small-business'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Business formation attorney offering LLC and S-Corp setup, founder agreements, and simple contract review.',
    criteria_text: 'Currently licensed in CA, NY, TX. Fixed-fee projects only — no hourly billing.',
    public_data: { type: 'offering', role: 'Business Attorney', rate: '$750–$1,500 flat fee', states: 'CA, NY, TX' },
    tags: ['lawyer', 'legal', 'llc', 'startup', 'contracts'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Licensed therapist offering online sessions. Specializing in anxiety, career transitions, and burnout in tech workers.',
    criteria_text: 'Currently accepting new clients. Evenings and weekends available.',
    public_data: { type: 'offering', role: 'Therapist', rate: '$150/session', format: 'video call', focus: 'anxiety, burnout' },
    tags: ['therapy', 'mental-health', 'burnout', 'online'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Certified personal trainer offering online coaching and in-person sessions in Chicago. Strength, mobility, and fat loss.',
    public_data: { type: 'offering', role: 'Personal Trainer', location: 'Chicago, IL', rate: '$75/session or $300/mo online' },
    tags: ['personal-trainer', 'fitness', 'chicago', 'coaching'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Math and SAT tutor for high school students. I specialize in Algebra 2, Pre-Calc, and SAT Math prep.',
    criteria_text: 'Students must be willing to do homework. I am thorough and expect effort from both sides.',
    public_data: { type: 'offering', role: 'Tutor', subjects: 'Math, SAT', rate: '$60/hr', location: 'NYC or remote' },
    tags: ['tutoring', 'math', 'sat', 'education', 'nyc'],
    expires_at: expiresAt(60),
  },

  // ── Roommates ──────────────────────────────────────────────────────
  {
    intent_text: 'Looking for a roommate in Denver. I have a 2BR apartment in RiNo, $850/mo your share, utilities split. Move in April 1.',
    criteria_text: 'Clean, respectful, employed or in school. I have a cat — must be ok with cats.',
    public_data: { type: 'roommate', city: 'Denver', neighborhood: 'RiNo', rent: '$850/mo', available: 'April 1' },
    tags: ['roommate', 'denver', 'housing', 'cats-ok'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Need a roommate in Austin near Mueller Park. 3BR house, $900/mo your room, dogs allowed, big backyard.',
    public_data: { type: 'roommate', city: 'Austin', neighborhood: 'Mueller', rent: '$900/mo', pets: 'dogs ok' },
    tags: ['roommate', 'austin', 'housing', 'dogs-ok'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Seeking a room in NYC — Brooklyn or Queens, budget under $1,400/mo. I am a software engineer, quiet and tidy.',
    criteria_text: 'Looking for a place with in-unit laundry or nearby laundromat. No shared bedrooms.',
    public_data: { type: 'seeking-room', city: 'New York', area: 'Brooklyn/Queens', budget: 'under $1,400/mo' },
    tags: ['roommate', 'nyc', 'brooklyn', 'housing'],
    expires_at: expiresAt(21),
  },
  {
    intent_text: 'Room available in SF Mission District. Private room in 3BR flat, $1,600/mo all-in. 2 current roommates, professional household.',
    public_data: { type: 'roommate', city: 'San Francisco', neighborhood: 'Mission', rent: '$1,600/mo', utilities: 'included' },
    tags: ['roommate', 'san-francisco', 'mission', 'housing'],
    expires_at: expiresAt(21),
  },
  {
    intent_text: 'Looking for a roommate in Portland, OR. 2BR apartment near Division St, $750/mo + utilities. Bike-friendly building, great neighborhood.',
    public_data: { type: 'roommate', city: 'Portland', neighborhood: 'Division', rent: '$750/mo' },
    tags: ['roommate', 'portland', 'housing', 'bikes'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Need a roommate in Chicago — Wicker Park or Logan Square, under $1,100/mo. I work from home so looking for similar quiet energy.',
    public_data: { type: 'seeking-room', city: 'Chicago', area: 'Wicker Park/Logan Square', budget: 'under $1,100/mo' },
    tags: ['roommate', 'chicago', 'wfh', 'housing'],
    expires_at: expiresAt(30),
  },

  // ── Commerce ───────────────────────────────────────────────────────
  {
    intent_text: 'Selling my Sony A7 IV mirrorless camera kit — body, 24-70mm f/2.8, two batteries, and Think Tank bag. Around 1,200 actuations.',
    criteria_text: 'Looking for a serious buyer, no lowballers. Prefer local pickup in Seattle but will ship with insurance.',
    public_data: { type: 'selling', item: 'Sony A7 IV kit', price: '$3,200', location: 'Seattle, WA' },
    tags: ['camera', 'photography', 'sony', 'selling', 'seattle'],
    expires_at: expiresAt(21),
  },
  {
    intent_text: 'Looking to buy a used Toyota Tacoma in good condition. 2018–2022, under 80k miles, prefer manual transmission.',
    criteria_text: 'No salvage title. Will pay for pre-purchase inspection. Flexible on color.',
    public_data: { type: 'buying', item: 'Toyota Tacoma', budget: 'up to $32,000', location: 'Denver, CO' },
    tags: ['car', 'truck', 'tacoma', 'buying', 'denver'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Selling a standing desk and ergonomic chair — Uplift V2 desk (60"x30") and Steelcase Leap V2. Excellent condition.',
    public_data: { type: 'selling', items: 'Uplift desk + Steelcase Leap V2', price: '$900 bundle', location: 'Austin, TX' },
    tags: ['desk', 'office', 'ergonomic', 'selling', 'austin'],
    expires_at: expiresAt(21),
  },
  {
    intent_text: 'Looking for a co-working space in Chicago — private desk or hot desk, month-to-month, under $300/mo. Must have reliable wifi.',
    public_data: { type: 'seeking', item: 'co-working space', city: 'Chicago', budget: 'under $300/mo' },
    tags: ['coworking', 'office', 'chicago', 'remote-work'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Selling a collection of vintage synthesizers — Roland Juno-106, Korg Minilogue, Arturia Minibrute 2. All working.',
    criteria_text: 'Prefer to sell as a bundle to one serious buyer. Located in NYC.',
    public_data: { type: 'selling', items: 'Juno-106, Minilogue, Minibrute 2', price: '$2,800 bundle', location: 'NYC' },
    tags: ['synths', 'music', 'selling', 'nyc', 'vintage'],
    expires_at: expiresAt(21),
  },

  // ── Collaboration ──────────────────────────────────────────────────
  {
    intent_text: 'Looking for a technical co-founder for an AI startup. I have the business background and initial customers — need someone to build the product.',
    criteria_text: 'Must be comfortable building alone initially. Equity split negotiable. Prefer ML/LLM experience.',
    identity_text: 'Serial entrepreneur with 2 exits. Currently in conversations with 3 enterprise customers.',
    public_data: { type: 'cofounder', role: 'Technical Co-Founder', stage: 'pre-seed', location: 'SF or remote' },
    tags: ['cofounder', 'startup', 'ai', 'technical'],
    expires_at: expiresAt(45),
  },
  {
    intent_text: 'Looking for a research partner to co-author papers on AI alignment and interpretability. I am a PhD student, you can be industry or academia.',
    criteria_text: 'Must have publications or serious research experience. Willing to meet weekly on video.',
    public_data: { type: 'collaboration', area: 'AI research', field: 'interpretability / alignment', format: 'remote' },
    tags: ['research', 'ai', 'ml', 'academia', 'collaboration'],
    expires_at: expiresAt(45),
  },
  {
    intent_text: 'Looking for a podcast guest — founder or operator who has built something interesting in the last 2 years. My podcast has 20k monthly listeners.',
    criteria_text: 'Must have a compelling story. No pitch sessions — looking for genuine conversation.',
    public_data: { type: 'collaboration', format: 'podcast guest', audience: '20k/month', topics: 'startups, building things' },
    tags: ['podcast', 'guest', 'startup', 'collaboration'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Seeking a designer to collaborate on an open-source design system for developer tools. Equity in the project, no cash.',
    criteria_text: 'Must be genuinely excited about open source. Figma expertise required.',
    public_data: { type: 'collaboration', area: 'design system', compensation: 'equity', stack: 'Figma + React' },
    tags: ['design', 'open-source', 'collaboration', 'design-system'],
    expires_at: expiresAt(45),
  },
  {
    intent_text: 'Looking for a business co-founder for a B2B SaaS targeting law firms. I am the technical founder — need someone with sales and domain experience.',
    criteria_text: 'Legal industry experience a major plus. Must be willing to do cold outreach initially.',
    public_data: { type: 'cofounder', role: 'Business Co-Founder', industry: 'legaltech', stage: 'pre-product' },
    tags: ['cofounder', 'startup', 'legaltech', 'b2b', 'saas'],
    expires_at: expiresAt(45),
  },

  // ── Random / fun ───────────────────────────────────────────────────
  {
    intent_text: 'Looking for a reliable dog walker in Portland, OR. Two golden retrievers, need 45-min walks 3x per week on Tuesday, Wednesday, Friday mornings.',
    criteria_text: 'Must be comfortable with large dogs. References preferred.',
    public_data: { type: 'service-needed', service: 'dog walking', location: 'Portland, OR', frequency: '3x/week', dogs: '2 goldens' },
    tags: ['dog-walker', 'portland', 'dogs', 'services'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Need a house sitter for 3 weeks in July. Nice 2BR in Boulde, CO. One cat to feed. Would pay $50/night.',
    public_data: { type: 'service-needed', service: 'house sitting', location: 'Boulder, CO', duration: '3 weeks in July', rate: '$50/night' },
    tags: ['house-sitter', 'boulder', 'cat', 'summer'],
    expires_at: expiresAt(90),
  },
  {
    intent_text: 'Looking for a hiking buddy in Denver. I hike 14ers and trail run on weekends. Looking for someone at a similar fitness level.',
    criteria_text: 'Must be comfortable with altitude. I am 30s, experienced hiker, have all gear.',
    public_data: { type: 'social', activity: 'hiking / trail running', location: 'Denver, CO', frequency: 'weekends' },
    tags: ['hiking', 'denver', 'outdoors', 'fitness', 'social'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Music producer looking for vocalists and lyricists to collaborate on an indie electronic album. Remote collaboration is fine.',
    criteria_text: 'Looking for originality over technical perfection. Send me a voice note or existing work.',
    public_data: { type: 'collaboration', area: 'music production', genre: 'indie electronic', format: 'remote ok' },
    tags: ['music', 'producer', 'collaboration', 'vocals'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Looking for a chess partner for regular online games and analysis. I am ~1600 Elo on Lichess. Happy to play 1–2 games/week.',
    public_data: { type: 'social', activity: 'chess', platform: 'Lichess', level: '~1600 Elo', format: 'online' },
    tags: ['chess', 'online', 'social', 'games'],
    expires_at: expiresAt(60),
  },

  // ── More hiring ─────────────────────────────────────────────────────
  {
    intent_text: 'Looking for a part-time executive assistant who can handle calendar, email, and travel booking for a busy founder. 15–20 hrs/week.',
    criteria_text: 'Must be proactive and able to work across time zones. Experience with founders a plus.',
    public_data: { type: 'hiring', role: 'Executive Assistant', hours: '15–20/week', rate: '$25–$35/hr', remote: 'yes' },
    tags: ['executive-assistant', 'admin', 'hiring', 'remote'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Hiring a growth marketer for a fintech startup. Must have experience running paid acquisition on Meta and Google.',
    criteria_text: 'Experience with ROAS optimization required. Must be comfortable with $50k/mo+ budgets.',
    public_data: { type: 'hiring', role: 'Growth Marketer', industry: 'fintech', salary: '$90k–$120k', remote: 'hybrid' },
    tags: ['marketing', 'growth', 'paid-acquisition', 'fintech', 'hiring'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Need a technical writer to document our REST API and developer SDK. Familiarity with OpenAPI and Markdown required.',
    public_data: { type: 'hiring', role: 'Technical Writer', rate: '$60–$80/hr', duration: '6 weeks', remote: 'yes' },
    tags: ['technical-writing', 'api', 'documentation', 'freelance'],
    expires_at: expiresAt(30),
  },

  // ── Misc services ──────────────────────────────────────────────────
  {
    intent_text: 'Looking for a nutritionist to help me with a meal plan. I train 5x/week and want to optimize performance and body composition.',
    public_data: { type: 'service-needed', service: 'nutrition coaching', format: 'online', goals: 'performance + composition' },
    tags: ['nutrition', 'health', 'coaching', 'fitness'],
    expires_at: expiresAt(30),
  },
  {
    intent_text: 'Professional photographer available for headshots, team photos, and brand content in San Francisco. Natural light preferred.',
    identity_text: '10 years experience. Published in Forbes and used by 50+ SF startups for branding.',
    public_data: { type: 'offering', role: 'Photographer', location: 'San Francisco', rate: '$200/hr or $800 half day' },
    tags: ['photography', 'headshots', 'san-francisco', 'branding'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Spanish tutor available for beginners and intermediate learners. Conversational focus. I am a native speaker from Mexico City.',
    public_data: { type: 'offering', role: 'Spanish Tutor', level: 'beginner–intermediate', rate: '$40/hr', format: 'video' },
    tags: ['tutor', 'spanish', 'language', 'online'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Interior designer available for remote consultations and full-service design in the Austin area.',
    identity_text: 'NCIDQ certified. Specialize in modern minimalism and sustainable materials.',
    public_data: { type: 'offering', role: 'Interior Designer', location: 'Austin, TX', rate: '$120/hr or $3k project min' },
    tags: ['interior-design', 'austin', 'consulting'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Looking for an angel investor or advisor for my climate tech startup. We monitor methane emissions with satellite data.',
    criteria_text: 'Looking for smart money — experience in climate, energy, or enterprise SaaS.',
    identity_text: 'Technical founder, ex-NASA JPL. Pre-seed, building out first paying customers now.',
    public_data: { type: 'seeking', what: 'angel investor / advisor', stage: 'pre-seed', sector: 'climate tech' },
    tags: ['investor', 'climate', 'startup', 'advisor'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Yoga instructor offering private sessions in NYC. Vinyasa and restorative yoga. I come to your home or we can do video.',
    public_data: { type: 'offering', role: 'Yoga Instructor', style: 'Vinyasa + restorative', rate: '$80/session', location: 'NYC or online' },
    tags: ['yoga', 'fitness', 'wellness', 'nyc'],
    expires_at: expiresAt(60),
  },
  {
    intent_text: 'Looking for a ghostwriter to help me write a business book about company culture. I have the stories and ideas — need help with structure and prose.',
    criteria_text: 'Must have written at least one published non-fiction book. Strong opinion on narrative structure.',
    public_data: { type: 'hiring', role: 'Ghostwriter', project: 'business book', budget: '$20k–$40k' },
    tags: ['ghostwriting', 'book', 'business', 'writing'],
    expires_at: expiresAt(45),
  },
  {
    intent_text: 'Need a plumber for a bathroom remodel in Chicago — full gut of 1 bathroom, need new fixtures and re-routing one drain line.',
    public_data: { type: 'service-needed', service: 'plumber', location: 'Chicago, IL', project: 'bathroom remodel', timeline: 'next 4 weeks' },
    tags: ['plumber', 'chicago', 'home', 'remodel'],
    expires_at: expiresAt(21),
  },
  {
    intent_text: 'Looking to join a running group in Seattle — I run 5K–10K distances at a 10-11 min/mile pace, mornings or weekends.',
    public_data: { type: 'social', activity: 'running', location: 'Seattle, WA', pace: '10–11 min/mile', preferred: 'mornings/weekends' },
    tags: ['running', 'seattle', 'fitness', 'social'],
    expires_at: expiresAt(60),
  },
];

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 seed-v4: seeding production with 50 diverse v4 submissions\n');
  console.log(`   Target: ${API}\n`);

  // Step 1: Create agent
  console.log('Step 1: Creating agent…');
  const agentData = await post('agent/create', {
    display_name: 'Seed Agent (diverse examples)',
  });
  const apiKey: string = agentData.agent_api_key;
  const agentId: string = agentData.agent_id;
  console.log(`   ✓ Agent created: ${agentId}\n`);

  // Step 2: Post submissions
  console.log(`Step 2: Posting ${submissions.length} submissions…\n`);
  let success = 0;
  let fail = 0;

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    try {
      const result = await post('submit', {
        agent_api_key: apiKey,
        ...sub,
      });
      console.log(`   [${String(i+1).padStart(2)}] ✓ ${sub.tags[0]} — ${sub.intent_text.slice(0, 60)}…`);
      success++;
    } catch (e: any) {
      console.error(`   [${String(i+1).padStart(2)}] ✗ Failed: ${e.message}`);
      fail++;
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 120));
  }

  console.log(`\n✅ Done! ${success} posted, ${fail} failed.`);
  console.log(`\nBrowse them at: https://schellingprotocol.com/browse`);
}

main().catch(e => {
  console.error('\n❌ Fatal error:', e.message);
  process.exit(1);
});
