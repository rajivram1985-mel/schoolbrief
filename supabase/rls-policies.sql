-- SchoolBrief — Row Level Security policies
-- Run in Supabase SQL Editor.
--
-- These policies act as a safety net at the database level.
-- The application uses the Service Role key server-side (which bypasses RLS),
-- but enabling RLS prevents any accidental data leaks if the anon key is
-- ever used directly or a future code path omits the user_id filter.
--
-- Run AFTER the Sprint 1 schema and all migrations.

-- ── Enable RLS on all tables ──────────────────────────────────────────────────

ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE children      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcoming_dates ENABLE ROW LEVEL SECURITY;

-- ── users ─────────────────────────────────────────────────────────────────────
-- A user can only read and update their own row.

CREATE POLICY "users: own row only"
  ON users FOR ALL
  USING (id = auth.uid());

-- ── children ──────────────────────────────────────────────────────────────────

CREATE POLICY "children: own rows only"
  ON children FOR ALL
  USING (user_id = auth.uid());

-- ── notes ─────────────────────────────────────────────────────────────────────
-- user_id is nullable (anonymous test runs from /api/test-inbound).
-- Authenticated users only see their own notes.

CREATE POLICY "notes: own rows only"
  ON notes FOR ALL
  USING (user_id = auth.uid());

-- ── upcoming_dates ────────────────────────────────────────────────────────────

CREATE POLICY "upcoming_dates: own rows only"
  ON upcoming_dates FOR ALL
  USING (user_id = auth.uid());

-- ── Note ──────────────────────────────────────────────────────────────────────
-- The Postmark inbound webhook (/api/inbound) uses the Service Role key,
-- which bypasses RLS entirely. This is intentional — the webhook has no
-- authenticated user session. Ensure SUPABASE_SERVICE_ROLE_KEY is never
-- exposed to the browser or committed to source control.
