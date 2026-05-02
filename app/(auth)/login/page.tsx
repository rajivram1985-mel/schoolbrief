import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createAuthClient } from '@/lib/supabase-auth';

async function sendMagicLink(formData: FormData) {
  'use server';
  const h = headers();
  const forwardedHost = h.get('x-forwarded-host');
  const host = forwardedHost ?? h.get('host') ?? 'localhost:3000';
  const proto = forwardedHost ? 'https' : (h.get('x-forwarded-proto') ?? 'http');
  const origin = `${proto}://${host}`;

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  if (!email) redirect('/login?error=email_required');

  const supabase = createAuthClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) redirect(`/login?error=send_failed&detail=${encodeURIComponent(error.message)}`);
  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}

const ERROR_MESSAGES: Record<string, string> = {
  email_required: 'Please enter your email address.',
  send_failed: 'Something went wrong. Please try again.',
  auth_failed: 'Sign-in failed. Please request a new link.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; email?: string; error?: string; detail?: string };
}) {
  const sent = searchParams.sent === '1';
  const email = searchParams.email ?? '';
  const detail = searchParams.detail ?? '';
  const errorMsg = searchParams.error
    ? `${ERROR_MESSAGES[searchParams.error] ?? 'Something went wrong.'}${detail ? ` (${detail})` : ''}`
    : null;

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#F7F5F0' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold" style={{ color: '#1a1a1a' }}>
            SchoolBrief
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Paste a school note. Never miss a date.
          </p>
        </div>

        {sent ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Check your email
            </h2>
            <p className="text-sm text-gray-500">
              We sent a sign-in link to{' '}
              <span className="font-medium text-gray-700">{email}</span>.
              <br />
              Tap it to continue — no password needed.
            </p>
            <p className="mt-5 text-xs text-gray-400">
              Didn&apos;t get it?{' '}
              <a href="/login" style={{ color: '#4A7C59' }} className="underline">
                Try again
              </a>
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Sign in</h2>
            <p className="text-sm text-gray-500 mb-6">
              No password needed — we&apos;ll email you a link.
            </p>

            {errorMsg && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {errorMsg}
              </div>
            )}

            <form action={sendMagicLink} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
                style={{ backgroundColor: '#4A7C59' }}
              >
                Send magic link
              </button>
            </form>

            <p className="mt-6 text-xs text-center text-gray-400">
              Free during beta · No credit card required
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
