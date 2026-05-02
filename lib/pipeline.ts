import { createServiceClient } from '@/lib/supabase';
import { extractFromEmail } from '@/lib/claude';
import { parseToISODate } from '@/lib/date-parser';
import type { Extraction } from '@/lib/schema';

export interface PipelineInput {
  rawText: string;
  subject?: string;
  senderEmail?: string;
  userId?: string;
  sourceType?: 'email' | 'paste';
}

export interface PipelineResult {
  success: boolean;
  noteId?: string;
  extraction?: Extraction;
  upcomingDatesCount?: number;
  error?: string;
}

type UpcomingDateInsert = {
  user_id: string | null;
  note_id: string;
  child_id: null;
  title: string;
  iso_date: string | null;
  display_date: string;
  time: string | null;
  location: string | null;
  source_label: string;
  source_snippet: string | null;
  item_type: 'event' | 'action' | 'bring';
};

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const supabase = createServiceClient();
  const today = new Date();
  // Use local date parts — toISOString() gives UTC, which is yesterday in AU timezones
  const todayStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  // 1. Create note record in pending state
  const { data: note, error: noteInsertError } = await supabase
    .from('notes')
    .insert({
      user_id: input.userId ?? null,
      source_type: input.sourceType ?? 'email',
      raw_text: input.rawText,
      subject: input.subject ?? null,
      sender_email: input.senderEmail ?? null,
      parse_status: 'processing',
    })
    .select('id')
    .single();

  if (noteInsertError || !note) {
    return { success: false, error: `DB insert failed: ${noteInsertError?.message}` };
  }

  // 2. Call Claude (one retry on failure)
  let extraction: Extraction | null = null;
  let lastError: string = '';

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
    await supabase.from('notes').update({ parse_status: 'failed' }).eq('id', note.id);
    return { success: false, noteId: note.id, error: `Extraction failed: ${lastError}` };
  }

  // 3. Decide parse_status
  const hasContent =
    extraction.action_items.length > 0 ||
    extraction.events.length > 0 ||
    extraction.payments_or_forms.length > 0;

  // 4. Persist extraction to notes row
  await supabase
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

  // 5. Build upcoming_dates rows from events, action items, and payments
  const datesToInsert: UpcomingDateInsert[] = [];
  const userId = input.userId ?? null;

  for (const event of extraction.events) {
    datesToInsert.push({
      user_id: userId,
      note_id: note.id,
      child_id: null,
      title: event.name,
      iso_date: parseToISODate(event.date, today),
      display_date: event.date,
      time: event.time || null,
      location: event.location || null,
      source_label: event.name,
      source_snippet: event.source_snippet || null,
      item_type: 'event',
    });
  }

  for (const action of extraction.action_items) {
    if (!action.due_date) continue;
    datesToInsert.push({
      user_id: userId,
      note_id: note.id,
      child_id: null,
      title: action.task,
      iso_date: parseToISODate(action.due_date, today),
      display_date: action.due_date,
      time: null,
      location: null,
      source_label: action.task,
      source_snippet: action.source_snippet || null,
      item_type: 'action',
    });
  }

  for (const payment of extraction.payments_or_forms) {
    if (!payment.due_date) continue;
    const amount = payment.amount.replace(/^\$/, '');
    const title = amount ? `${payment.item} ($${amount})` : payment.item;
    datesToInsert.push({
      user_id: userId,
      note_id: note.id,
      child_id: null,
      title,
      iso_date: parseToISODate(payment.due_date, today),
      display_date: payment.due_date,
      time: null,
      location: null,
      source_label: payment.item,
      source_snippet: payment.source_snippet || null,
      item_type: 'action',
    });
  }

  for (const bring of extraction.things_to_bring) {
    if (!bring.item) continue; // skip if Claude returned an empty item
    datesToInsert.push({
      user_id: userId,
      note_id: note.id,
      child_id: null,
      title: bring.item,
      iso_date: parseToISODate(bring.date_needed, today),
      display_date: bring.date_needed,
      time: null,
      location: null,
      source_label: bring.item,
      source_snippet: bring.source_snippet || null,
      item_type: 'bring',
    });
  }

  let upcomingDatesCount = 0;
  if (datesToInsert.length > 0) {
    const { data: inserted } = await supabase
      .from('upcoming_dates')
      .insert(datesToInsert)
      .select('id');
    upcomingDatesCount = inserted?.length ?? 0;
  }

  return { success: true, noteId: note.id, extraction, upcomingDatesCount };
}
