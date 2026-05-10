'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveChildren, completeOnboarding } from '@/app/actions';

type Step = 1 | 2 | 3 | 4;

type PolledNote = {
  id: string;
  parsed_title: string | null;
  parsed_summary_json: string[] | null;
  parsed_type: string | null;
};

const TOTAL_STEPS = 4;

// ── Progress indicator ────────────────────────────────────────────────────────

function Progress({ step }: { step: Step }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {([1, 2, 3, 4] as Step[]).map((s) => (
        <div
          key={s}
          className="rounded-full transition-all"
          style={{
            width: s === step ? '20px' : '8px',
            height: '8px',
            backgroundColor: s <= step ? '#4A7C59' : '#D1D5DB',
          }}
        />
      ))}
    </div>
  );
}

function StepLabel({ step }: { step: Step }) {
  return (
    <p className="text-xs text-gray-400 text-center mb-4">
      Step {step} of {TOTAL_STEPS}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingClient({
  forwardingAddress,
  existingChildren,
}: {
  forwardingAddress: string | null;
  existingChildren: { name: string; school_name: string | null }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 2 state
  const initialChildren =
    existingChildren.length > 0
      ? existingChildren.map((c) => ({ name: c.name, school_name: c.school_name ?? '' }))
      : [{ name: '', school_name: '' }];
  const [children, setChildren] = useState(initialChildren);
  const [savingChildren, setSavingChildren] = useState(false);

  // Step 3 state
  const [copied, setCopied] = useState(false);
  const [gmailGuideOpen, setGmailGuideOpen] = useState(false);

  // Step 4 state
  const [polledNote, setPolledNote] = useState<PolledNote | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [completing, setCompleting] = useState(false);

  async function finishOnboarding(destination: string) {
    setCompleting(true);
    const { error } = await completeOnboarding();
    if (error) {
      setCompleting(false);
      // Surface error in console — rare, non-fatal for the user flow
      console.error('completeOnboarding failed:', error);
    }
    router.push(destination);
    router.refresh();
  }

  const handleComplete = () => finishOnboarding('/upcoming');
  const handlePasteNow = () => finishOnboarding('/paste');

  // Polling logic — only active on step 4
  useEffect(() => {
    if (step !== 4) return;

    let stopped = false;

    const timeoutId = setTimeout(() => {
      stopped = true;
      setTimedOut(true);
    }, 2 * 60 * 1000);

    async function poll() {
      if (stopped) return;
      try {
        const res = await fetch('/api/onboarding/poll');
        const { note } = await res.json();
        if (note) {
          stopped = true;
          clearTimeout(timeoutId);
          setPolledNote(note);
          return;
        }
      } catch {}
      if (!stopped) setTimeout(poll, 3000);
    }

    poll();

    return () => {
      stopped = true;
      clearTimeout(timeoutId);
    };
  }, [step]);

  // ── Step 1: Welcome ─────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <Screen>
        <Progress step={1} />
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: '#4A7C59' }}>
            <span className="text-3xl">📅</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a1a1a' }}>
            Welcome to SchoolBrief
          </h1>
          <p className="text-base font-medium text-gray-600 mb-4">Never miss a school date again.</p>
          <p className="text-sm text-gray-500 leading-relaxed mb-8">
            Paste or forward any school note — Compass, email, daycare app, or a paper note from
            the bag. SchoolBrief pulls out the dates, actions, and things to bring.
          </p>
          <PrimaryButton onClick={() => setStep(2)}>Let&apos;s get started →</PrimaryButton>
        </div>
      </Screen>
    );
  }

  // ── Step 2: Children ────────────────────────────────────────────────────────
  if (step === 2) {
    const handleSaveChildren = async () => {
      const filled = children.filter((c) => c.name.trim());
      if (filled.length > 0) {
        setSavingChildren(true);
        await saveChildren(filled);
        setSavingChildren(false);
      }
      setStep(3);
    }

    return (
      <Screen>
        <StepLabel step={2} />
        <Progress step={2} />
        <BackButton onClick={() => setStep(1)} />
        <h2 className="text-xl font-bold mb-1" style={{ color: '#1a1a1a' }}>
          Who are you keeping track of?
        </h2>
        <p className="text-sm text-gray-500 mb-6">Add your children&apos;s names and schools.</p>

        <div className="space-y-4 mb-5">
          {children.map((child, i) => (
            <div key={i} className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-3">
              <p className="text-xs font-semibold text-gray-500">Child {i + 1}</p>
              <input
                type="text"
                placeholder="Name (e.g. Riaan)"
                value={child.name}
                onChange={(e) => {
                  const next = [...children];
                  next[i] = { ...next[i], name: e.target.value };
                  setChildren(next);
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]"
              />
              <input
                type="text"
                placeholder="School or daycare (e.g. Mount Waverley North Primary)"
                value={child.school_name}
                onChange={(e) => {
                  const next = [...children];
                  next[i] = { ...next[i], school_name: e.target.value };
                  setChildren(next);
                }}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#4A7C59]"
              />
            </div>
          ))}
        </div>

        {children.length < 4 && (
          <button
            onClick={() => setChildren([...children, { name: '', school_name: '' }])}
            className="text-sm mb-6 hover:underline"
            style={{ color: '#4A7C59' }}
          >
            + Add another child
          </button>
        )}

        <PrimaryButton onClick={handleSaveChildren} disabled={savingChildren}>
          {savingChildren ? 'Saving…' : 'Next →'}
        </PrimaryButton>
        <SecondaryButton onClick={() => setStep(3)}>Skip for now</SecondaryButton>
      </Screen>
    );
  }

  // ── Step 3: Send your first note ────────────────────────────────────────────
  if (step === 3) {
    const copyAddress = async () => {
      if (!forwardingAddress) return;
      await navigator.clipboard.writeText(forwardingAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    return (
      <Screen>
        <StepLabel step={3} />
        <Progress step={3} />
        <BackButton onClick={() => setStep(2)} />
        <h2 className="text-xl font-bold mb-1" style={{ color: '#1a1a1a' }}>
          Send us your first note.
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Most school updates come through Compass, Seesaw, or daycare apps where the email is just
          a notification. Paste those straight in. Real emails can be forwarded.
        </p>

        {/* Path 1: Paste — primary */}
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm border border-[#4A7C59] mb-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-900">Paste from any app</p>
            <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: '#4A7C59' }}>
              Easiest
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Open Compass, your daycare app, or any school email on your phone. Copy the text and
            paste it in. Works for everything.
          </p>
          <button
            onClick={handlePasteNow}
            disabled={completing}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: '#4A7C59' }}
          >
            {completing ? 'Opening…' : 'Paste a note now →'}
          </button>
        </div>

        {/* Path 2: Forward an email */}
        <div className="bg-white rounded-2xl px-4 py-4 shadow-sm mb-5">
          <p className="text-sm font-semibold text-gray-900 mb-1">Or forward an email</p>
          <p className="text-xs text-gray-500 mb-3">
            Best for emails that already contain the news — newsletters, P&amp;C updates, or a
            teacher writing directly.
          </p>

          {forwardingAddress ? (
            <div className="rounded-xl bg-gray-50 px-3 py-3 mb-3">
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Your SchoolBrief email</p>
              <p className="text-sm font-mono break-all text-gray-800 mb-2.5">{forwardingAddress}</p>
              <button
                onClick={copyAddress}
                className="w-full rounded-lg py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: copied ? '#4A7C59' : '#2BA8A0' }}
              >
                {copied ? '✓ Copied!' : 'Copy address'}
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Unique to you — don&apos;t share it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic mb-3">
              Forwarding address not set — contact support or set it in Supabase.
            </p>
          )}

          <button
            onClick={() => setGmailGuideOpen((o) => !o)}
            className="text-xs font-medium hover:underline"
            style={{ color: '#4A7C59' }}
          >
            {gmailGuideOpen ? 'Hide auto-forward guide ↑' : 'Set up Gmail auto-forwarding →'}
          </button>

          {gmailGuideOpen && (
            <ol className="mt-4 space-y-3 text-xs text-gray-600 list-decimal list-inside">
              <li>Open Gmail on your computer. Click the Settings cog (top right) → <strong>See all settings</strong>.</li>
              <li>Click the <strong>Filters and Blocked Addresses</strong> tab.</li>
              <li>Click <strong>Create a new filter</strong> at the bottom of the page.</li>
              <li>
                In the <strong>From</strong> field, add your school&apos;s sender address (e.g.{' '}
                <code className="bg-gray-100 px-1 rounded">noreply@compass.education</code>).
                You can also use domain matching (e.g. <code className="bg-gray-100 px-1 rounded">@compass.education</code>).
                Add one filter per sender if your kids use different platforms.
              </li>
              <li>
                Tick <strong>Forward it to</strong> and paste your SchoolBrief address. Click{' '}
                <strong>Create filter</strong>.
              </li>
              <li>
                Gmail will send a verification email to your SchoolBrief address.{' '}
                <strong>SchoolBrief automatically forwards that verification to your login email</strong> —
                just click the link to confirm.
              </li>
            </ol>
          )}
          {gmailGuideOpen && (
            <p className="mt-3 text-xs text-gray-400">
              Repeat for each school or daycare sender — your kids may use different platforms.
            </p>
          )}
        </div>

        <PrimaryButton onClick={() => setStep(4)}>
          I&apos;ve forwarded an email — show me it worked →
        </PrimaryButton>
        <SecondaryButton onClick={handleComplete} disabled={completing}>
          {completing ? 'Setting up…' : "I'll do this later → go to Upcoming"}
        </SecondaryButton>
      </Screen>
    );
  }

  // ── Step 4: Wow moment ──────────────────────────────────────────────────────
  return (
    <Screen>
      <StepLabel step={4} />
      <Progress step={4} />
      <BackButton onClick={() => setStep(3)} />

      {polledNote ? (
        // Success
        <div className="text-center">
          <div className="text-4xl mb-4">🎉</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>It&apos;s working.</h2>
          <p className="text-sm text-gray-500 mb-6">Your school email arrived and was read automatically.</p>

          <div className="bg-white rounded-2xl shadow-sm px-5 py-4 mb-6 text-left">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Just extracted</p>
            <p className="text-sm font-semibold text-gray-900 mb-2">
              {polledNote.parsed_title ?? 'School communication'}
            </p>
            {(polledNote.parsed_summary_json ?? []).slice(0, 3).map((s, i) => (
              <p key={i} className="text-xs text-gray-500 flex items-start gap-2 mb-1">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                {s}
              </p>
            ))}
          </div>

          <p className="text-sm text-gray-500 mb-6">You&apos;re all set.</p>
          <PrimaryButton onClick={handleComplete} disabled={completing}>
            {completing ? 'Setting up…' : 'Go to Upcoming →'}
          </PrimaryButton>
        </div>
      ) : timedOut ? (
        // Timeout
        <div className="text-center">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>No email yet — that&apos;s fine.</h2>
          <p className="text-sm text-gray-500 mb-2">
            Your SchoolBrief address is ready whenever you forward one.
          </p>
          <p className="text-sm text-gray-400 mb-8">
            You can always come back and forward a school email at any time.
          </p>
          <PrimaryButton onClick={handleComplete} disabled={completing}>
            {completing ? 'Setting up…' : 'Go to Upcoming →'}
          </PrimaryButton>
          <button
            onClick={handlePasteNow}
            disabled={completing}
            className="block mx-auto mt-3 text-sm text-center hover:underline disabled:opacity-40"
            style={{ color: '#4A7C59' }}
          >
            {completing ? 'Opening…' : 'Paste a note manually instead →'}
          </button>
        </div>
      ) : (
        // Waiting
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 animate-pulse"
            style={{ backgroundColor: '#2BA8A0' }}
          />
          <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>
            Waiting for your school email&hellip;
          </h2>
          <p className="text-sm text-gray-500">This usually takes less than a minute.</p>
          <p className="text-xs text-gray-400 mt-2">Checking every few seconds.</p>
        </div>
      )}
    </Screen>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-center px-4 py-12 max-w-sm mx-auto" style={{ backgroundColor: '#F7F5F0' }}>
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90 mb-3"
      style={{ backgroundColor: '#4A7C59' }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm mb-5 block" style={{ color: '#4A7C59' }}>
      ← Back
    </button>
  );
}
