-- Migration 004: Update v4 submissions schema
-- Renames ask_embedding→intent_embedding, offer_embedding→identity_embedding
-- Adds new columns for criteria, identity, public/private data
-- Safe to run multiple times (IF NOT EXISTS / try-catch pattern)

-- Drop and recreate submissions if old schema exists
-- This is safe pre-launch (no real user data in v4 tables yet)
DROP TABLE IF EXISTS v4_alerts;
DROP TABLE IF EXISTS v4_messages;
DROP TABLE IF EXISTS negotiation_records;
DROP TABLE IF EXISTS submission_candidates;
DROP TABLE IF EXISTS submissions;
DROP TABLE IF EXISTS coordination_tools;
DROP TABLE IF EXISTS v4_rate_events;
DROP TABLE IF EXISTS v4_agents;
