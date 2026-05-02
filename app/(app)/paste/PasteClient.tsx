'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { parseToISODate } from '@/lib/date-parser';
import { savePasteDatesToUpcoming } from '@/app/actions';
import type { Extraction } from '@/lib/schema';

// ── Demo note ─────────────────────────────────────────────────────────────────

const DEMO_NOTE = `Dear Parents and Carers,

Year 3 students will attend the Melbourne Museum Excursion on Thursday 22 May 2026.

Students should arrive by 8:45am — buses depart at 9:00am. We return by approximately 3:15pm.

What to bring:
- Packed lunch and water bottle (no hot food)
- Sunscreen and a named hat
- Comfortable walking shoes

The cost is $28.00 per student. Please pay via the Compass Parent Portal by Friday 16 May 2026. Students who have not paid by this date may not be able to attend.

A permission form has been sent home. Please sign and return by Friday 16 May 2026.

Kind regards,
The Year 3 Team
Mount Waverley North Primary School`;

// ── Types ─────────────────────────────────────────────────────────────────────

type SaveableItem = {
  idx: number;
  title: string;
  iso_date: string | null;
  display_date: string;
  time: string | null;
  location: string | null;
  source_label: string;
  source_snippet: string | null;
  item_type: 'event' | 'action' | 'bring';
  checked: boolean;
};

function buildSaveableItems(extraction: Extraction): SaveableItem[] {
  const today = new Date();
  const items: SaveableItem[] = [];
  let idx = 0;

  for (const e of extraction.events) {
    items.push({
      idx: idx++,
      title: e.name,
      iso_date: parseToISODate(e.date, today),
      display_date: e.date,
      time: e.time || null,
      location: e.location || null,
      source_label: e.name,
      source_snippet: e.source_snippet || null,
      item_type: 'event',
      checked: true,
    });
  }

  for (const a of extraction.action_items) {
    if (!a.due_date) continue;
    items.push({
      idx: idx++,
      title: a.task,
      iso_date: parseToISODate(a.due_date, today),
      display_date: a.due_date,
      time: null,
      location: null,
      source_label: a.task,
      source_snippet: a.source_snippet || null,
      item_type: 'action',
      checked: true,
    });
  }

  for (const p of extraction.payments_or_forms) {
    if (!p.due_date) continue;
    const amount = p.amount.replace(/^\$/, '');
    items.push({
      idx: idx++,
      title: amount ? `${p.item} ($${amount})` : p.item,
      iso_date: parseToISODate(p.due_date, today),
      display_date: p.due_date,
      time: null,
      location: null,
      source_label: p.item,
      source_snippet: p.source_snippet || null,
      item_type: 'action',
      checked: true,
    });
  }

  for (const t of extraction.things_to_bring) {
    if (!t.item) continue;
    items.push({
      idx: idx++,
      title: t.item,
      iso_date: t.date_needed ? parseToISODate(t.date_needed, today) : null,
      display_date: t.date_needed || '',
      time: null,
      location: null,
      source_label: t.item,
      source_snippet: t.source_snippet || null,
      item_type: 'bring',
      checked: true,
    });
  }

  return items;
}

const PRIORITY_COLORS: Record<string, string> = {
  high:   'bg-red-50 text-red-600',
  medium: 'bg-amber-50 text-amber-700',
  low:    'bg-green-50 text-green-700',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PasteClient({
  children,
}: {
  children: { id: string; name: string }[];
}) {
  const router = useRouter();

  // Input state
  const [text, setText] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // View state: 'input' | 'loading' | 'result'
  const [view, setView] = useState<'input' | 'loading' | 'result'>('input');

  // Result state
  const [noteId, setNoteId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Save state
  const [saveItems, setSaveItems] = useState<SaveableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleProcess() {
    if (!text.trim()) return;
    setView('loading');
    setParseError(null);

    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setParseError(data.error ?? 'Something went wrong.');
        setView('input');
        return;
      }

      setNoteId(data.noteId);
      setExtraction(data.extraction);
      setSaveItems(buildSaveableItems(data.extraction));
      setView('result');
    } catch {
      setParseError('Could not reach the server. Please try again.');
      setView('input');
    }
  }

  async function handleSave() {
    if (!noteId || !extraction) return;
    setSaving(true);

    const selected = saveItems.filter((i) => i.checked);
    const { error } = await savePasteDatesToUpcoming({
      noteId,
      childId: selectedChildId,
      dates: selected.map(({ checked: _c, idx: _i, ...rest }) => rest),
    });

    setSaving(false);
    if (error) { setParseError(error); return; }

    setSaved(true);
    setTimeout(() => router.push('/upcoming'), 1500);
  }

  function toggleItem(idx: number) {
    setSaveItems((prev) =>
      prev.map((i) => (i.idx === idx ? { ...i, checked: !i.checked } : i))
    );
  }

  // ── Input view ──────────────────────────────────────────────────────────────
  if (view === 'input') {
    return (
      <div className="px-4 pt-4 pb-24">
        <Link href="/upcoming" className="inline-flex items-center gap-1 text-sm mb-6" style={{ color: '#4A7C59' }}>
          ← Upcoming
        </Link>

        <h1 className="text-xl font-bold mb-1" style={{ color: '#1a1a1a' }}>Paste a school note</h1>
        <p className="text-sm text-gray-500 mb-5">We&apos;ll extract what matters in seconds.</p>

        {parseError && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {parseError}
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={9}
          placeholder="Paste a Compass notification, newsletter, email, or any school message here..."
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4A7C59] mb-2"
        />

        <button
          type="button"
          onClick={() => setText(DEMO_NOTE)}
          className="text-xs mb-5 hover:underline"
          style={{ color: '#4A7C59' }}
        >
          Try a demo note
        </button>

        {children.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 mb-2">Which child is this for?</p>
            <div className="flex flex-wrap gap-2">
              <ChildPill label="Both" selected={selectedChildId === null} onClick={() => setSelectedChildId(null)} />
              {children.map((c) => (
                <ChildPill key={c.id} label={c.name} selected={selectedChildId === c.id} onClick={() => setSelectedChildId(c.id)} />
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleProcess}
          disabled={!text.trim()}
          className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#2BA8A0' }}
        >
          Process message
        </button>
      </div>
    );
  }

  // ── Loading view ────────────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-16 h-16 rounded-2xl mb-6 animate-pulse" style={{ backgroundColor: '#2BA8A0' }} />
        <p className="text-base font-medium text-gray-700">Reading your school note&hellip;</p>
        <p className="text-sm text-gray-400 mt-1">This takes a few seconds.</p>
      </div>
    );
  }

  // ── Result view ─────────────────────────────────────────────────────────────
  if (!extraction) return null;

  const summary    = extraction.summary;
  const actions    = extraction.action_items;
  const events     = extraction.events;
  const things     = extraction.things_to_bring;
  const flags      = extraction.flags;
  const ambigs     = extraction.ambiguities;

  return (
    <div className="px-4 pt-4 pb-24">
      <button onClick={() => { setView('input'); setExtraction(null); }} className="inline-flex items-center gap-1 text-sm mb-5" style={{ color: '#4A7C59' }}>
        ← Edit note
      </button>

      {/* Review notice */}
      <div className="mb-4 flex items-start gap-2 border border-dashed border-amber-300 rounded-xl px-4 py-3 bg-amber-50">
        <span className="text-amber-500 shrink-0">⚠</span>
        <p className="text-xs text-amber-700">
          <strong>Review before relying.</strong> AI extraction may miss details. Verify important dates against the original.
        </p>
      </div>

      {/* Title + type */}
      <div className="bg-white rounded-2xl shadow-sm px-5 py-4 mb-3">
        <h2 className="text-base font-bold mb-1" style={{ color: '#1a1a1a' }}>{extraction.title}</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize font-medium">
          {extraction.communication_type}
        </span>
      </div>

      {/* Summary */}
      {summary.length > 0 && (
        <Section title="Summary">
          <ul className="space-y-1.5">
            {summary.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Action items */}
      {actions.length > 0 && (
        <Section title="What you need to do">
          <div className="space-y-3">
            {actions.map((a, i) => (
              <div key={i}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{a.task}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[a.priority] ?? PRIORITY_COLORS.low}`}>
                    {a.priority}
                  </span>
                </div>
                {a.due_date && <p className="text-xs text-gray-500 mt-0.5">Due: {a.due_date}</p>}
                {a.applies_to && <p className="text-xs text-gray-400">For: {a.applies_to}</p>}
                <Snippet text={a.source_snippet} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Events */}
      {events.length > 0 && (
        <Section title="Important dates">
          <div className="space-y-3">
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
        </Section>
      )}

      {/* Things to bring */}
      {things.length > 0 && (
        <Section title="Bring / sign / pay">
          <div className="space-y-2">
            {things.map((t, i) => (
              <div key={i}>
                <p className="text-sm font-medium text-gray-900">{t.item}</p>
                {t.date_needed && <p className="text-xs text-gray-500 mt-0.5">Needed: {t.date_needed}</p>}
                <Snippet text={t.source_snippet} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Flags */}
      {flags.length > 0 && (
        <Section title="Flags">
          <div className="flex flex-wrap gap-2">
            {flags.map((f, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{f}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Ambiguities */}
      {ambigs.length > 0 && (
        <Section title="Needs confirmation">
          <div className="space-y-1">
            {ambigs.map((a, i) => (
              <p key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="shrink-0">?</span>{a}
              </p>
            ))}
          </div>
        </Section>
      )}

      {/* Save to Upcoming */}
      {saveItems.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#4A7C59] bg-[#EBF3EE] px-5 py-5">
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#2F4F38' }}>Save dates to Upcoming?</h3>
          <p className="text-xs text-gray-500 mb-4">Uncheck any you don&apos;t want to save.</p>

          <div className="space-y-2 mb-5">
            {saveItems.map((item) => (
              <label key={item.idx} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleItem(item.idx)}
                  className="mt-0.5 accent-[#4A7C59]"
                />
                <div>
                  <p className="text-sm text-gray-800">{item.title}</p>
                  {item.display_date && (
                    <p className="text-xs text-gray-500">{item.display_date}</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {children.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Tag to:</p>
              <div className="flex flex-wrap gap-2">
                <ChildPill label="Both" selected={selectedChildId === null} onClick={() => setSelectedChildId(null)} />
                {children.map((c) => (
                  <ChildPill key={c.id} label={c.name} selected={selectedChildId === c.id} onClick={() => setSelectedChildId(c.id)} />
                ))}
              </div>
            </div>
          )}

          {saved ? (
            <div className="text-center text-sm font-medium py-2" style={{ color: '#4A7C59' }}>
              ✓ Dates saved — going to Upcoming…
            </div>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || saveItems.every((i) => !i.checked)}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#4A7C59' }}
            >
              {saving ? 'Saving…' : 'Save selected dates'}
            </button>
          )}
        </div>
      )}

      <button
        onClick={() => { setView('input'); setExtraction(null); setText(''); setSaved(false); }}
        className="w-full mt-4 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Parse another note
      </button>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm px-5 py-4 mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Snippet({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="mt-1 text-xs text-gray-400 italic border-l-2 border-gray-200 pl-2">
      &ldquo;{text}&rdquo;
    </p>
  );
}

function ChildPill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
        selected
          ? 'border-[#4A7C59] text-white'
          : 'border-gray-200 text-gray-600 bg-white hover:border-gray-300'
      }`}
      style={selected ? { backgroundColor: '#4A7C59' } : undefined}
    >
      {label}
    </button>
  );
}
