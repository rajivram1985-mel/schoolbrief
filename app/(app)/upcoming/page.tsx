import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';
import UpcomingClient from './UpcomingClient';

export const dynamic = 'force-dynamic';

// Shared type used by UpcomingClient and BottomSheet
export type UpcomingDateRow = {
  id: string;
  user_id: string;
  note_id: string | null;
  child_id: string | null;
  title: string;
  iso_date: string | null;
  display_date: string | null;
  time: string | null;
  location: string | null;
  source_label: string | null;
  source_snippet: string | null;
  item_type: 'event' | 'action' | 'bring' | null;
  deleted_at: string | null;
  created_at: string;
  children: { name: string } | null;
  notes: { subject: string | null; sender_email: string | null; created_at: string } | null;
};

export default async function UpcomingPage() {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data } = await db
    .from('upcoming_dates')
    .select('*, children(name), notes(subject, sender_email, created_at)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('iso_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  return <UpcomingClient items={(data ?? []) as UpcomingDateRow[]} />;
}
