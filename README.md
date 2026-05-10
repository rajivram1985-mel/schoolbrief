# SchoolBrief — Sprint 1: Email Pipeline

School email arrives → AI extracts dates and actions → stored in Supabase.

This sprint delivers the working email pipeline and a minimal status page. No parent-facing UI yet.

---

## What's in this sprint

| Piece | Path |
|---|---|
| Postmark inbound webhook | `app/api/inbound/route.ts` |
| Local test endpoint | `app/api/test-inbound/route.ts` |
| Claude extraction | `lib/claude.ts` |
| Zod output schema | `lib/schema.ts` |
| Date string → ISO parser | `lib/date-parser.ts` |
| End-to-end pipeline | `lib/pipeline.ts` |
| Supabase client | `lib/supabase.ts` |
| Status page | `app/page.tsx` |
| DB schema | `supabase/schema.sql` |

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://console.anthropic.com) API key
- A [Postmark](https://postmarkapp.com) account with an inbound stream configured

---

## 1. Clone and install

```bash
cd schoolbrief
npm install
```

---

## 2. Apply the database schema

1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste the contents of `supabase/schema.sql` and click **Run**

---

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in every value:

| Variable | Where to find it |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API keys |
| `SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → `service_role` key |
| `POSTMARK_SERVER_TOKEN` | Postmark → server → API Tokens |
| `POSTMARK_FROM_EMAIL` | A sender address verified in Postmark (e.g. `hello@getschoolbrief.com`) |
| `POSTMARK_INBOUND_HASH` | The hash part of your inbound address (for reference) |

---

## 4. Configure Postmark inbound

1. In Postmark, create a **new server** (or use an existing one)
2. Go to **Inbound** → enable the inbound stream
3. Note the inbound address: `<hash>@inbound.postmarkapp.com`
4. Set the **webhook URL** to `https://your-vercel-domain.vercel.app/api/inbound`
   - For local dev: use `ngrok http 3000` and set the ngrok URL

Each user's `forwarding_address` in the `users` table should be set to their unique Postmark inbound address. For the first test, insert a row manually:

```sql
INSERT INTO users (email, forwarding_address)
VALUES ('you@gmail.com', 'your-hash@inbound.postmarkapp.com');
```

---

## 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll see the pipeline status page.

---

## 6. Test the pipeline

### Option A — Quick test via browser or curl (no Postmark needed)

```bash
# GET — short text in query param
curl "http://localhost:3000/api/test-inbound?text=Please+return+the+signed+permission+form+for+the+museum+excursion+by+Friday+9+May.+The+%2422+bus+fee+must+be+paid+via+the+portal+by+the+same+date."

# POST — longer texts
curl -X POST http://localhost:3000/api/test-inbound \
  -H "Content-Type: application/json" \
  -d '{"text": "Week 12 Newsletter. The Mother'\''s Day Stall runs 5–6 May. Send small change. Student Free Day: 15 May, no school. Riaan'\''s swimming carnival is 20 May at 9am, MWSC pool."}'
```

Check your Supabase `notes` and `upcoming_dates` tables to confirm the data was saved.

### Option B — End-to-end with real Postmark

1. Start your local server: `npm run dev`
2. Expose it: `ngrok http 3000`
3. Set the ngrok URL as your Postmark inbound webhook
4. Forward a real school email to your Postmark inbound address
5. Watch the status page update at [http://localhost:3000](http://localhost:3000)

---

## 7. Gmail forwarding verification (critical)

When a parent sets up Gmail auto-forwarding, Google sends a verification email from `forwarding-noreply@google.com` to the forwarding address. **This is handled automatically.**

The `/api/inbound` route detects this sender, bypasses Claude, extracts the 9-digit confirmation code and verification link, and emails them to the parent's login email via Postmark.

Without this, every parent's Gmail filter setup would fail silently.

---

## 8. Deploy to Vercel

```bash
# Install Vercel CLI if needed
npm i -g vercel

vercel
```

Set all environment variables in **Vercel → Project → Settings → Environment Variables** (same keys as `.env.local`).

Update your Postmark inbound webhook URL to the production Vercel domain.

---

## parse_status reference

| Status | Meaning |
|---|---|
| `pending` | Email received, not yet processed |
| `processing` | Claude API call in flight |
| `success` | Extraction completed; dates saved |
| `empty` | Extracted successfully but no events or actions found |
| `failed` | Extraction failed after retries; raw text preserved |
| `gmail_verification` | Gmail forwarding verification email — handled separately |

---

## Sprint 2 (next)

- Upcoming view — chronological list, month-grouped, child-tagged
- Auth — Supabase magic link
- Delete, past-date fading, child tagging
