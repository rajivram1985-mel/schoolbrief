-- SchoolBrief — Sprint 2 migration
-- Run in Supabase SQL Editor after applying the Sprint 1 schema.

-- 1. Add item_type to upcoming_dates
--    Classifies each row so the Upcoming view can apply correct icons and bubble colours.
ALTER TABLE upcoming_dates
  ADD COLUMN IF NOT EXISTS item_type TEXT
  CHECK (item_type IN ('event', 'action', 'bring'));

-- 2. Back-fill existing rows (Sprint 1 test data had no item_type)
--    Best-effort: anything with a $ in the title is an action, rest default to event.
UPDATE upcoming_dates
SET item_type = CASE
  WHEN title ILIKE '%($%' THEN 'action'
  ELSE 'event'
END
WHERE item_type IS NULL;
