-- Migration 004: Update v4 submissions schema
-- Safe to run multiple times

-- Drop and recreate if schema is stale (pre-launch, no real user data)
DROP TABLE IF EXISTS v4_alerts;
DROP TABLE IF EXISTS v4_messages;
DROP TABLE IF EXISTS negotiation_records;
DROP TABLE IF EXISTS submission_candidates;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS coordination_tools;
DROP TABLE IF EXISTS v4_rate_events;
DROP TABLE IF EXISTS v4_agents;
