-- SchoolBrief — Sprint 1 schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- -----------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL UNIQUE,
  forwarding_address  TEXT        UNIQUE,         -- e.g. rajiv-abc123@inbound.postmarkapp.com
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup by inbound address (hit on every webhook)
CREATE INDEX IF NOT EXISTS idx_users_forwarding_address ON users (forwarding_address);


-- -----------------------------------------------------------------------
-- children
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS children (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  school_name  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_children_user_id ON children (user_id);


-- -----------------------------------------------------------------------
-- notes
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        REFERENCES users (id) ON DELETE CASCADE,   -- nullable for anonymous test runs
  source_type           TEXT        NOT NULL
                          CHECK (source_type IN ('email', 'paste', 'gmail_verification')),
  raw_text              TEXT,
  subject               TEXT,
  sender_email          TEXT,
  parsed_title          TEXT,
  parsed_type           TEXT,
  parsed_summary_json   JSONB,      -- string[]
  parsed_actions_json   JSONB,      -- ActionItem[]
  parsed_events_json    JSONB,      -- Event[]
  parsed_items_json     JSONB,      -- ThingToBring[]
  parsed_flags_json     JSONB,      -- { flags: string[], ambiguities: string[] }
  parse_status          TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (parse_status IN (
                            'pending', 'processing', 'success', 'empty', 'failed', 'gmail_verification'
                          )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id     ON notes (user_id);
CREATE INDEX IF NOT EXISTS idx_notes_parse_status ON notes (parse_status);
CREATE INDEX IF NOT EXISTS idx_notes_created_at  ON notes (created_at DESC);


-- -----------------------------------------------------------------------
-- upcoming_dates
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upcoming_dates (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users (id) ON DELETE CASCADE,
  note_id       UUID        REFERENCES notes (id) ON DELETE SET NULL,
  child_id      UUID        REFERENCES children (id) ON DELETE SET NULL,
  title         TEXT        NOT NULL,
  iso_date      DATE,                    -- YYYY-MM-DD; NULL when Claude couldn't parse a firm date
  display_date  TEXT,                    -- raw date string from Claude (e.g. "Friday 14 May")
  time          TEXT,                    -- e.g. "9:00 AM"
  location      TEXT,
  source_label    TEXT,                  -- short label linking back to the originating note
  source_snippet  TEXT,                  -- exact phrase from original email (powers Sprint 2 bottom sheet)
  deleted_at    TIMESTAMPTZ,             -- soft delete
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upcoming_dates_user_id  ON upcoming_dates (user_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_dates_iso_date ON upcoming_dates (iso_date);
-- Partial index for the common "active dates" query
CREATE INDEX IF NOT EXISTS idx_upcoming_dates_active
  ON upcoming_dates (user_id, iso_date)
  WHERE deleted_at IS NULL;
