import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

/**
 * Generates a unique per-user inbound address using Postmark subaddressing.
 * Format: HASH+SHORTID@inbound.postmarkapp.com
 *
 * This guarantees correct routing even when school mailing lists drop the
 * OriginalRecipient header — each user has a truly unique address.
 */
function generateForwardingAddress(userId: string): string | null {
  const base = process.env.POSTMARK_INBOUND_ADDRESS;
  if (!base) return null;
  const atIndex = base.lastIndexOf('@');
  if (atIndex === -1) return null;
  const localPart = base.slice(0, atIndex);
  const domain = base.slice(atIndex + 1);
  const shortId = userId.replace(/-/g, '').slice(0, 12);
  return `${localPart}+${shortId}@${domain}`;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createAuthClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const db = createServiceClient();

      const { data: existing } = await db
        .from('users')
        .select('id, forwarding_address')
        .eq('id', data.user.id)
        .maybeSingle();

      // Generate a unique forwarding address for new users (or users without one)
      const forwardingAddress =
        existing?.forwarding_address ?? generateForwardingAddress(data.user.id);

      await db.from('users').upsert(
        {
          id: data.user.id,
          email: data.user.email!,
          ...(forwardingAddress ? { forwarding_address: forwardingAddress } : {}),
        },
        { onConflict: 'id' }
      );

      return NextResponse.redirect(`${origin}/upcoming`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
