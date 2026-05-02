import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const TYPE_STYLES: Record<string, string> = {
  excursion:      'bg-blue-50 text-blue-700',
  newsletter:     'bg-purple-50 text-purple-700',
  reminder:       'bg-yellow-50 text-yellow-700',
  payment:        'bg-green-50 text-green-700',
  event:          'bg-teal-50 text-teal-700',
  uniform:        'bg-orange-50 text-orange-700',
  'general update': 'bg-gray-100 text-gray-600',
  other:          'bg-gray-100 text-gray-500',
};

const STATUS_STYLES: Record<string, string> = {
  success:           'bg-green-100 text-green-700',
  failed:            'bg-red-100 text-red-600',
  empty:             'bg-gray-100 text-gray-500',
  processing:        'bg-blue-100 text-blue-600',
  pending:           'bg-yellow-100 text-yellow-700',
  gmail_verification: 'bg-purple-100 text-purple-700',
};

type NoteRow = {
  id: string;
  subject: string | null;
  parsed_title: string | null;
  parsed_type: string | null;
  parse_status: string;
  source_type: string;
  created_at: string;
};

export default async function NotesPage() {
  const supabase = createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = createServiceClient();
  const { data } = await db
    .from('notes')
    .select('id, subject, parsed_title, parsed_type, parse_status, source_type, created_at')
    .eq('user_id', user.id)
    .neq('parse_status', 'gmail_verification')
    .order('created_at', { ascending: false });

  const notes = (data ?? []) as NoteRow[];

  return (
    <div className="px-4 pt-4 pb-24">
      {notes.length === 0 ? (
        <div className="pt-16 text-center">
          <p className="text-2xl mb-3">📋</p>
          <p className="text-sm text-gray-500">
            No notes yet. Forward a school email to get started.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
          {notes.map((note) => {
            const title = note.parsed_title ?? note.subject ?? '(no subject)';
            const typeStyle = TYPE_STYLES[note.parsed_type ?? ''] ?? TYPE_STYLES.other;
            const statusStyle = STATUS_STYLES[note.parse_status] ?? 'bg-gray-100 text-gray-500';
            const received = new Date(note.created_at).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{received}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {note.parsed_type && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeStyle}`}>
                      {note.parsed_type}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
                    {note.parse_status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
