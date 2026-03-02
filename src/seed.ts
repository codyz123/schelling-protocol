/**
 * Auto-seed demo data when the database is empty.
 * Runs on startup in REST mode to ensure the API always has
 * interesting data for first-time visitors to discover.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseConnection } from "./db/interface.js";

const DEMO_CLUSTER = "housing.fortcollins";

interface SeedListing {
  name: string;
  traits: { key: string; value: string | number; value_type: string }[];
}

const LISTINGS: SeedListing[] = [
  {
    name: "Old Town Modern 2BR",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "price", value: 1350, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "parking", value: "garage", value_type: "string" },
      { key: "laundry", value: "in-unit", value_type: "string" },
    ],
  },
  {
    name: "Midtown Loft 2BR",
    traits: [
      { key: "type", value: "loft", value_type: "string" },
      { key: "neighborhood", value: "Midtown", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "price", value: 1275, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "dogs-under-50lb", value_type: "string" },
    ],
  },
  {
    name: "Campus West Townhouse",
    traits: [
      { key: "type", value: "townhouse", value_type: "string" },
      { key: "neighborhood", value: "Campus West", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "price", value: 1400, value_type: "number" },
      { key: "bedrooms", value: 2, value_type: "number" },
      { key: "aesthetic", value: "rustic", value_type: "string" },
      { key: "pet_policy", value: "dogs-ok", value_type: "string" },
      { key: "yard", value: "shared", value_type: "string" },
    ],
  },
  {
    name: "Old Town Classic 1BR",
    traits: [
      { key: "type", value: "apartment", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "price", value: 950, value_type: "number" },
      { key: "bedrooms", value: 1, value_type: "number" },
      { key: "aesthetic", value: "classic", value_type: "string" },
      { key: "pet_policy", value: "cats-ok", value_type: "string" },
    ],
  },
  {
    name: "Harmony Studio",
    traits: [
      { key: "type", value: "studio", value_type: "string" },
      { key: "neighborhood", value: "Harmony", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "price", value: 825, value_type: "number" },
      { key: "bedrooms", value: 0, value_type: "number" },
      { key: "aesthetic", value: "modern", value_type: "string" },
      { key: "pet_policy", value: "no-pets", value_type: "string" },
    ],
  },
];

const FREELANCE_CLUSTER = "freelance.general";

const FREELANCERS: SeedListing[] = [
  {
    name: "React Developer — Denver",
    traits: [
      { key: "skill", value: "React", value_type: "string" },
      { key: "location", value: "Denver", value_type: "string" },
      { key: "rate", value: 90, value_type: "number" },
      { key: "rate_unit", value: "hour", value_type: "string" },
      { key: "experience_years", value: 5, value_type: "number" },
      { key: "availability", value: "full-time", value_type: "string" },
    ],
  },
  {
    name: "Python/ML Engineer — Remote",
    traits: [
      { key: "skill", value: "Python", value_type: "string" },
      { key: "specialty", value: "machine-learning", value_type: "string" },
      { key: "location", value: "Remote", value_type: "string" },
      { key: "rate", value: 120, value_type: "number" },
      { key: "rate_unit", value: "hour", value_type: "string" },
      { key: "experience_years", value: 7, value_type: "number" },
    ],
  },
  {
    name: "UI/UX Designer — Fort Collins",
    traits: [
      { key: "skill", value: "UI/UX Design", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "rate", value: 75, value_type: "number" },
      { key: "rate_unit", value: "hour", value_type: "string" },
      { key: "experience_years", value: 4, value_type: "number" },
      { key: "tools", value: "Figma, Sketch", value_type: "string" },
    ],
  },
];

const SERVICES_CLUSTER = "services.local";

const SERVICES: SeedListing[] = [
  {
    name: "Dog Walker — Old Town FC",
    traits: [
      { key: "service", value: "dog walking", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "neighborhood", value: "Old Town", value_type: "string" },
      { key: "rate", value: 25, value_type: "number" },
      { key: "rate_unit", value: "walk", value_type: "string" },
      { key: "availability", value: "weekdays", value_type: "string" },
      { key: "max_dogs", value: 3, value_type: "number" },
    ],
  },
  {
    name: "House Cleaner — Fort Collins",
    traits: [
      { key: "service", value: "house cleaning", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "rate", value: 120, value_type: "number" },
      { key: "rate_unit", value: "session", value_type: "string" },
      { key: "frequency", value: "weekly or biweekly", value_type: "string" },
      { key: "supplies", value: "provided", value_type: "string" },
    ],
  },
  {
    name: "Guitar Lessons — In-Home",
    traits: [
      { key: "service", value: "music lessons", value_type: "string" },
      { key: "instrument", value: "guitar", value_type: "string" },
      { key: "location", value: "Fort Collins", value_type: "string" },
      { key: "rate", value: 50, value_type: "number" },
      { key: "rate_unit", value: "hour", value_type: "string" },
      { key: "experience_years", value: 12, value_type: "number" },
      { key: "levels", value: "beginner to advanced", value_type: "string" },
    ],
  },
];

const CREATIVE_CLUSTER = "creative.freelance";

const CREATIVES: SeedListing[] = [
  {
    name: "Portrait Photographer — Denver",
    traits: [
      { key: "skill", value: "photography", value_type: "string" },
      { key: "specialty", value: "portraits", value_type: "string" },
      { key: "location", value: "Denver", value_type: "string" },
      { key: "rate", value: 300, value_type: "number" },
      { key: "rate_unit", value: "session", value_type: "string" },
      { key: "style", value: "natural light, editorial", value_type: "string" },
      { key: "turnaround", value: "1 week", value_type: "string" },
    ],
  },
  {
    name: "Copywriter — Remote",
    traits: [
      { key: "skill", value: "copywriting", value_type: "string" },
      { key: "specialty", value: "SaaS landing pages", value_type: "string" },
      { key: "location", value: "Remote", value_type: "string" },
      { key: "rate", value: 85, value_type: "number" },
      { key: "rate_unit", value: "hour", value_type: "string" },
      { key: "experience_years", value: 6, value_type: "number" },
      { key: "portfolio", value: "stripe.com/blog, linear.app", value_type: "string" },
    ],
  },
  {
    name: "Logo & Brand Designer — Boulder",
    traits: [
      { key: "skill", value: "graphic design", value_type: "string" },
      { key: "specialty", value: "branding, logos", value_type: "string" },
      { key: "location", value: "Boulder", value_type: "string" },
      { key: "rate", value: 2500, value_type: "number" },
      { key: "rate_unit", value: "project", value_type: "string" },
      { key: "experience_years", value: 8, value_type: "number" },
      { key: "tools", value: "Illustrator, Figma", value_type: "string" },
    ],
  },
];

export function seedIfEmpty(db: DatabaseConnection): void {
  // Check if any users exist
  const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  if (result.count > 0) {
    console.log(`📊 Database has ${result.count} users — skipping seed`);
    return;
  }

  console.log("🌱 Empty database detected — seeding demo data...");

  let seeded = 0;

  // Seed housing
  seedCluster(db, DEMO_CLUSTER, "Fort Collins Housing", LISTINGS, "provider");
  seeded += LISTINGS.length;

  // Seed freelancers
  seedCluster(db, FREELANCE_CLUSTER, "Freelance Services", FREELANCERS, "provider");
  seeded += FREELANCERS.length;

  // Seed local services
  seedCluster(db, SERVICES_CLUSTER, "Local Services", SERVICES, "provider");
  seeded += SERVICES.length;

  // Seed creative freelancers
  seedCluster(db, CREATIVE_CLUSTER, "Creative Freelancers", CREATIVES, "provider");
  seeded += CREATIVES.length;

  console.log(`🌱 Seeded ${seeded} demo listings across 4 clusters`);
}

function seedCluster(
  db: DatabaseConnection,
  clusterId: string,
  displayName: string,
  listings: SeedListing[],
  role: string,
): void {
  // Ensure cluster exists
  const existing = db.prepare("SELECT cluster_id FROM clusters WHERE cluster_id = ?").get(clusterId);
  if (!existing) {
    db.prepare(
      `INSERT INTO clusters (cluster_id, display_name, population, phase, created_at, last_activity)
       VALUES (?, ?, 0, 'nascent', datetime('now'), datetime('now'))`,
    ).run(clusterId, displayName);
  }

  const insertUser = db.prepare(
    `INSERT INTO users (user_token, protocol_version, cluster_id, role, display_name, funnel_mode, status, created_at, updated_at)
     VALUES (?, '3.0', ?, ?, ?, 'bilateral', 'active', datetime('now'), datetime('now'))`,
  );

  const insertTrait = db.prepare(
    `INSERT INTO traits (id, user_token, key, value, value_type, visibility, verification, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'public', 'unverified', datetime('now'), datetime('now'))`,
  );

  for (const listing of listings) {
    const token = randomUUID();
    insertUser.run(token, clusterId, role, listing.name);

    for (const t of listing.traits) {
      insertTrait.run(randomUUID(), token, t.key, String(t.value), t.value_type);
    }

    db.prepare(
      "UPDATE clusters SET population = population + 1, last_activity = datetime('now') WHERE cluster_id = ?",
    ).run(clusterId);
  }
}
