import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Note = {
  id: string;
  subject: string | null;
  sender_email: string | null;
  parse_status: string;
  source_type: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  empty: 'bg-gray-100 text-gray-600',
  gmail_verification: 'bg-purple-100 text-purple-800',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {status}
    </span>
  );
}

async function getStats(): Promise<{
  notesCount: number;
  datesCount: number;
  recentNotes: Note[];
  error: string | null;
}> {
  try {
    const supabase = createServiceClient();

    const [notesResult, datesResult, recentResult] = await Promise.all([
      supabase.from('notes').select('*', { count: 'exact', head: true }),
      supabase
        .from('upcoming_dates')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null),
      supabase
        .from('notes')
        .select('id, subject, sender_email, parse_status, source_type, created_at')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    return {
      notesCount: notesResult.count ?? 0,
      datesCount: datesResult.count ?? 0,
      recentNotes: (recentResult.data ?? []) as Note[],
      error: null,
    };
  } catch (err) {
    return { notesCount: 0, datesCount: 0, recentNotes: [], error: String(err) };
  }
}

export default async function Home() {
  const { notesCount, datesCount, recentNotes, error } = await getStats();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SchoolBrief</h1>
          <p className="mt-1 text-sm text-gray-500">Email pipeline — Sprint 1 status</p>
        </div>

        {/* DB error banner */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <strong>Database error:</strong> {error}
            <p className="mt-1 text-red-600">
              Make sure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local
              and the schema has been applied.
            </p>
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="text-3xl font-bold text-gray-900">{notesCount}</div>
            <div className="mt-1 text-sm text-gray-500">Emails processed</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="text-3xl font-bold text-gray-900">{datesCount}</div>
            <div className="mt-1 text-sm text-gray-500">Upcoming dates saved</div>
          </div>
        </div>

        {/* Recent notes */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-700">Recent notes</h2>
          </div>

          {recentNotes.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No notes yet.{' '}
              <span className="font-medium text-gray-500">
                Forward a school email to your SchoolBrief address to get started.
              </span>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {recentNotes.map((note) => (
                <li key={note.id} className="flex items-center justify-between px-6 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {note.subject ?? '(no subject)'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {note.sender_email ?? 'unknown sender'}
                      {' · '}
                      {note.source_type}
                      {' · '}
                      {new Date(note.created_at).toLocaleString('en-AU', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0">
                    <StatusBadge status={note.parse_status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Test endpoint hint */}
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Test the pipeline
          </p>
          <p className="mt-2 text-sm text-gray-600">
            GET{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              /api/test-inbound?text=your+school+email+text
            </code>
          </p>
          <p className="mt-1 text-sm text-gray-600">
            POST{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              /api/test-inbound
            </code>{' '}
            with body{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              {'{"text":"..."}'}
            </code>{' '}
            for longer inputs.
          </p>
        </div>

      </div>
    </main>
  );
}
