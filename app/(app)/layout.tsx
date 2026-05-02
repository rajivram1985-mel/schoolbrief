import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';
import Nav from '@/components/Nav';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data: profile } = await db
    .from('users')
    .select('email, forwarding_address, onboarding_completed')
    .eq('id', user.id)
    .maybeSingle();

  // Redirect new users through onboarding before they reach any app screen
  if (!profile?.onboarding_completed) {
    redirect('/onboarding');
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F7F5F0' }}>
      <Nav
        email={profile?.email ?? user.email ?? ''}
        isConnected={!!profile?.forwarding_address}
      />
      <div className="max-w-lg mx-auto">{children}</div>
    </div>
  );
}
