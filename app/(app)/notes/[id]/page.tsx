import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ActionItem   = { task: string; due_date: string; priority: string; applies_to: string; source_snippet: string };
type NoteEvent    = { name: string; date: string; time: string; location: string; source_snippet: string };
type ThingToBring = { item: string; date_needed: string; source_snippet: string };
type FlagsJson    = { flags: string[]; ambiguities: string[] };

const PRIORITY_STYLES: Record<string, string> = {
  high:   'bg-red-50 text-red-600',
  medium: 'bg-yellow-50 text-yellow-700',
  low:    'bg-gray-100 text-gray-500',
};

function Snippet({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mt-1 text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">
      &ldquo;{text}&rdquo;
    </p>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
      {children}
    </h3>
  );
}

export default async function NoteDetailPage({ params }: { params: { id: string } }) {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data: note } = await db
    .from('notes')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!note) notFound();

  const summary    = (note.parsed_summary_json  ?? []) as string[];
  const actions    = (note.parsed_actions_json  ?? []) as ActionItem[];
  const events     = (note.parsed_events_json   ?? []) as NoteEvent[];
  const things     = (note.parsed_items_json    ?? []) as ThingToBring[];
  const flagsObj   = (note.parsed_flags_json    ?? { flags: [], ambiguities: [] }) as FlagsJson;

  const received = new Date(note.created_at).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="px-4 pt-4 pb-24">
      {/* Back */}
      <Link
        href="/notes"
        className="inline-flex items-center gap-1 text-sm mb-5"
        style={{ color: '#4A7C59' }}
      >
        ← Notes
      </Link>

      {/* Review notice */}
      <div className="mb-5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <span className="text-amber-500 text-base leading-5 shrink-0">⚠</span>
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>Review before relying.</strong> AI extraction may miss details or make errors.
          Always verify important dates against the original email.
        </p>
      </div>

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
        <h1 className="text-lg font-bold mb-1" style={{ color: '#1a1a1a' }}>
          {note.parsed_title ?? note.subject ?? '(no subject)'}
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {note.parsed_type && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium capitalize">
              {note.parsed_type}
            </span>
          )}
          <span className="text-xs text-gray-400">{received}</span>
          {note.sender_email && (
            <span className="text-xs text-gray-400">· {note.sender_email}</span>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>Summary</SectionHeader>
          <ul className="space-y-1.5">
            {summary.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1 shrink-0 w-1.5 h-1.5 rounded-full bg-gray-300" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action items */}
      {actions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>What you need to do</SectionHeader>
          <div className="space-y-4">
            {actions.map((a, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-900">{a.task}</p>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      PRIORITY_STYLES[a.priority] ?? PRIORITY_STYLES.low
                    }`}
                  >
                    {a.priority}
                  </span>
                </div>
                {a.due_date && (
                  <p className="text-xs text-gray-500 mt-0.5">Due: {a.due_date}</p>
                )}
                {a.applies_to && (
                  <p className="text-xs text-gray-400">For: {a.applies_to}</p>
                )}
                <Snippet text={a.source_snippet} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events */}
      {events.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>Important dates</SectionHeader>
          <div className="space-y-4">
            {events.map((e, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-gray-900">{e.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[e.date, e.time, e.location].filter(Boolean).join(' · ')}
                </p>
                <Snippet text={e.source_snippet} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Things to bring */}
      {things.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>Bring / sign / pay</SectionHeader>
          <div className="space-y-3">
            {things.map((t, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-gray-900">{t.item}</p>
                {t.date_needed && (
                  <p className="text-xs text-gray-500 mt-0.5">Needed: {t.date_needed}</p>
                )}
                <Snippet text={t.source_snippet} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags */}
      {flagsObj.flags.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>Flags</SectionHeader>
          <ul className="space-y-1">
            {flagsObj.flags.map((f, i) => (
              <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                <span className="text-amber-400 shrink-0">⚑</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ambiguities */}
      {flagsObj.ambiguities.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-5 mb-4">
          <SectionHeader>Unclear / ambiguous</SectionHeader>
          <ul className="space-y-1">
            {flagsObj.ambiguities.map((a, i) => (
              <li key={i} className="text-sm text-gray-500 flex items-start gap-2">
                <span className="shrink-0">?</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No parsed content */}
      {actions.length === 0 && events.length === 0 && things.length === 0 && summary.length === 0 && (
        <div className="bg-white rounded-2xl shadow-sm px-5 py-8 text-center text-sm text-gray-400">
          {note.parse_status === 'failed'
            ? 'This note could not be processed. Try pasting the text manually.'
            : 'No dates or actions were found in this note.'}
        </div>
      )}

      {/* Original email text — trust mechanism */}
      {note.raw_text && (
        <details className="bg-white rounded-2xl shadow-sm px-5 py-4 mb-4 group">
          <summary className="text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-pointer select-none list-none flex items-center justify-between">
            Show original email text
            <span className="text-gray-300 group-open:rotate-180 transition-transform">▾</span>
          </summary>
          <pre className="mt-4 text-xs text-gray-500 whitespace-pre-wrap font-sans leading-relaxed border-t border-gray-100 pt-4">
            {note.raw_text}
          </pre>
        </details>
      )}
    </div>
  );
}
