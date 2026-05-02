import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAuthClient } from '@/lib/supabase-auth';
import { extractAndSaveNote } from '@/lib/extract';

const BodySchema = z.object({
  text: z.string().min(1, 'Text is required').max(50_000, 'Text too long'),
});

export async function POST(req: NextRequest) {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
      { status: 400 }
    );
  }

  const result = await extractAndSaveNote({
    rawText: parsed.data.text,
    userId: user.id,
    sourceType: 'paste',
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ noteId: result.noteId, extraction: result.extraction });
}
