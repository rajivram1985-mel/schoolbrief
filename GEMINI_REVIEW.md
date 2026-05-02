# SchoolBrief — Full Codebase Review Package

This document contains everything needed for a complete review of SchoolBrief:
the product brief, architecture decisions, database schema, and full source code
for every meaningful file. It is intended to be pasted into Gemini (or any capable
LLM) as a single artifact.

---

## 1. Product Brief

**SchoolBrief** is a mobile-first school communication triage tool for busy parents.
It ingests school emails via a forwarding address, parses them using Claude AI,
extracts actionable dates and tasks, and stores them in a clean chronological
"Upcoming" view.

**Core promise:** No more missed excursion payments, forgotten dress-up days, or
copy-pasting school emails. One calm view of everything coming up for your kids.

**Target user:** Working parent, 1–3 school-age children, reads school comms on
mobile at night, primary pain is missing deadlines.

**Stage:** MVP — nights-and-weekends build by solo founder (Rajiv), April 2026.

**Primary tech stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS,
Supabase (Postgres + Auth), Claude API (claude-haiku-4-5-20251001), Postmark
inbound email, Vercel.

---

## 2. What Has Been Built (Sprints 1–3)

### Sprint 1 — Email pipeline
- Postmark inbound webhook at `/api/inbound`
- Claude extraction with Zod validation
- Gmail forwarding verification email bypass (critical: auto-forwards the
  confirmation code to the parent's login email)
- Saves to `notes` and `upcoming_dates` tables
- `/api/test-inbound` for local testing (now auth-protected)
- Status page at `/` showing pipeline health

### Sprint 2 — Core UI
- Magic link auth via Supabase Auth (`/login`, `/auth/callback`)
- Middleware protecting `/upcoming`, `/notes`, `/paste`, `/onboarding`
- `/upcoming` — chronological date list, month-grouped, child-tagged,
  type-specific date bubbles (teal=event, amber=action, grey=bring),
  icons, "New" badge, past-date fading, delete with undo toast, bottom sheet
  with source snippet + edit title + view note link
- `/notes` — note list with type and status badges
- `/notes/[id]` — full parse result with review notice, action items, events,
  things to bring, flags, ambiguities, source snippets
- Floating "Paste note" button on `/upcoming`

### Sprint 3 — Manual paste + onboarding
- `/paste` — textarea, demo note, child selector, Claude extraction, parse
  result view, save-to-Upcoming checklist with child tagging
- `/api/parse` — auth-gated extraction endpoint for paste flow
- `/onboarding` — 4-step flow: Welcome → Add children → Connect email
  (forwarding address + Gmail filter guide) → Live wait/wow moment
  (polls every 3s for a new successful note, 2-minute timeout)
- `onboarding_completed` boolean on `users` table gates access to the app
- Unique constraint on `children(user_id, name)` to prevent duplicates

### Bugs found and fixed in QA pass
- `<a href>` replaced with Next.js `<Link>` for client-side navigation (FAB
  and empty-state button)
- `JSON.parse` in Claude client now throws a descriptive error with the raw
  response snippet instead of a bare SyntaxError
- `updateDateTitle` now enforces 200-char max
- `saveChildren` name/school truncated to 100/200 chars
- `/api/test-inbound` now requires an authenticated session
- `completeOnboarding` failure is logged; navigation still proceeds

---

## 3. Architecture Decisions

**Auth model:** Supabase Auth (magic link, no password). Our custom `users` table
uses the Supabase Auth UUID as its primary key, set at first login via the
`/auth/callback` route handler. All server-side queries use the service role key
filtered by `user_id` — no RLS policies are configured (not needed since the
service role key with manual user_id filtering is equivalent).

**No browser Supabase client:** All auth and data operations go through server
components, server actions, or route handlers using `@supabase/ssr`. No
`NEXT_PUBLIC_SUPABASE_*` vars are needed.

**Claude extraction:** `claude-haiku-4-5-20251001` for speed and cost. Today's
date is injected into every prompt so Claude can distinguish past from upcoming
dates. Output is validated with Zod before touching the DB. One retry with 1.5s
delay on failure.

**Date parsing:** Claude is instructed to return specific dates ("14 May 2026",
not "next week"). The `parseToISODate()` function in `lib/date-parser.ts` converts
these strings to ISO format using local date parts (not `toISOString()`) to
handle Australian UTC+10/11 timezone correctly.

**Soft delete:** `upcoming_dates.deleted_at` — items are filtered out on query,
restored instantly on undo. No hard delete in the UI.

**Item types:** `upcoming_dates.item_type` = `'event' | 'action' | 'bring'`.
Set at insert time by the pipeline. Payments are treated as `'action'` (deadline
to act). Dollar icon is shown when title contains `($`.

**Onboarding gate:** `(app)/layout.tsx` checks `onboarding_completed` on every
request (force-dynamic) and redirects to `/onboarding` if false. The middleware
handles auth; the layout handles onboarding state.

**Paste vs email pipeline:** The paste flow uses `lib/extract.ts`
(`extractAndSaveNote`) which saves a note but does NOT write to `upcoming_dates`
— the parent reviews and selects which dates to save. The email pipeline uses
`lib/pipeline.ts` (`runPipeline`) which saves everything automatically.

---

## 4. Database Schema

```sql
-- users
CREATE TABLE users (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT        NOT NULL UNIQUE,
  forwarding_address   TEXT        UNIQUE,
  onboarding_completed BOOLEAN     NOT NULL DEFAULT false,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- children
CREATE TABLE children (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  school_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT children_user_id_name_unique UNIQUE (user_id, name)
);

-- notes
CREATE TABLE notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  source_type         TEXT NOT NULL
                        CHECK (source_type IN ('email','paste','gmail_verification')),
  raw_text            TEXT,
  subject             TEXT,
  sender_email        TEXT,
  parsed_title        TEXT,
  parsed_type         TEXT,
  parsed_summary_json JSONB,   -- string[]
  parsed_actions_json JSONB,   -- ActionItem[]
  parsed_events_json  JSONB,   -- Event[]
  parsed_items_json   JSONB,   -- ThingToBring[]
  parsed_flags_json   JSONB,   -- { flags: string[], ambiguities: string[] }
  parse_status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (parse_status IN
                          ('pending','processing','success','empty','failed',
                           'gmail_verification')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- upcoming_dates
CREATE TABLE upcoming_dates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  note_id        UUID REFERENCES notes(id) ON DELETE SET NULL,
  child_id       UUID REFERENCES children(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  iso_date       DATE,
  display_date   TEXT,
  time           TEXT,
  location       TEXT,
  source_label   TEXT,
  source_snippet TEXT,
  item_type      TEXT CHECK (item_type IN ('event','action','bring')),
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Environment Variables

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL          # e.g. http://localhost:3000
POSTMARK_SERVER_TOKEN
POSTMARK_FROM_EMAIL
POSTMARK_INBOUND_HASH
POSTMARK_INBOUND_ADDRESS      # e.g. abc123@inbound.postmarkapp.com
```

---

## 6. Full Source Code

### middleware.ts
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/upcoming/:path*', '/notes/:path*', '/paste/:path*', '/onboarding/:path*'],
};
```

### lib/supabase.ts
```typescript
import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

### lib/supabase-auth.ts
```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createAuthClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch {}
        },
      },
    }
  );
}
```

### lib/schema.ts
```typescript
import { z } from 'zod';

export const ActionItemSchema = z.object({
  task: z.string(), due_date: z.string(), priority: z.string(),
  applies_to: z.string(), source_snippet: z.string(),
});
export const EventSchema = z.object({
  name: z.string(), date: z.string(), time: z.string(),
  location: z.string(), source_snippet: z.string(),
});
export const ThingToBringSchema = z.object({
  item: z.string(), date_needed: z.string(), source_snippet: z.string(),
});
export const PaymentOrFormSchema = z.object({
  item: z.string(), amount: z.string(), due_date: z.string(), source_snippet: z.string(),
});
export const ExtractionSchema = z.object({
  title: z.string(),
  communication_type: z.enum([
    'newsletter','excursion','reminder','payment','event','uniform','general update','other',
  ]),
  summary: z.array(z.string()),
  action_items: z.array(ActionItemSchema),
  events: z.array(EventSchema),
  things_to_bring: z.array(ThingToBringSchema),
  payments_or_forms: z.array(PaymentOrFormSchema),
  flags: z.array(z.string()),
  ambiguities: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;
```

### lib/claude.ts
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ExtractionSchema, type Extraction } from '@/lib/schema';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT =
  'You are a careful assistant that reads school communications for busy parents. ' +
  'Your task is to extract only the information that matters to a parent. ' +
  'Return valid JSON only. Do not include commentary, markdown, or backticks.';

function buildUserMessage(text: string, todayDate: string): string {
  return `Today's date is ${todayDate}.

Read this school communication and extract what matters. Return valid JSON matching this schema exactly:
{
  "title": "short descriptive title",
  "communication_type": "newsletter|excursion|reminder|payment|event|uniform|general update|other",
  "summary": ["bullet point 1", "bullet point 2"],
  "action_items": [{"task": "", "due_date": "", "priority": "high|medium|low", "applies_to": "", "source_snippet": ""}],
  "events": [{"name": "", "date": "", "time": "", "location": "", "source_snippet": ""}],
  "things_to_bring": [{"item": "", "date_needed": "", "source_snippet": ""}],
  "payments_or_forms": [{"item": "", "amount": "", "due_date": "", "source_snippet": ""}],
  "flags": [],
  "ambiguities": []
}

Rules:
- Do not invent details not present in the text
- Use empty arrays [] for fields with no content — never null or missing keys
- source_snippet must be a short exact phrase copied from the original text
- For dates, use the most specific form available (e.g. "14 May 2026" not "next week")
- Return JSON only — no other text before or after

School communication:
${text}`;
}

function cleanJsonText(raw: string): string {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  if (!s.startsWith('{')) {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end > start) s = s.slice(start, end + 1);
  }
  return s;
}

export async function extractFromEmail(text: string, todayDate: string): Promise<Extraction> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(text, todayDate) }],
  });

  const block = response.content[0];
  if (block.type !== 'text') throw new Error('Unexpected non-text response from Claude');

  const jsonText = cleanJsonText(block.text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(
      `Claude returned invalid JSON. Raw response (first 200 chars): ${block.text.slice(0, 200)}`
    );
  }
  return ExtractionSchema.parse(parsed);
}
```

### lib/date-parser.ts
```typescript
const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

function toISO(d: Date): string {
  // Use local date parts — toISOString() shifts to UTC, rolling back a day
  // in timezones east of UTC (e.g. Australia UTC+10/11).
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseToISODate(dateStr: string, ref: Date = new Date()): string | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  const lower = s.toLowerCase();
  if (['tba','tbd','','ongoing','various','n/a'].includes(lower)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const slashFull = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashFull) {
    const d = new Date(parseInt(slashFull[3]), parseInt(slashFull[2]) - 1, parseInt(slashFull[1]));
    if (!isNaN(d.getTime())) return toISO(d);
  }

  const slashShort = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (slashShort) {
    const d = new Date(ref.getFullYear(), parseInt(slashShort[2]) - 1, parseInt(slashShort[1]));
    if (d < ref) d.setFullYear(ref.getFullYear() + 1);
    if (!isNaN(d.getTime())) return toISO(d);
  }

  const dayMonth = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(\d{4})?$/i);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].toLowerCase()];
    if (month !== undefined) {
      const year = dayMonth[3] ? parseInt(dayMonth[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(dayMonth[1]));
      if (!dayMonth[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  const monthDay = s.match(/^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?$/i);
  if (monthDay) {
    const month = MONTHS[monthDay[1].toLowerCase()];
    if (month !== undefined) {
      const year = monthDay[3] ? parseInt(monthDay[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(monthDay[2]));
      if (!monthDay[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  const dowPrefix = s.match(
    /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s*,?\s*(\d{4})?$/i
  );
  if (dowPrefix) {
    const month = MONTHS[dowPrefix[2].toLowerCase()];
    if (month !== undefined) {
      const year = dowPrefix[3] ? parseInt(dowPrefix[3]) : ref.getFullYear();
      const d = new Date(year, month, parseInt(dowPrefix[1]));
      if (!dowPrefix[3] && d < ref) d.setFullYear(ref.getFullYear() + 1);
      if (!isNaN(d.getTime())) return toISO(d);
    }
  }

  if (/\d{4}/.test(s)) {
    const native = new Date(s);
    if (!isNaN(native.getTime())) return toISO(native);
  }

  return null;
}
```

### lib/pipeline.ts  (email pipeline — saves notes + upcoming_dates automatically)
```typescript
import { createServiceClient } from '@/lib/supabase';
import { extractFromEmail } from '@/lib/claude';
import { parseToISODate } from '@/lib/date-parser';
import type { Extraction } from '@/lib/schema';

export interface PipelineInput {
  rawText: string; subject?: string; senderEmail?: string;
  userId?: string; sourceType?: 'email' | 'paste';
}
export interface PipelineResult {
  success: boolean; noteId?: string; extraction?: Extraction;
  upcomingDatesCount?: number; error?: string;
}

type UpcomingDateInsert = {
  user_id: string | null; note_id: string; child_id: null;
  title: string; iso_date: string | null; display_date: string;
  time: string | null; location: string | null;
  source_label: string; source_snippet: string | null;
  item_type: 'event' | 'action' | 'bring';
};

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const supabase = createServiceClient();
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const { data: note, error: noteInsertError } = await supabase
    .from('notes')
    .insert({
      user_id: input.userId ?? null,
      source_type: input.sourceType ?? 'email',
      raw_text: input.rawText,
      subject: input.subject ?? null,
      sender_email: input.senderEmail ?? null,
      parse_status: 'processing',
    })
    .select('id').single();

  if (noteInsertError || !note) {
    return { success: false, error: `DB insert failed: ${noteInsertError?.message}` };
  }

  let extraction: Extraction | null = null;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      extraction = await extractFromEmail(input.rawText, todayStr);
      break;
    } catch (err) {
      lastError = String(err);
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!extraction) {
    await supabase.from('notes').update({ parse_status: 'failed' }).eq('id', note.id);
    return { success: false, noteId: note.id, error: `Extraction failed: ${lastError}` };
  }

  const hasContent = extraction.action_items.length > 0 ||
    extraction.events.length > 0 || extraction.payments_or_forms.length > 0;

  await supabase.from('notes').update({
    parsed_title: extraction.title,
    parsed_type: extraction.communication_type,
    parsed_summary_json: extraction.summary,
    parsed_actions_json: extraction.action_items,
    parsed_events_json: extraction.events,
    parsed_items_json: extraction.things_to_bring,
    parsed_flags_json: { flags: extraction.flags, ambiguities: extraction.ambiguities },
    parse_status: hasContent ? 'success' : 'empty',
  }).eq('id', note.id);

  const datesToInsert: UpcomingDateInsert[] = [];
  const userId = input.userId ?? null;

  for (const event of extraction.events) {
    datesToInsert.push({
      user_id: userId, note_id: note.id, child_id: null,
      title: event.name, iso_date: parseToISODate(event.date, today),
      display_date: event.date, time: event.time || null,
      location: event.location || null, source_label: event.name,
      source_snippet: event.source_snippet || null, item_type: 'event',
    });
  }
  for (const action of extraction.action_items) {
    if (!action.due_date) continue;
    datesToInsert.push({
      user_id: userId, note_id: note.id, child_id: null,
      title: action.task, iso_date: parseToISODate(action.due_date, today),
      display_date: action.due_date, time: null, location: null,
      source_label: action.task, source_snippet: action.source_snippet || null,
      item_type: 'action',
    });
  }
  for (const payment of extraction.payments_or_forms) {
    if (!payment.due_date) continue;
    const amount = payment.amount.replace(/^\$/, '');
    const title = amount ? `${payment.item} ($${amount})` : payment.item;
    datesToInsert.push({
      user_id: userId, note_id: note.id, child_id: null,
      title, iso_date: parseToISODate(payment.due_date, today),
      display_date: payment.due_date, time: null, location: null,
      source_label: payment.item, source_snippet: payment.source_snippet || null,
      item_type: 'action',
    });
  }
  for (const bring of extraction.things_to_bring) {
    if (!bring.date_needed) continue;
    datesToInsert.push({
      user_id: userId, note_id: note.id, child_id: null,
      title: bring.item, iso_date: parseToISODate(bring.date_needed, today),
      display_date: bring.date_needed, time: null, location: null,
      source_label: bring.item, source_snippet: bring.source_snippet || null,
      item_type: 'bring',
    });
  }

  let upcomingDatesCount = 0;
  if (datesToInsert.length > 0) {
    const { data: inserted } = await supabase
      .from('upcoming_dates').insert(datesToInsert).select('id');
    upcomingDatesCount = inserted?.length ?? 0;
  }

  return { success: true, noteId: note.id, extraction, upcomingDatesCount };
}
```

### lib/extract.ts  (paste flow — saves note only, no upcoming_dates)
```typescript
import { createServiceClient } from '@/lib/supabase';
import { extractFromEmail } from '@/lib/claude';
import type { Extraction } from '@/lib/schema';

export type ExtractResult =
  | { success: true; noteId: string; extraction: Extraction }
  | { success: false; error: string; noteId?: string };

export async function extractAndSaveNote(input: {
  rawText: string; subject?: string; userId: string; sourceType: 'paste';
}): Promise<ExtractResult> {
  const db = createServiceClient();
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const { data: note, error: noteErr } = await db
    .from('notes')
    .insert({
      user_id: input.userId, source_type: input.sourceType,
      raw_text: input.rawText, subject: input.subject ?? null, parse_status: 'processing',
    })
    .select('id').single();

  if (noteErr || !note) return { success: false, error: `DB insert failed: ${noteErr?.message}` };

  let extraction: Extraction | null = null;
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try { extraction = await extractFromEmail(input.rawText, todayStr); break; }
    catch (err) {
      lastError = String(err);
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!extraction) {
    await db.from('notes').update({ parse_status: 'failed' }).eq('id', note.id);
    return { success: false, error: lastError, noteId: note.id };
  }

  const hasContent = extraction.action_items.length > 0 ||
    extraction.events.length > 0 || extraction.payments_or_forms.length > 0;

  await db.from('notes').update({
    parsed_title: extraction.title, parsed_type: extraction.communication_type,
    parsed_summary_json: extraction.summary, parsed_actions_json: extraction.action_items,
    parsed_events_json: extraction.events, parsed_items_json: extraction.things_to_bring,
    parsed_flags_json: { flags: extraction.flags, ambiguities: extraction.ambiguities },
    parse_status: hasContent ? 'success' : 'empty',
  }).eq('id', note.id);

  return { success: true, noteId: note.id, extraction };
}
```

### app/actions.ts
```typescript
'use server';
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

async function getAuthUserId(): Promise<string | null> {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function signOut() {
  const supabase = createAuthClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function deleteUpcomingDate(id: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db.from('upcoming_dates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', userId);
  return { error: error?.message };
}

export async function undoDeleteUpcomingDate(id: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db.from('upcoming_dates')
    .update({ deleted_at: null }).eq('id', id).eq('user_id', userId);
  return { error: error?.message };
}

export async function updateDateTitle(id: string, title: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const trimmed = title.trim();
  if (!trimmed) return { error: 'Title cannot be empty' };
  if (trimmed.length > 200) return { error: 'Title must be 200 characters or less' };
  const db = createServiceClient();
  const { error } = await db.from('upcoming_dates')
    .update({ title: trimmed }).eq('id', id).eq('user_id', userId);
  return { error: error?.message };
}

export async function savePasteDatesToUpcoming(input: {
  noteId: string; childId: string | null;
  dates: Array<{
    title: string; iso_date: string | null; display_date: string;
    time: string | null; location: string | null; source_label: string;
    source_snippet: string | null; item_type: 'event' | 'action' | 'bring';
  }>;
}): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  if (input.dates.length === 0) return {};
  const db = createServiceClient();
  const rows = input.dates.map((d) => ({
    user_id: userId, note_id: input.noteId, child_id: input.childId, ...d,
  }));
  const { error } = await db.from('upcoming_dates').insert(rows);
  return { error: error?.message };
}

export async function saveChildren(
  children: Array<{ name: string; school_name: string }>
): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const rows = children.filter((c) => c.name.trim()).map((c) => ({
    user_id: userId,
    name: c.name.trim().slice(0, 100),
    school_name: c.school_name.trim().slice(0, 200) || null,
  }));
  if (rows.length === 0) return {};
  const db = createServiceClient();
  const { error } = await db.from('children').upsert(rows, {
    onConflict: 'user_id,name', ignoreDuplicates: true,
  });
  return { error: error?.message };
}

export async function completeOnboarding(): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db.from('users')
    .update({ onboarding_completed: true }).eq('id', userId);
  return { error: error?.message };
}
```

### app/api/inbound/route.ts  (Postmark webhook)
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { ServerClient } from 'postmark';
import { createServiceClient } from '@/lib/supabase';
import { runPipeline } from '@/lib/pipeline';

function ok(body: Record<string, unknown>) {
  return NextResponse.json(body, { status: 200 });
}

interface PostmarkInboundPayload {
  From: string;
  FromFull?: { Email: string; Name: string; MailboxHash: string };
  To: string;
  ToFull?: Array<{ Email: string; Name: string; MailboxHash: string }>;
  OriginalRecipient?: string;
  Subject: string;
  TextBody?: string;
  HtmlBody?: string;
}

function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).toLowerCase().trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

async function handleGmailVerification(
  payload: PostmarkInboundPayload, userEmail: string | null
): Promise<void> {
  const supabase = createServiceClient();
  const body = payload.TextBody ?? '';
  await supabase.from('notes').insert({
    source_type: 'gmail_verification', raw_text: body,
    subject: payload.Subject,
    sender_email: extractEmailAddress(payload.From),
    parse_status: 'gmail_verification',
  });
  if (!userEmail || !process.env.POSTMARK_SERVER_TOKEN) return;
  const codeMatch = body.match(/\b(\d{9})\b/);
  const urlMatch = body.match(/https:\/\/mail\.google\.com\/mail\/vf-[^\s\r\n]+/);
  const lines = [
    'SchoolBrief received a Gmail forwarding verification email.',
    '', codeMatch ? `Confirmation code: ${codeMatch[1]}` : '',
    urlMatch ? `Verification link: ${urlMatch[0]}` : '',
    '', 'Paste the code or click the link in your Gmail settings to complete setup.',
    '', '--- Original message ---', body,
  ].join('\n');
  const pm = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  await pm.sendEmail({
    From: process.env.POSTMARK_FROM_EMAIL ?? 'hello@schoolbrief.app',
    To: userEmail,
    Subject: 'Action needed: confirm Gmail forwarding for SchoolBrief',
    TextBody: lines,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: PostmarkInboundPayload;
  try { payload = (await req.json()) as PostmarkInboundPayload; }
  catch { return ok({ status: 'error', reason: 'invalid_json' }); }

  const senderEmail = payload.FromFull?.Email?.toLowerCase() ?? extractEmailAddress(payload.From);
  const recipientEmail = (
    payload.OriginalRecipient ?? payload.ToFull?.[0]?.Email ?? payload.To
  ).toLowerCase();

  const supabase = createServiceClient();
  const { data: user } = await supabase
    .from('users').select('id, email')
    .eq('forwarding_address', recipientEmail).maybeSingle();

  if (senderEmail === 'forwarding-noreply@google.com') {
    try { await handleGmailVerification(payload, user?.email ?? null); }
    catch (err) { console.error('[inbound] Gmail verification error:', err); }
    return ok({ status: 'gmail_verification_handled' });
  }

  const textBody = payload.TextBody?.trim()
    ? payload.TextBody : stripHtml(payload.HtmlBody ?? '');
  if (!textBody) return ok({ status: 'skipped', reason: 'empty_body' });
  if (!user) {
    console.warn(`[inbound] No user for forwarding address: ${recipientEmail}`);
    return ok({ status: 'skipped', reason: 'unknown_recipient' });
  }

  try {
    const result = await runPipeline({
      rawText: textBody, subject: payload.Subject,
      senderEmail, userId: user.id, sourceType: 'email',
    });
    return ok({
      status: result.success ? 'success' : 'failed',
      noteId: result.noteId,
      upcomingDatesCount: result.upcomingDatesCount ?? 0,
      error: result.error,
    });
  } catch (err) {
    console.error('[inbound] Pipeline error:', err);
    return ok({ status: 'error', error: String(err) });
  }
}
```

### app/api/parse/route.ts
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuthClient } from '@/lib/supabase-auth';
import { extractAndSaveNote } from '@/lib/extract';

const BodySchema = z.object({
  text: z.string().min(1).max(50_000),
});

export async function POST(req: NextRequest) {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 }
    );
  }

  const result = await extractAndSaveNote({
    rawText: parsed.data.text, userId: user.id, sourceType: 'paste',
  });

  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ noteId: result.noteId, extraction: result.extraction });
}
```

### app/(auth)/login/page.tsx
```typescript
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';

async function sendMagicLink(formData: FormData) {
  'use server';
  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email) redirect('/login?error=email_required');
  const supabase = createAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) redirect('/login?error=send_failed');
  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Please enter your email address.',
  send_failed: 'Something went wrong. Please try again.',
  auth_failed: 'Sign-in failed. Please request a new link.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; email?: string; error?: string };
}) {
  const sent = searchParams.sent === '1';
  const email = searchParams.email ?? '';
  const errorMsg = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.') : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#F7F5F0' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold" style={{ color: '#1a1a1a' }}>SchoolBrief</h1>
          <p className="mt-2 text-sm text-gray-500">Paste a school note. Never miss a date.</p>
        </div>
        {sent ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500">
              We sent a sign-in link to <span className="font-medium text-gray-700">{email}</span>.
            </p>
            <p className="mt-5 text-xs text-gray-400">
              Didn&apos;t get it?{' '}
              <a href="/login" style={{ color: '#4A7C59' }} className="underline">Try again</a>
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Sign in</h2>
            <p className="text-sm text-gray-500 mb-6">No password needed — we&apos;ll email you a link.</p>
            {errorMsg && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {errorMsg}
              </div>
            )}
            <form action={sendMagicLink} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input id="email" name="email" type="email" required autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]"
                />
              </div>
              <button type="submit"
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#4A7C59' }}>
                Send magic link
              </button>
            </form>
            <p className="mt-6 text-xs text-center text-gray-400">Free during beta · No credit card required</p>
          </div>
        )}
      </div>
    </main>
  );
}
```

### app/(app)/layout.tsx
```typescript
import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';
import Nav from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('users').select('email, forwarding_address, onboarding_completed')
    .eq('id', user.id).maybeSingle();

  if (!profile?.onboarding_completed) redirect('/onboarding');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F5F0' }}>
      <Nav email={profile?.email ?? user.email ?? ''} isConnected={!!profile?.forwarding_address} />
      <div className="max-w-lg mx-auto">{children}</div>
    </div>
  );
}
```

### components/Nav.tsx
```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from '@/components/SignOutButton';

export default function Nav({ email, isConnected }: { email: string; isConnected: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg" style={{ color: '#1a1a1a' }}>SchoolBrief</span>
          {isConnected && (
            <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: '#4A7C59' }}>● Connected</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 hidden sm:block truncate max-w-[140px]">{email}</span>
          <SignOutButton />
        </div>
      </div>
      <div className="max-w-lg mx-auto flex px-2">
        <TabLink href="/upcoming" label="Upcoming" active={pathname.startsWith('/upcoming')} />
        <TabLink href="/notes" label="Notes" active={pathname.startsWith('/notes')} />
      </div>
    </nav>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      active ? 'border-[#4A7C59] text-[#4A7C59]' : 'border-transparent text-gray-400 hover:text-gray-600'
    }`}>{label}</Link>
  );
}
```

---

## 7. Known Limitations & Deliberate Decisions

- **No Row-Level Security (RLS):** All server-side queries use the service role
  key filtered by `user_id`. Equivalent to RLS in practice for this architecture.
  
- **Single inbound address:** All users share the same Postmark inbound address
  (`forwarding_address` in the DB). Multi-user routing via `OriginalRecipient`
  matching works for MVP, but for scale each user would need a unique inbound
  address (Postmark supports this via subaddressing or multiple servers).

- **No deduplication:** If a parent forwards the same email twice, both get
  extracted. The PRD accepts this — parent self-corrects via one-tap delete.

- **Payments not stored as a separate note field:** `payments_or_forms` from
  Claude are stored only in `upcoming_dates` (as `item_type='action'`), not
  persisted in the `notes` table's parsed JSON. This means the note detail view
  doesn't show the payments section. Planned for a future sprint.

- **No push notifications:** Out of scope for MVP.

- **Date parser edge case:** If Claude returns a date without a year (e.g.,
  "15 May") and that date is in the recent past, the parser rolls it forward to
  next year. In practice Claude almost always returns full year strings because
  today's date is injected into every prompt.

---

## 8. Questions for the Reviewer

1. Is the auth architecture (service role key + manual user_id filter, no RLS)
   acceptable for a beta product, or should RLS policies be added before sharing
   with external users?

2. The email pipeline is fire-and-forget from the parent's perspective — they
   never see a processing state. Is this the right UX for trust, or should there
   be some "processing" feedback?

3. The paste flow requires a parent to manually review and check boxes before
   saving dates. The email pipeline saves automatically. Is this asymmetry
   intentional and justified, or should both flows work the same way?

4. `items_to_bring` with no date are currently not saved to `upcoming_dates`
   (the loop has `if (!bring.date_needed) continue`). Should dateless bring
   items still appear in Upcoming?

5. Are there any security concerns with the current onboarding flow, specifically
   the Step 4 polling endpoint (`/api/onboarding/poll`) which returns a note
   summary to the client?

6. The `source_snippet` displayed in the bottom sheet is Claude's extraction —
   it's described as "an exact phrase from the original email" but Claude
   occasionally paraphrases slightly. Is there a better trust mechanism?
```

---

*Generated April 2026. SchoolBrief v0.3 — Sprints 1–3 complete.*
