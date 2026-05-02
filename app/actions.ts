'use server';

import { redirect } from 'next/navigation';
import { createAuthClient } from '@/lib/supabase-auth';
import { createServiceClient } from '@/lib/supabase';

async function getAuthUserId(): Promise<string | null> {
  const supabase = createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function signOut() {
  const supabase = createAuthClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// ── Upcoming dates ────────────────────────────────────────────────────────────

export async function deleteUpcomingDate(id: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db
    .from('upcoming_dates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  return { error: error?.message };
}

export async function undoDeleteUpcomingDate(id: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db
    .from('upcoming_dates')
    .update({ deleted_at: null })
    .eq('id', id)
    .eq('user_id', userId);
  return { error: error?.message };
}

export async function updateDateTitle(id: string, title: string): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const trimmed = title.trim();
  if (!trimmed) return { error: 'Title cannot be empty' };
  if (trimmed.length > 200) return { error: 'Title must be 200 characters or less' };
  const db = createServiceClient();
  const { error } = await db
    .from('upcoming_dates')
    .update({ title: trimmed })
    .eq('id', id)
    .eq('user_id', userId);
  return { error: error?.message };
}

// ── Paste flow ────────────────────────────────────────────────────────────────

type UpcomingDatePayload = {
  title: string;
  iso_date: string | null;
  display_date: string;
  time: string | null;
  location: string | null;
  source_label: string;
  source_snippet: string | null;
  item_type: 'event' | 'action' | 'bring';
};

export async function savePasteDatesToUpcoming(input: {
  noteId: string;
  childId: string | null;
  dates: UpcomingDatePayload[];
}): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  if (input.dates.length === 0) return {};

  const db = createServiceClient();
  const rows = input.dates.map((d) => ({
    user_id: userId,
    note_id: input.noteId,
    child_id: input.childId,
    ...d,
  }));

  const { error } = await db.from('upcoming_dates').insert(rows);
  return { error: error?.message };
}

// ── Onboarding ────────────────────────────────────────────────────────────────

export async function saveChildren(
  children: Array<{ name: string; school_name: string }>
): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };

  const rows = children
    .filter((c) => c.name.trim())
    .map((c) => ({
      user_id: userId,
      name: c.name.trim().slice(0, 100),
      school_name: c.school_name.trim().slice(0, 200) || null,
    }));

  if (rows.length === 0) return {};

  const db = createServiceClient();
  // ignoreDuplicates prevents double-inserts if onboarding is re-run
  const { error } = await db.from('children').upsert(rows, {
    onConflict: 'user_id,name',
    ignoreDuplicates: true,
  });
  return { error: error?.message };
}

export async function completeOnboarding(): Promise<{ error?: string }> {
  const userId = await getAuthUserId();
  if (!userId) return { error: 'Unauthorized' };
  const db = createServiceClient();
  const { error } = await db
    .from('users')
    .update({ onboarding_completed: true })
    .eq('id', userId);
  return { error: error?.message };
}
