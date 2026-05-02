-- SchoolBrief — Sprint 3 migration
-- Run in Supabase SQL Editor

-- 1. Track whether a user has completed onboarding
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. forwarding_address and school_name already exist from Sprint 1 schema — no change needed.

-- To bypass onboarding for an existing account during testing, run:
-- UPDATE users SET onboarding_completed = true WHERE email = 'rajivram1985@gmail.com';
