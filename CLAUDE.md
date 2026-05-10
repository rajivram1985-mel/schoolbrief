# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

```bash
npm run dev    # Next.js dev server on :3000
npm run build  # production build (also runs type-check via tsc plugin)
npm run lint   # next lint (ESLint with eslint-config-next)
npm start      # serve the production build
```

There is no test suite. Validate changes by running `npm run build` (catches TS errors) and exercising the flow via the dev server or the Postmark/paste endpoints below.

### Manually exercising the pipeline

```bash
# Bypass Postmark — runs the full extraction + DB write
curl -X POST http://localhost:3000/api/test-inbound \
  -H "Content-Type: application/json" \
  -d '{"text": "Permission slip due Friday 14 May. $22 bus fee."}'

# Authenticated paste flow (requires logged-in cookie session)
curl -X POST http://localhost:3000/api/parse \
  -H "Content-Type: application/json" \
  -d '{"text": "..."}'
```

## Architecture

SchoolBrief is a Next.js 14 App Router app that turns a school email or pasted text into a chronological list of dates/actions for a parent. There are three intake paths feeding one extraction pipeline, two persistence shapes, and one read view.

### Intake → extraction → persistence

```
Postmark inbound  ─┐
                   ├──► extractFromEmail() ──► notes row (parsed_*_json) ──► upcoming_dates rows
Manual paste     ─┘                                  └──► (paste flow stops here; user reviews then saves)
```

- **`lib/claude.ts`** — single Anthropic call (`claude-haiku-4-5-20251001`). The prompt asks for strict JSON; `cleanJsonText` strips fences/preamble before `ExtractionSchema.parse`. The model name is hard-coded here.
- **`lib/schema.ts`** — Zod schema for the extraction. Every field has `.default(...)` and `communication_type` uses `.catch('other')` because LLMs drift; never tighten this without adding a fallback.
- **`lib/pipeline.ts`** — used by inbound emails. Creates a `notes` row in `processing`, retries Claude once, writes parsed JSON back, then fans out events/actions/payments/things-to-bring into `upcoming_dates` rows. Sets `parse_status` to `success` / `empty` / `failed`.
- **`lib/extract.ts`** — used by the paste flow (`/api/parse`). Same Claude call but **does not** write `upcoming_dates` — the client (`app/(app)/paste/PasteClient.tsx`) shows the extraction for review and then calls `savePasteDatesToUpcoming` server action to insert the rows the user kept.
- **`lib/date-parser.ts`** — converts Claude's free-form date strings to `YYYY-MM-DD`. Uses local-time `Date` parts (never `toISOString()` — see "Timezone" below). Returns `null` for unparseable strings ("TBA", "Term 2 Week 3"); those rows still get inserted with `iso_date = null` and `display_date` preserved.

### Inbound webhook routing

`app/api/inbound/route.ts` always returns 200 (non-200 makes Postmark retry). Two special cases run **before** the pipeline:

1. **Gmail forwarding verification** — sender `forwarding-noreply@google.com`. Bypasses Claude, extracts the 9-digit code and `https://mail.google.com/mail/vf-...` link, and emails them to the parent's login address via Postmark. Without this, every Gmail auto-forward setup would silently fail.
2. **Unknown recipient** — looks up the user by `forwarding_address = OriginalRecipient`. Each user gets a unique Postmark sub-addressed inbound (`hash+shortid@inbound.postmarkapp.com`) generated in `app/auth/callback/route.ts` on first sign-in. School mailing lists sometimes drop `OriginalRecipient`; the sub-address survives.

### Auth and middleware

- Supabase magic-link auth. `middleware.ts` protects `/upcoming`, `/notes`, `/paste`, `/onboarding` — unauthenticated requests redirect to `/login`.
- `app/(app)/layout.tsx` enforces a second gate: if `users.onboarding_completed` is false, redirect to `/onboarding`. New users always land on onboarding before any app screen.
- **Two Supabase clients, used deliberately**:
  - `createAuthClient()` (`lib/supabase-auth.ts`) — cookie-based SSR client, used to read `auth.getUser()` and verify the caller.
  - `createServiceClient()` (`lib/supabase.ts`) — service-role client, used for all DB reads/writes after auth has been verified.
  - Server actions in `app/actions.ts` follow the pattern: `getAuthUserId()` via the auth client, then service-role write with `.eq('user_id', userId)` to enforce ownership. RLS is not the primary defense — the userId filter in the query is.

### Routing layout

- `app/(app)/*` — authenticated routes wrapped by the layout that requires onboarding completion (`upcoming`, `notes`, `paste`).
- `app/(auth)/login` — unauthenticated.
- `app/onboarding` — authenticated but outside the `(app)` group so it can render before onboarding is complete.
- `app/api/inbound` — Postmark webhook. `app/api/test-inbound` — local-only bypass. `app/api/parse` — authenticated paste extraction.

### Database

Schema lives in `supabase/schema.sql` plus `sprint2-migration.sql` (added `upcoming_dates.item_type`) and `sprint3-migration.sql` (added `users.onboarding_completed`). Apply via the Supabase SQL Editor. Key tables:

- `users` — `forwarding_address` is unique and indexed; the inbound webhook hits this on every email.
- `notes` — full audit trail with `raw_text` and the parsed JSON columns (`parsed_summary_json`, `parsed_actions_json`, `parsed_events_json`, `parsed_items_json`, `parsed_flags_json`).
- `upcoming_dates` — denormalized rows for the read view. `iso_date` may be NULL; `display_date` always preserves Claude's original string. Soft-delete via `deleted_at`. `item_type` is `event | action | bring`.

## Things that look like bugs but aren't

- **`toISOString()` is never used for date storage.** All date formatting uses local `getFullYear/getMonth/getDate`. Australia is UTC+10/11, so `toISOString()` returns yesterday's date for anything happening before 10–11 AM local. See `lib/pipeline.ts:39` and `lib/date-parser.ts:16`.
- **Day/month slash dates are parsed as DD/MM, not MM/DD.** This is an Australian app; do not "fix" it.
- **Inbound webhook returns 200 even on errors.** Intentional — non-200 makes Postmark retry, which would re-process the email.
- **Zod schema fields default rather than fail.** Claude omits or nulls fields unpredictably; tightening this will cause real production emails to drop.

## Environment variables

See `.env.local.example`. Keys that aren't obvious:

- `SUPABASE_SERVICE_ROLE_KEY` — used by `createServiceClient()` for all DB writes. Server-only; never expose.
- `SUPABASE_ANON_KEY` — used by the SSR auth client and middleware.
- `POSTMARK_INBOUND_ADDRESS` — the base address (e.g. `abc123@inbound.postmarkapp.com`). Per-user addresses are generated as `abc123+<userid12>@inbound.postmarkapp.com` in the auth callback.
- `POSTMARK_FROM_EMAIL` — used to send Gmail-verification forwards back to the parent.

## Path alias

`@/*` resolves to repo root (see `tsconfig.json`). Imports are written `@/lib/...`, `@/components/...`.
