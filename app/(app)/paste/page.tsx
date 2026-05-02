import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';
import PasteClient from './PasteClient';

export const dynamic = 'force-dynamic';

export default async function PastePage() {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data: children } = await db
    .from('children')
    .select('id, name')
    .eq('user_id', user.id)
    .order('name');

  return <PasteClient children={(children ?? []) as { id: string; name: string }[]} />;
}
