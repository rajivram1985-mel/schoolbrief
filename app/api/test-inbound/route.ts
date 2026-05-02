import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase-auth';
import { runPipeline } from '@/lib/pipeline';

/**
 * Dev-only endpoint. Requires an authenticated session so it can't be
 * abused by anonymous callers burning Claude API credits.
 *
 * GET  /api/test-inbound?text=<url-encoded body>
 * POST /api/test-inbound  body: { "text": "..." }
 */

async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const text = req.nextUrl.searchParams.get('text');
  if (!text?.trim()) {
    return NextResponse.json({ error: 'Missing required ?text= parameter' }, { status: 400 });
  }

  try {
    const result = await runPipeline({
      rawText: text,
      subject: 'Test extraction',
      senderEmail: 'test@local',
      userId,
      sourceType: 'paste',
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { text?: string };
  try {
    body = (await req.json()) as { text?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.text?.trim()) {
    return NextResponse.json({ error: 'Missing required body.text field' }, { status: 400 });
  }

  try {
    const result = await runPipeline({
      rawText: body.text,
      subject: 'Test extraction (POST)',
      senderEmail: 'test@local',
      userId,
      sourceType: 'paste',
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
