import { NextRequest, NextResponse } from 'next/server';
import { ServerClient } from 'postmark';
import { createServiceClient } from '@/lib/supabase';
import { runPipeline } from '@/lib/pipeline';

// Always return 200 to Postmark — non-200 triggers retries
function ok(body: Record<string, unknown>) {
  return NextResponse.json(body, { status: 200 });
}

interface PostmarkFromFull {
  Email: string;
  Name: string;
  MailboxHash: string;
}

interface PostmarkInboundPayload {
  From: string;
  FromFull?: PostmarkFromFull;
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
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleGmailVerification(
  payload: PostmarkInboundPayload,
  userEmail: string | null
): Promise<void> {
  const supabase = createServiceClient();
  const body = payload.TextBody ?? '';

  // Save to notes for audit trail
  await supabase.from('notes').insert({
    source_type: 'gmail_verification',
    raw_text: body,
    subject: payload.Subject,
    sender_email: extractEmailAddress(payload.From),
    parse_status: 'gmail_verification',
  });

  // Forward to the parent's login email with code and link surfaced clearly
  if (!userEmail || !process.env.POSTMARK_SERVER_TOKEN) return;

  const codeMatch = body.match(/\b(\d{9})\b/);
  const code = codeMatch?.[1] ?? null;

  const urlMatch = body.match(/https:\/\/mail\.google\.com\/mail\/vf-[^\s\r\n]+/);
  const verifyUrl = urlMatch?.[0] ?? null;

  const lines = [
    'SchoolBrief received a Gmail forwarding verification email.',
    '',
    code ? `Confirmation code: ${code}` : '',
    verifyUrl ? `Verification link: ${verifyUrl}` : '',
    '',
    'Paste the code or click the link in your Gmail settings to complete setup.',
    '',
    '--- Original message ---',
    body,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const pm = new ServerClient(process.env.POSTMARK_SERVER_TOKEN);
  await pm.sendEmail({
    From: process.env.POSTMARK_FROM_EMAIL ?? 'hello@getschoolbrief.com',
    To: userEmail,
    Subject: 'Action needed: confirm Gmail forwarding for SchoolBrief',
    TextBody: lines,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: PostmarkInboundPayload;
  try {
    payload = (await req.json()) as PostmarkInboundPayload;
  } catch {
    return ok({ status: 'error', reason: 'invalid_json' });
  }

  const senderEmail =
    payload.FromFull?.Email?.toLowerCase() ?? extractEmailAddress(payload.From);

  // OriginalRecipient is the most reliable field for the per-user address
  const recipientEmail = (
    payload.OriginalRecipient ??
    payload.ToFull?.[0]?.Email ??
    payload.To
  ).toLowerCase();

  const supabase = createServiceClient();

  // Look up user by forwarding address
  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('forwarding_address', recipientEmail)
    .maybeSingle();

  // --- Gmail forwarding verification email ---
  // Must be handled before any other processing
  if (senderEmail === 'forwarding-noreply@google.com') {
    try {
      await handleGmailVerification(payload, user?.email ?? null);
    } catch (err) {
      console.error('[inbound] Gmail verification handling error:', err);
    }
    return ok({ status: 'gmail_verification_handled' });
  }

  // Resolve email body; fall back to stripped HTML if plain text is empty
  const textBody = payload.TextBody?.trim()
    ? payload.TextBody
    : stripHtml(payload.HtmlBody ?? '');

  if (!textBody) {
    return ok({ status: 'skipped', reason: 'empty_body' });
  }

  // Drop emails for unknown addresses — log at warn level for ops visibility
  if (!user) {
    console.warn(
      `[inbound] No user found for forwarding address: ${recipientEmail}`
    );
    return ok({ status: 'skipped', reason: 'unknown_recipient' });
  }

  try {
    const result = await runPipeline({
      rawText: textBody,
      subject: payload.Subject,
      senderEmail,
      userId: user.id,
      sourceType: 'email',
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
