#!/usr/bin/env bun
/**
 * seed-v4-500.ts — Seed 500 diverse submissions to production
 * Usage: bun run scripts/seed-v4-500.ts
 */

const API = 'https://schelling-protocol-production.up.railway.app';

function expiresAt(days = 30): string {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString();
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function post(path: string, body: Record<string, unknown>, key?: string): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const res = await fetch(`${API}/schelling/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return res.json();
}

// ─── Data pools ──────────────────────────────────────────────────────

const cities = ['Denver', 'Austin', 'NYC', 'San Francisco', 'Portland', 'Chicago', 'Seattle', 'LA', 'Boston', 'Miami', 'Nashville', 'Phoenix', 'Minneapolis', 'Atlanta', 'Philadelphia', 'Detroit', 'Salt Lake City', 'Raleigh', 'San Diego', 'Dallas', 'DC', 'Brooklyn', 'Oakland', 'Boulder', 'Boise', 'Asheville', 'Savannah', 'New Orleans', 'Pittsburgh', 'Columbus'];
const remoteOpts = ['remote', 'hybrid', 'onsite', 'remote-first', 'flexible'];
const tones = ['casual', 'formal', 'urgent', 'relaxed'];

// ─── Template generators ─────────────────────────────────────────────

interface Submission {
  intent_text: string;
  criteria_text?: string;
  identity_text?: string;
  public_data?: Record<string, any>;
  tags: string[];
}

function techHiring(): Submission {
  const roles = ['React developer', 'Python engineer', 'Rust developer', 'Go backend engineer', 'Java developer', 'Swift iOS developer', 'TypeScript fullstack dev', 'Ruby on Rails engineer', 'PHP developer', 'C++ systems programmer', 'DevOps engineer', 'SRE', 'ML engineer', 'Data scientist', 'Frontend developer', 'Backend engineer', 'Mobile developer', 'Android developer', 'Blockchain developer', 'Security engineer', 'QA engineer', 'Embedded systems engineer', 'Firmware developer', 'Platform engineer', 'Infrastructure engineer', 'AI/ML researcher', 'Computer vision engineer', 'NLP engineer', 'Database administrator', 'Cloud architect'];
  const levels = ['junior', 'mid-level', 'senior', 'staff', 'principal', 'lead'];
  const role = pick(roles);
  const level = pick(levels);
  const city = pick(cities);
  const remote = pick(remoteOpts);
  const salaryMin = rand(70, 180);
  const salaryMax = salaryMin + rand(20, 50);
  const intents = [
    `Hiring a ${level} ${role}. ${city}-based, ${remote}. $${salaryMin}-${salaryMax}k/year. Building a ${pick(['SaaS platform', 'fintech app', 'healthtech product', 'developer tools company', 'AI startup', 'e-commerce platform', 'gaming studio', 'cybersecurity firm', 'edtech company', 'climate tech startup'])}.`,
    `Looking for a ${level} ${role} to join our team in ${city}. ${remote} work. Competitive comp ($${salaryMin}-${salaryMax}k). We're a ${pick(['10-person startup', '50-person Series A', '200-person Series B', 'bootstrapped company', 'Y Combinator company', 'well-funded startup'])} working on ${pick(['real-time collaboration tools', 'autonomous vehicles', 'drug discovery', 'supply chain optimization', 'agent infrastructure', 'renewable energy tech', 'social audio', 'decentralized identity'])}.`,
    `Need a ${role} (${level}) for a ${rand(2, 12)}-month contract. ${city} or ${remote}. Budget: $${salaryMin}-${salaryMax}k. ${pick(['Urgent — starting ASAP.', 'Flexible start date.', 'Start next month.', 'Ideally starting within 2 weeks.'])}`,
  ];
  return {
    intent_text: pick(intents),
    criteria_text: `${pick(['Must have', 'Need', 'Looking for'])} ${rand(2, 8)}+ years experience. ${pick(['Strong communicator.', 'Self-directed.', 'Team player.', 'Fast learner.', 'Problem solver.'])} ${pick(['Portfolio required.', 'GitHub required.', 'References preferred.', ''])}`,
    identity_text: `We're a ${pick(['growing', 'fast-paced', 'mission-driven', 'profitable', 'venture-backed', 'bootstrapped'])} company in ${pick(['fintech', 'healthtech', 'developer tools', 'AI/ML', 'e-commerce', 'edtech', 'climate', 'gaming', 'social', 'enterprise SaaS'])}. ${pick(['Great culture.', 'Equity included.', 'Unlimited PTO.', 'Small team, big impact.', '4-day work week.', ''])}`,
    public_data: { city, type: 'hiring', role, level, salary_range: `$${salaryMin}-${salaryMax}k`, work_style: remote },
    tags: ['hiring', 'tech', role.split(' ')[0].toLowerCase(), level],
  };
}

function creativeHiring(): Submission {
  const roles = ['graphic designer', 'UI/UX designer', 'product designer', 'motion graphics artist', '3D artist', 'brand designer', 'illustrator', 'art director', 'video editor', 'photographer', 'animator', 'sound designer', 'creative director', 'visual designer', 'web designer'];
  const role = pick(roles);
  const city = pick(cities);
  const rate = rand(40, 200);
  return {
    intent_text: `Looking for a ${role} in ${city} (or remote). ${pick([`Budget: $${rate}/hr.`, `Project budget: $${rand(2, 30)}k.`, 'Competitive rates.'])} ${pick(['Building a brand from scratch.', 'Redesigning our product.', 'Need ongoing design support.', 'One-time project.', 'Marketing campaign.'])}`,
    criteria_text: `Strong portfolio. ${pick(['Figma expertise required.', 'After Effects skills preferred.', 'Brand experience preferred.', 'Agency background a plus.'])}`,
    public_data: { city, type: 'hiring', role, rate: `$${rate}/hr` },
    tags: ['hiring', 'creative', 'design', role.split(' ')[0].toLowerCase()],
  };
}

function businessHiring(): Submission {
  const roles = ['product manager', 'technical PM', 'scrum master', 'business analyst', 'operations manager', 'executive assistant', 'recruiter', 'HR manager', 'finance director', 'marketing manager', 'growth marketer', 'content strategist', 'SEO specialist', 'social media manager', 'sales director', 'account executive', 'customer success manager', 'data analyst', 'project manager', 'chief of staff'];
  const role = pick(roles);
  const city = pick(cities);
  return {
    intent_text: `Hiring a ${role}. ${city}, ${pick(remoteOpts)}. ${pick(['Startup environment.', 'Enterprise company.', 'Growing team.', 'Series A company.'])} ${pick([`$${rand(80, 200)}k base.`, 'Competitive comp + equity.', 'DOE.'])}`,
    criteria_text: `${rand(3, 10)}+ years experience. ${pick(['Strategic thinker.', 'Data-driven.', 'Strong leadership skills.', 'Cross-functional experience.'])}`,
    public_data: { city, type: 'hiring', role },
    tags: ['hiring', 'business', role.split(' ')[0].toLowerCase()],
  };
}

function freelanceOffering(): Submission {
  const services = ['copywriting', 'web development', 'app development', 'logo design', 'video production', 'voiceover', 'translation', 'data analysis', 'bookkeeping', 'tax preparation', 'legal consulting', 'executive coaching', 'tutoring', 'music production', 'photo editing', 'illustration', 'ghostwriting', 'technical writing', 'grant writing', 'speech writing', 'podcast production', 'social media management', 'email marketing', 'PPC management', 'conversion optimization', 'UX research', 'user testing', 'pitch deck design', 'financial modeling', 'market research'];
  const service = pick(services);
  const city = pick(cities);
  const years = rand(2, 15);
  const rate = rand(30, 250);
  return {
    intent_text: `Offering ${service} services. ${years} years experience. Based in ${city}, available ${pick(['worldwide', 'US only', 'remote', 'globally'])}. Rate: $${rate}/hr ${pick(['(negotiable)', '(fixed)', '(project-based also available)', ''])}. ${pick(['Currently have availability.', 'Taking new clients.', 'A few slots open this month.', 'Available immediately.'])}`,
    identity_text: `${years} years in ${service}. ${pick(['Former agency.', 'Previously at a Fortune 500.', 'Independent since ' + (2026 - years) + '.', 'Background in ' + pick(['tech', 'media', 'finance', 'healthcare', 'education']) + '.'])} ${pick(['100+ projects completed.', 'Worked with startups and enterprises.', 'Specialize in ' + pick(['B2B', 'B2C', 'SaaS', 'DTC', 'non-profit']) + '.', ''])}`,
    public_data: { city, type: 'freelance', service, rate: `$${rate}/hr`, experience: `${years} years` },
    tags: ['freelance', 'offering', service.split(' ')[0].toLowerCase()],
  };
}

function professionalService(): Submission {
  const services = [
    { role: 'CPA', spec: pick(['small business taxes', 'personal taxes', 'corporate accounting', 'nonprofit accounting', 'forensic accounting']) },
    { role: 'lawyer', spec: pick(['business formation', 'employment law', 'intellectual property', 'immigration', 'estate planning', 'contract law', 'real estate', 'criminal defense', 'family law', 'personal injury']) },
    { role: 'therapist', spec: pick(['anxiety and depression', 'couples therapy', 'EMDR', 'CBT', 'family therapy', 'grief counseling', 'addiction']) },
    { role: 'financial advisor', spec: pick(['retirement planning', 'investment management', 'wealth management', 'tax planning', 'estate planning']) },
    { role: 'real estate agent', spec: pick(['buyer representation', 'seller representation', 'investment properties', 'first-time homebuyers', 'luxury homes']) },
    { role: 'personal trainer', spec: pick(['weight loss', 'strength training', 'marathon prep', 'bodybuilding', 'senior fitness', 'postpartum fitness']) },
    { role: 'nutritionist', spec: pick(['meal planning', 'sports nutrition', 'weight management', 'vegan nutrition', 'food allergies']) },
    { role: 'career coach', spec: pick(['tech transitions', 'executive coaching', 'resume reviews', 'interview prep', 'salary negotiation']) },
    { role: 'college admissions consultant', spec: pick(['Ivy League prep', 'essay review', 'scholarship applications', 'international students']) },
    { role: 'immigration consultant', spec: pick(['H1B visas', 'green cards', 'citizenship', 'asylum', 'business visas']) },
  ];
  const svc = pick(services);
  const city = pick(cities);
  return {
    intent_text: `${svc.role} specializing in ${svc.spec}. Based in ${city}. ${pick(['Taking new clients.', 'Available for consultations.', 'Free initial consultation.', 'Accepting new patients.'])} ${pick([`$${rand(50, 400)}/hr.`, 'Competitive rates.', 'Sliding scale available.', 'Insurance accepted.', ''])}`,
    identity_text: `Licensed ${svc.role} with ${rand(3, 20)} years experience in ${svc.spec}. ${pick(['Board certified.', 'Award-winning practice.', 'Highly reviewed on Google.', ''])}`,
    public_data: { city, type: 'professional-service', role: svc.role, specialty: svc.spec },
    tags: ['services', svc.role.toLowerCase(), svc.spec.split(' ')[0].toLowerCase()],
  };
}

function housing(): Submission {
  const city = pick(cities);
  const budget = rand(500, 3000);
  const types = [
    () => ({ intent: `Looking for a roommate in ${city}. $${budget}-${budget + rand(200, 500)}/mo. ${pick(['Cat-friendly.', 'Dog-friendly.', 'No pets.', 'Pet-friendly.'])} ${pick(['Quiet area preferred.', 'Near downtown.', 'Close to transit.', 'Near the university.'])} ${pick(['Move-in ASAP.', 'Available next month.', 'Flexible timing.'])}`, tags: ['housing', 'roommate', city.toLowerCase()] }),
    () => ({ intent: `Have a spare room in ${city}. $${budget}/mo. ${pick(['Utilities included.', 'Utilities split.', 'All-inclusive.'])} ${pick(['Furnished.', 'Unfurnished.', 'Partially furnished.'])} Looking for someone ${pick(['clean and quiet', 'friendly and social', 'professional', 'LGBTQ+ friendly', 'non-smoking'])}. ${pick(['Available now.', 'Available April 1.', 'Available May 1.'])}`, tags: ['housing', 'roommate', 'offering', city.toLowerCase()] }),
    () => ({ intent: `Looking for a ${pick(['1-bedroom', '2-bedroom', 'studio', 'loft'])} apartment in ${city}. Budget: $${budget}-${budget + 500}/mo. ${pick(['Dog-friendly building required.', 'In-unit laundry preferred.', 'Parking needed.', 'Near transit.', 'Walkable neighborhood.'])}`, tags: ['housing', 'apartment', city.toLowerCase()] }),
    () => ({ intent: `Offering house-sitting in ${city} area. ${pick(['Experienced with pets.', 'References available.', 'Long-term or short-term.', 'Available for travel.'])} ${pick(['Free — just need a place to stay.', 'Minimal fee.', 'Negotiable.'])}`, tags: ['housing', 'house-sitting', city.toLowerCase()] }),
    () => ({ intent: `Looking for a co-working space or office share in ${city}. ${pick(['Just need a desk.', 'Need a private office.', 'Team of 3 needs space.'])} Budget: $${rand(100, 800)}/mo.`, tags: ['housing', 'coworking', city.toLowerCase()] }),
  ];
  const t = pick(types)();
  return {
    intent_text: t.intent,
    public_data: { city, type: 'housing', budget: `$${budget}/mo` },
    tags: t.tags,
  };
}

function commerce(): Submission {
  const items = [
    { item: 'Leica M6', cat: 'cameras', price: rand(2000, 4000) },
    { item: 'Canon R5', cat: 'cameras', price: rand(2500, 3500) },
    { item: 'Sony A7III', cat: 'cameras', price: rand(1200, 2000) },
    { item: 'MacBook Pro M4', cat: 'electronics', price: rand(1500, 3000) },
    { item: 'iPad Pro', cat: 'electronics', price: rand(600, 1200) },
    { item: 'Herman Miller Aeron', cat: 'furniture', price: rand(500, 1200) },
    { item: 'standing desk', cat: 'furniture', price: rand(200, 800) },
    { item: 'Fender Stratocaster', cat: 'instruments', price: rand(800, 2500) },
    { item: 'Yamaha piano', cat: 'instruments', price: rand(500, 5000) },
    { item: 'road bike', cat: 'bikes', price: rand(500, 3000) },
    { item: 'mountain bike', cat: 'bikes', price: rand(400, 2500) },
    { item: 'vintage typewriter', cat: 'vintage', price: rand(100, 500) },
    { item: 'vinyl record collection', cat: 'vintage', price: rand(200, 2000) },
    { item: 'used car', cat: 'vehicles', price: rand(5000, 25000) },
    { item: 'electric scooter', cat: 'vehicles', price: rand(200, 800) },
    { item: 'Moog synthesizer', cat: 'instruments', price: rand(1000, 5000) },
    { item: 'espresso machine', cat: 'kitchen', price: rand(200, 2000) },
    { item: '3D printer', cat: 'electronics', price: rand(200, 1500) },
    { item: 'drone (DJI)', cat: 'electronics', price: rand(300, 2000) },
    { item: 'home gym equipment', cat: 'fitness', price: rand(500, 3000) },
  ];
  const entry = pick(items);
  const city = pick(cities);
  const selling = Math.random() > 0.4;
  if (selling) {
    return {
      intent_text: `Selling: ${entry.item}. ${pick(['Excellent condition.', 'Like new.', 'Good condition.', 'Well-maintained.', 'Lightly used.'])} $${entry.price} ${pick(['OBO.', 'firm.', 'or best offer.', 'negotiable.'])} ${city}. ${pick(['Local pickup preferred.', 'Can ship.', 'Local pickup or shipped insured.'])}`,
      public_data: { city, type: 'selling', item: entry.item, price: `$${entry.price}`, category: entry.cat },
      tags: ['commerce', 'selling', entry.cat],
    };
  } else {
    return {
      intent_text: `Looking to buy: ${entry.item}. Budget up to $${entry.price}. ${city} area preferred. ${pick(['Good condition or better.', 'Any condition considered.', 'Excellent condition only.'])}`,
      public_data: { city, type: 'buying', item: entry.item, budget: `$${entry.price}`, category: entry.cat },
      tags: ['commerce', 'buying', entry.cat],
    };
  }
}

function collaboration(): Submission {
  const collabs = [
    () => `Looking for a co-founder for a ${pick(['AI', 'fintech', 'healthtech', 'edtech', 'climate tech', 'social', 'gaming', 'cybersecurity', 'proptech', 'legaltech'])} startup. ${pick(['I handle business, need a technical co-founder.', 'I\'m technical, need a business person.', 'Looking for an equal partner.'])} Based in ${pick(cities)}.`,
    () => `Need a research partner for ${pick(['a paper on LLM coordination', 'agent benchmarking', 'a study on remote work', 'an analysis of gig economy trends', 'computational biology research'])}. ${pick(['Academic setting.', 'Independent research.', 'Industry research.'])}`,
    () => `Looking for a podcast guest who knows about ${pick(['AI agents', 'startup fundraising', 'remote team management', 'product-led growth', 'open source', 'climate tech', 'crypto regulation', 'mental health tech', 'creator economy', 'no-code tools'])}. ${pick(['30-min episode.', 'Hour-long deep dive.', 'Video podcast.'])}`,
    () => `Forming a hackathon team for ${pick(['an upcoming AI hackathon', 'ETHDenver', 'a climate hackathon', 'a health innovation challenge'])}. Need ${pick(['a frontend dev', 'a designer', 'someone with ML experience', 'a backend engineer'])}. ${pick(cities)}.`,
    () => `Open source contributors wanted for ${pick(['an agent coordination protocol', 'a Rust web framework', 'a React component library', 'a CLI tool for developers', 'a VS Code extension'])}. ${pick(['All skill levels welcome.', 'Looking for experienced contributors.', 'Great for first-time contributors.'])}`,
    () => `Looking for a ${pick(['band member', 'drummer', 'guitarist', 'vocalist', 'bassist', 'keyboardist'])} in ${pick(cities)}. Playing ${pick(['indie rock', 'jazz', 'electronic', 'folk', 'punk', 'blues', 'hip-hop beats'])}. ${pick(['Gigging regularly.', 'Just for fun.', 'Recording an album.'])}`,
    () => `Seeking a film crew for a ${pick(['short film', 'documentary', 'music video', 'commercial', 'web series'])} in ${pick(cities)}. Need ${pick(['a DP', 'a sound person', 'a gaffer', 'a PA', 'an editor'])}. ${pick(['Paid gig.', 'Deferred pay / passion project.', 'Student film — credit + meals.'])}`,
    () => `Starting a ${pick(['book club', 'writing group', 'study group', 'mastermind group', 'accountability group'])} in ${pick(cities)}. ${pick(['Meeting weekly.', 'Meeting biweekly.', 'Virtual meetings.'])} Topic: ${pick(['AI and society', 'startup strategy', 'philosophy', 'science fiction', 'personal finance', 'stoicism'])}`,
  ];
  const intent = pick(collabs)();
  return {
    intent_text: intent,
    public_data: { type: 'collaboration' },
    tags: ['collaboration', pick(['cofounder', 'research', 'podcast', 'hackathon', 'opensource', 'music', 'film', 'group'])],
  };
}

function lifestyle(): Submission {
  const activities = [
    () => `Looking for a hiking buddy in ${pick(cities)}. I go out ${pick(['every weekend', 'a few times a month', 'weather permitting'])}. ${pick(['Moderate difficulty.', 'Challenging trails preferred.', 'Easy/scenic hikes.', 'Backpacking trips.'])}`,
    () => `Running partner wanted in ${pick(cities)}. ${pick(['Training for a marathon.', 'Casual 5K pace.', 'Half-marathon training.', 'Trail running.'])} ${pick(['Mornings preferred.', 'Evening runs.', 'Flexible schedule.'])}`,
    () => `Language exchange: I speak ${pick(['English', 'Spanish', 'French', 'Mandarin', 'Japanese', 'Korean', 'German', 'Portuguese', 'Italian', 'Arabic'])} and want to practice ${pick(['Spanish', 'French', 'Mandarin', 'Japanese', 'Korean', 'German', 'Portuguese', 'Italian', 'Russian', 'Arabic'])}. ${pick(cities)} or virtual.`,
    () => `Chess partner wanted in ${pick(cities)}. ${pick(['Rated ~1200 USCF.', 'Beginner looking to improve.', 'Intermediate player.', 'Advanced — looking for serious games.'])} ${pick(['Coffee shop games.', 'Online is fine too.', 'Park chess preferred.'])}`,
    () => `Looking for a cooking class or cooking buddy in ${pick(cities)}. Interested in ${pick(['Italian cuisine', 'Japanese cooking', 'baking', 'Thai food', 'BBQ/smoking', 'vegan cooking', 'French pastry', 'fermentation'])}. ${pick(['Beginner.', 'Intermediate.', 'Experienced but want to learn new cuisines.'])}`,
    () => `Travel companion wanted for ${pick(['a trip to Japan', 'backpacking Southeast Asia', 'a road trip through the Southwest', 'hiking the Camino de Santiago', 'a week in Iceland', 'a European train trip'])}. ${pick(['Spring 2026.', 'This summer.', 'Fall trip.', 'Flexible dates.'])} ${pick(['Splitting costs.', 'Budget travel.', 'Mid-range comfort.'])}`,
    () => `Workout partner wanted in ${pick(cities)}. ${pick(['CrossFit.', 'Weightlifting.', 'Yoga.', 'Swimming.', 'Climbing gym.', 'Mixed martial arts.'])} ${pick(['Morning sessions.', 'After work.', 'Weekends.'])}`,
    () => `Dog walking group in ${pick(cities)}. I have a ${pick(['golden retriever', 'labrador', 'corgi', 'german shepherd', 'poodle', 'mutt', 'husky', 'beagle'])}. Looking for others to walk with ${pick(['mornings', 'evenings', 'weekends'])} at ${pick(['the local park', 'the greenway', 'the beach', 'the trails'])}.`,
    () => `Photography meetup in ${pick(cities)}. ${pick(['Street photography.', 'Landscape.', 'Portrait.', 'Night photography.', 'Film photography.'])} ${pick(['Beginners welcome.', 'All levels.', 'Advanced photographers.'])} ${pick(['Monthly walks.', 'Weekly meetups.', 'Bi-weekly.'])}`,
    () => `Meditation/mindfulness group in ${pick(cities)}. ${pick(['Zen style.', 'Vipassana.', 'Guided meditation.', 'Silent sits.'])} ${pick(['Weekly meetings.', 'Morning sessions.', 'Evening group.'])}`,
  ];
  const intent = pick(activities)();
  return { intent_text: intent, public_data: { type: 'lifestyle' }, tags: ['lifestyle', 'social', pick(cities).toLowerCase()] };
}

function events(): Submission {
  const city = pick(cities);
  const evts = [
    () => `Need a DJ for a ${pick(['wedding', 'birthday party', 'corporate event', 'house party', 'rooftop party'])} in ${city}. ${pick(['200 guests.', '50 guests.', '100 guests.', 'Small intimate gathering.'])} Date: ${pick(['next month', 'this summer', 'April 2026', 'May 2026'])}. Budget: $${rand(300, 3000)}.`,
    () => `Looking for a caterer for a ${pick(['wedding', 'corporate lunch', 'birthday', 'holiday party', 'rehearsal dinner'])} in ${city}. ${rand(20, 200)} guests. ${pick(['Vegetarian options required.', 'BBQ style.', 'Fine dining.', 'Casual buffet.', 'Food truck style.'])} Budget: $${rand(1000, 15000)}.`,
    () => `Photographer needed for ${pick(['a wedding', 'headshots', 'a product shoot', 'an engagement session', 'a family portrait', 'an event'])} in ${city}. ${pick(['Half day.', 'Full day.', '2 hours.'])} Budget: $${rand(200, 5000)}.`,
    () => `Looking for a ${pick(['keynote speaker', 'panelist', 'workshop facilitator', 'MC', 'moderator'])} for a ${pick(['tech conference', 'startup event', 'company offsite', 'industry meetup', 'nonprofit gala'])} in ${city}. Topic: ${pick(['AI agents', 'leadership', 'innovation', 'diversity in tech', 'remote work', 'entrepreneurship'])}. ${pick(['Paid speaker fee.', 'Honorarium provided.', 'Expenses covered.'])}`,
    () => `Band/musician needed for a ${pick(['wedding reception', 'corporate party', 'bar mitzvah', 'restaurant opening', 'art gallery event'])} in ${city}. ${pick(['Jazz trio.', 'Acoustic duo.', 'Cover band.', 'String quartet.', 'Solo pianist.'])} Budget: $${rand(500, 5000)}.`,
  ];
  return {
    intent_text: pick(evts)(),
    public_data: { city, type: 'event' },
    tags: ['events', 'gig', city.toLowerCase()],
  };
}

function education(): Submission {
  const subjects = ['math', 'physics', 'chemistry', 'biology', 'computer science', 'Spanish', 'French', 'Mandarin', 'piano', 'guitar', 'violin', 'SAT prep', 'GRE prep', 'GMAT prep', 'LSAT prep', 'MCAT prep', 'coding (Python)', 'coding (JavaScript)', 'writing', 'statistics', 'calculus', 'economics', 'history', 'philosophy', 'art'];
  const subject = pick(subjects);
  const city = pick(cities);
  const types = [
    () => `Looking for a ${subject} tutor in ${city} or online. ${pick(['High school level.', 'College level.', 'Adult learner.', 'Graduate level.'])} ${pick(['Weekly sessions.', 'Twice a week.', 'Intensive crash course.'])} Budget: $${rand(30, 150)}/hr.`,
    () => `Offering ${subject} tutoring. ${rand(3, 15)} years teaching experience. ${city} or virtual. $${rand(30, 120)}/hr. ${pick(['Patient and encouraging.', 'Results-oriented.', 'Customized lesson plans.', 'Fun and engaging approach.'])}`,
    () => `Looking for a mentor in ${pick(['product management', 'software engineering', 'data science', 'UX design', 'startup founding', 'venture capital', 'marketing', 'sales leadership'])}. ${pick(['Early career — need guidance.', 'Career transition.', 'Leveling up to senior.', 'Aspiring founder.'])} ${city} or virtual.`,
    () => `Research assistant needed for ${pick(['a university lab', 'an independent study', 'a book project', 'a market research project'])}. ${pick(['Paid position.', 'Unpaid — great experience.', 'Stipend available.', 'Course credit possible.'])} ${city}.`,
  ];
  return {
    intent_text: pick(types)(),
    public_data: { city, type: 'education', subject },
    tags: ['education', subject.toLowerCase().split(' ')[0], pick(['tutoring', 'mentorship', 'learning'])],
  };
}

function misc(): Submission {
  const miscs = [
    () => ({ intent: `Beta testers needed for ${pick(['a new productivity app', 'an AI writing tool', 'a fitness tracker', 'a budgeting app', 'a recipe app', 'a meditation app', 'a language learning app'])}. ${pick(['iOS only.', 'Android only.', 'Web app.', 'Cross-platform.'])} ${pick(['Free access for testers.', 'Gift card compensation.', '$50 per session.'])}`, tags: ['misc', 'beta-testing', 'tech'] }),
    () => ({ intent: `Voice actor needed for ${pick(['a podcast intro', 'an audiobook', 'a YouTube channel', 'an explainer video', 'a game character', 'an IVR system'])}. ${pick(['Male voice.', 'Female voice.', 'Any gender.', 'Character voice needed.'])} Budget: $${rand(50, 1000)}.`, tags: ['misc', 'voiceover', 'creative'] }),
    () => ({ intent: `Need someone to help me move in ${pick(cities)}. ${pick(['This weekend.', 'Next week.', 'End of month.'])} ${pick(['Studio apartment.', '1-bedroom.', '2-bedroom.', 'Full house.'])} Paying $${rand(100, 500)}.`, tags: ['misc', 'moving', 'help'] }),
    () => ({ intent: `Personal shopper needed in ${pick(cities)}. ${pick(['Wardrobe refresh.', 'Gift shopping for partner.', 'Home decor.', 'Tech purchases.'])} Budget: ${pick(['$500-1000', '$1000-3000', 'flexible'])} plus fee.`, tags: ['misc', 'shopping', 'personal'] }),
    () => ({ intent: `Plant sitter needed in ${pick(cities)} for ${pick(['2 weeks', '1 month', 'the summer', '3 weeks'])} while I'm traveling. ${rand(5, 40)} plants. ${pick(['Mostly low-maintenance.', 'Some delicate species.', 'Indoor jungle.', 'Mix of indoor and balcony plants.'])} Will pay $${rand(50, 300)}.`, tags: ['misc', 'plant-sitting', 'help'] }),
    () => ({ intent: `Drone pilot needed for aerial photos/video of ${pick(['a property listing', 'a construction site', 'a wedding venue', 'a farm', 'a hiking trail', 'an event'])} in ${pick(cities)}. Budget: $${rand(200, 1000)}.`, tags: ['misc', 'drone', 'photography'] }),
    () => ({ intent: `D&D dungeon master wanted in ${pick(cities)}. ${pick(['New group forming.', 'Experienced group needs a DM.', 'Beginners welcome.'])} ${pick(['Weekly sessions.', 'Bi-weekly.', 'Monthly one-shots.'])} ${pick(['In person.', 'Virtual on Roll20.', 'Hybrid.'])}`, tags: ['misc', 'gaming', 'dnd', 'social'] }),
    () => ({ intent: `Someone to teach me ${pick(['woodworking', 'pottery', 'leather crafting', 'welding', 'sewing', 'knitting', 'candle making', 'soap making', 'screen printing'])} in ${pick(cities)}. ${pick(['Total beginner.', 'Some experience.', 'Want to go deeper.'])} Will pay for lessons.`, tags: ['misc', 'learning', 'crafts'] }),
    () => ({ intent: `Custom cake maker for ${pick(['a birthday', 'a wedding', 'an anniversary', 'a baby shower', 'a retirement party'])} in ${pick(cities)}. ${pick(['Fondant preferred.', 'Buttercream.', 'Vegan options needed.', 'Gluten-free required.'])} Budget: $${rand(100, 800)}.`, tags: ['misc', 'food', 'events'] }),
    () => ({ intent: `Professional organizer needed for ${pick(['my apartment', 'my garage', 'my home office', 'a small business', 'a move'])} in ${pick(cities)}. ${pick(['Marie Kondo style.', 'Minimalist approach.', 'Just need systems.', 'Help with downsizing.'])} Budget: $${rand(200, 1500)}.`, tags: ['misc', 'organizing', 'home'] }),
    () => ({ intent: `Calligrapher for ${pick(['wedding invitations', 'event signage', 'a custom gift', 'place cards', 'a certificate'])}. ${pick(['Modern style.', 'Traditional copperplate.', 'Brush lettering.'])} ${rand(20, 200)} pieces. ${pick(cities)} or ship.`, tags: ['misc', 'calligraphy', 'events'] }),
    () => ({ intent: `Looking for a ${pick(['sailing crew member', 'climbing partner', 'surfing buddy', 'skiing partner', 'tennis partner', 'pickleball partner', 'cycling buddy', 'kayaking partner'])} in ${pick(cities)}. ${pick(['Weekends.', 'Flexible schedule.', 'After work.', 'Early mornings.'])} ${pick(['Beginner friendly.', 'Intermediate level.', 'Advanced.'])}`, tags: ['misc', 'sports', 'social'] }),
    () => ({ intent: `Escape room teammate(s) wanted in ${pick(cities)}. ${pick(['We need 2 more.', 'Solo looking for a group.', 'Group of 3 looking for more.'])} ${pick(['Weekly adventures.', 'Monthly.', 'One-time.'])} ${pick(['Competitive — we want to win.', 'Just for fun.', 'Themed rooms preferred.'])}`, tags: ['misc', 'social', 'fun'] }),
  ];
  const m = pick(miscs)();
  return { intent_text: m.intent, public_data: { type: 'misc' }, tags: m.tags };
}

// ─── Main ────────────────────────────────────────────────────────────

const generators: [() => Submission, number][] = [
  [techHiring, 70],
  [creativeHiring, 30],
  [businessHiring, 30],
  [freelanceOffering, 65],
  [professionalService, 45],
  [housing, 45],
  [commerce, 45],
  [collaboration, 45],
  [lifestyle, 40],
  [events, 30],
  [education, 30],
  [misc, 25],
];

async function main() {
  console.log('Creating agents...');
  const agents: string[] = [];
  const agentNames = ['AlphaSearch', 'BetaMatch', 'GammaSeek', 'DeltaFind', 'EpsilonLink', 'ZetaConnect', 'EtaDiscover', 'ThetaHub', 'IotaBridge', 'KappaNet', 'LambdaPool', 'MuRelay', 'NuSync', 'XiRoute', 'OmicronPath'];
  
  for (const name of agentNames) {
    const res = await post('agent/create', { display_name: name });
    if (res.agent_api_key) {
      agents.push(res.agent_api_key);
      console.log(`  ✓ Agent ${name} created`);
    } else {
      console.log(`  ✗ Agent ${name} failed:`, res);
    }
  }

  if (agents.length === 0) { console.error('No agents created!'); process.exit(1); }

  console.log(`\nCreating submissions...`);
  let created = 0;
  let failed = 0;

  for (const [gen, count] of generators) {
    for (let i = 0; i < count; i++) {
      const sub = gen();
      const key = pick(agents);
      const body: Record<string, unknown> = {
        intent_text: sub.intent_text,
        expires_at: expiresAt(30),
      };
      if (sub.criteria_text) body.criteria_text = sub.criteria_text;
      if (sub.identity_text) body.identity_text = sub.identity_text;
      if (sub.public_data) body.public_data = sub.public_data;
      if (sub.tags) body.tags = sub.tags;

      const res = await post('submit', body, key);
      if (res.submission_id || res.data?.submission_id) {
        created++;
        if (created % 50 === 0) console.log(`  ${created} created...`);
      } else {
        failed++;
        if (failed <= 3) console.log(`  ✗ Failed:`, JSON.stringify(res).substring(0, 200));
      }
    }
  }

  console.log(`\nDone! Created ${created} submissions (${failed} failed).`);
}

main().catch(console.error);
