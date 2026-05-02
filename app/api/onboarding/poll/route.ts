import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const db = createServiceClient();
  const { data } = await db
    .from('notes')
    .select('id, parsed_title, parsed_summary_json, parsed_type')
    .eq('user_id', user.id)
    .eq('parse_status', 'success')
    .gte('created_at', fiveMinutesAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ note: data });
}
