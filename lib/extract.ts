import { createServiceClient } from '@/lib/supabase';
import { extractFromEmail } from '@/lib/claude';
import type { Extraction } from '@/lib/schema';

export type ExtractResult =
  | { success: true; noteId: string; extraction: Extraction }
  | { success: false; error: string; noteId?: string };

/**
 * Runs Claude extraction and saves the note to the DB.
 * Does NOT write to upcoming_dates — caller decides what to save.
 * Used by the manual paste flow (/api/parse).
 */
export async function extractAndSaveNote(input: {
  rawText: string;
  subject?: string;
  userId: string;
  sourceType: 'paste';
}): Promise<ExtractResult> {
  const db = createServiceClient();
  const today = new Date();
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const { data: note, error: noteErr } = await db
    .from('notes')
    .insert({
      user_id: input.userId,
      source_type: input.sourceType,
      raw_text: input.rawText,
      subject: input.subject ?? null,
      parse_status: 'processing',
    })
    .select('id')
    .single();

  if (noteErr || !note) {
    return { success: false, error: `DB insert failed: ${noteErr?.message}` };
  }

  let extraction: Extraction | null = null;
  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      extraction = await extractFromEmail(input.rawText, todayStr);
      break;
    } catch (err) {
      lastError = String(err);
      if (attempt < 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!extraction) {
    await db.from('notes').update({ parse_status: 'failed' }).eq('id', note.id);
    return { success: false, error: lastError, noteId: note.id };
  }

  const hasContent =
    extraction.action_items.length > 0 ||
    extraction.events.length > 0 ||
    extraction.payments_or_forms.length > 0;

  await db
    .from('notes')
    .update({
      parsed_title: extraction.title,
      parsed_type: extraction.communication_type,
      parsed_summary_json: extraction.summary,
      parsed_actions_json: extraction.action_items,
      parsed_events_json: extraction.events,
      parsed_items_json: extraction.things_to_bring,
      parsed_flags_json: { flags: extraction.flags, ambiguities: extraction.ambiguities },
      parse_status: hasContent ? 'success' : 'empty',
    })
    .eq('id', note.id);

  return { success: true, noteId: note.id, extraction };
}
