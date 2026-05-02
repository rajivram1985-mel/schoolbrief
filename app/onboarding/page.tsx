import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';
import OnboardingClient from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('users')
    .select('onboarding_completed, forwarding_address')
    .eq('id', user.id)
    .maybeSingle();

  // Already completed — skip to the app
  if (profile?.onboarding_completed) redirect('/upcoming');

  const { data: existingChildren } = await db
    .from('children')
    .select('name, school_name')
    .eq('user_id', user.id)
    .order('name');

  return (
    <OnboardingClient
      forwardingAddress={profile?.forwarding_address ?? null}
      existingChildren={(existingChildren ?? []) as { name: string; school_name: string | null }[]}
    />
  );
}
