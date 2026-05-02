-- SchoolBrief — Sprint 2 seed data
-- Run AFTER signing in to SchoolBrief at least once (so your user row exists).
-- Replace 'rajivram1985@gmail.com' if you used a different email.

DO $$
DECLARE
  v_user_id  UUID;
  v_riaan_id UUID;
  v_anvi_id  UUID;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE email = 'rajivram1985@gmail.com';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found. Sign in to SchoolBrief first, then re-run this script.';
  END IF;

  -- Insert Riaan
  INSERT INTO children (user_id, name, school_name)
  VALUES (v_user_id, 'Riaan', 'Mount Waverley North Primary')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_riaan_id FROM children WHERE user_id = v_user_id AND name = 'Riaan';

  -- Insert Anvi
  INSERT INTO children (user_id, name, school_name)
  VALUES (v_user_id, 'Anvi', 'Little Explorers Childcare')
  ON CONFLICT DO NOTHING;
  SELECT id INTO v_anvi_id FROM children WHERE user_id = v_user_id AND name = 'Anvi';

  -- Seed upcoming_dates
  INSERT INTO upcoming_dates
    (user_id, child_id, title, iso_date, display_date, time, location,
     source_label, source_snippet, item_type, created_at)
  VALUES

    -- 1. Past event — Riaan (shows faded)
    (v_user_id, v_riaan_id,
     'Cross Country Carnival',
     current_date - 5, to_char(current_date - 5, 'DD Mon YYYY'),
     '9:00am', 'Ferntree Gully Reserve',
     'Sports day notice',
     'The Cross Country Carnival will be held at Ferntree Gully Reserve on Thursday',
     'event',
     NOW() - INTERVAL '6 days'),

    -- 2. Action due soon — Anvi — NEW badge (added < 24h ago)
    (v_user_id, v_anvi_id,
     'Return immunisation consent form',
     current_date + 2, to_char(current_date + 2, 'DD Mon YYYY'),
     NULL, NULL,
     'Health notice',
     'please return the signed consent form by Thursday',
     'action',
     NOW() - INTERVAL '2 hours'),

    -- 3. Payment action — Riaan
    (v_user_id, v_riaan_id,
     'Museum excursion ($22)',
     current_date + 5, to_char(current_date + 5, 'DD Mon YYYY'),
     NULL, NULL,
     'Excursion notice',
     'the $22 bus fee must be paid via the portal by Friday',
     'action',
     NOW() - INTERVAL '2 days'),

    -- 4. Future event — Riaan
    (v_user_id, v_riaan_id,
     'Mother''s Day Stall',
     current_date + 8, to_char(current_date + 8, 'DD Mon YYYY'),
     NULL, 'School hall',
     'Week 12 newsletter',
     'Mother''s Day Stall runs Wednesday and Thursday — send small change',
     'event',
     NOW() - INTERVAL '1 day'),

    -- 5. Bring item — Anvi
    (v_user_id, v_anvi_id,
     'Bring water bottle and sunscreen',
     current_date + 10, to_char(current_date + 10, 'DD Mon YYYY'),
     NULL, NULL,
     'Excursion reminder',
     'please bring a labelled water bottle and sunscreen on the day',
     'bring',
     NOW() - INTERVAL '3 days');

  RAISE NOTICE 'Seed data inserted for user % (Riaan: %, Anvi: %)',
    v_user_id, v_riaan_id, v_anvi_id;
END $$;
