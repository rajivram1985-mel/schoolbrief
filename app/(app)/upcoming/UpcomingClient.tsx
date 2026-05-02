'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { UpcomingDateRow } from './page';
import BottomSheet from '@/components/BottomSheet';
import UndoToast from '@/components/UndoToast';
import { deleteUpcomingDate, undoDeleteUpcomingDate } from '@/app/actions';

// ── Helpers ──────────────────────────────────────────────────────────────────

function localTodayStr(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

function isToday(iso: string) { return iso === localTodayStr(); }
function isPast(iso: string)  { return iso < localTodayStr(); }
function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000;
}

function parseDayMonth(iso: string): { day: string; month: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return {
    day: String(d),
    month: date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase(),
  };
}

type MonthGroup = { key: string; isoMonth: string; items: UpcomingDateRow[] };

function groupByMonth(items: UpcomingDateRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  const unknown: UpcomingDateRow[] = [];

  for (const item of items) {
    if (!item.iso_date) { unknown.push(item); continue; }
    const [y, m] = item.iso_date.split('-');
    const key = `${y}-${m}`;
    if (!map.has(key)) {
      const label = new Date(Number(y), Number(m) - 1, 1)
        .toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
        .toUpperCase();
      map.set(key, { key: label, isoMonth: key, items: [] });
    }
    map.get(key)!.items.push(item);
  }

  const groups = Array.from(map.values()).sort((a, b) => a.isoMonth.localeCompare(b.isoMonth));
  if (unknown.length > 0) groups.push({ key: 'TO SORT', isoMonth: 'zzzz', items: unknown });
  return groups;
}

function bubbleColor(item: UpcomingDateRow, today: boolean): string {
  if (today) return '#4A7C59';
  switch (item.item_type) {
    case 'event':  return '#2BA8A0';
    case 'action': return '#D97706';
    case 'bring':  return '#9CA3AF';
    default:       return '#9CA3AF';
  }
}

// ── Icons (16 px inline SVG) ─────────────────────────────────────────────────

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 7h14" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function CheckboxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M8 4.5v7M6 6.5c0-.8.9-1.5 2-1.5s2 .7 2 1.5S9.1 8 8 8s-2 .7-2 1.5S6.9 11 8 11s2-.7 2-1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M3 6h10l-1.2 7H4.2L3 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 6V4.5a2 2 0 014 0V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ItemIcon({ item }: { item: UpcomingDateRow }) {
  // Payment items are a subset of 'action' — detect by $ in title
  if (item.item_type === 'action' && item.title.includes('($')) return <DollarIcon />;
  switch (item.item_type) {
    case 'event':  return <CalendarIcon />;
    case 'action': return <CheckboxIcon />;
    case 'bring':  return <BagIcon />;
    default:       return <CalendarIcon />;
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function UpcomingClient({ items: initialItems }: { items: UpcomingDateRow[] }) {
  const [items, setItems] = useState(initialItems);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [toastItem, setToastItem] = useState<UpcomingDateRow | null>(null);
  const [selectedItem, setSelectedItem] = useState<UpcomingDateRow | null>(null);

  const visibleItems = items.filter((i) => !deletedIds.has(i.id));
  const groups = groupByMonth(visibleItems);

  function handleDelete(item: UpcomingDateRow) {
    setDeletedIds((prev) => { const n = new Set(prev); n.add(item.id); return n; });
    setToastItem(item);
    setSelectedItem(null);
    deleteUpcomingDate(item.id); // fire-and-forget; undo restores if needed
  }

  function handleUndo() {
    if (!toastItem) return;
    const id = toastItem.id;
    setDeletedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    undoDeleteUpcomingDate(id);
    setToastItem(null);
  }

  const handleDismissToast = useCallback(() => setToastItem(null), []);

  function handleTitleSaved(id: string, title: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
    setSelectedItem((prev) => (prev?.id === id ? { ...prev, title } : prev));
  }

  if (visibleItems.length === 0) {
    return (
      <div className="px-4 pt-16 text-center">
        <p className="text-2xl mb-3">📅</p>
        <p className="text-sm text-gray-500 leading-relaxed max-w-xs mx-auto mb-6">
          No upcoming dates yet. Forward a school email to your SchoolBrief address to get started.
        </p>
        <Link
          href="/paste"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold"
          style={{ backgroundColor: '#4A7C59' }}
        >
          <span>+</span> Paste a note to try it
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Floating paste button */}
      <Link
        href="/paste"
        className="fixed bottom-6 right-4 z-30 flex items-center gap-2 px-4 py-3 rounded-full text-white shadow-lg hover:opacity-90 transition-opacity"
        style={{ backgroundColor: '#4A7C59' }}
        aria-label="Paste a school note"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v12M2 8h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <span className="text-sm font-semibold">Paste note</span>
      </Link>

      <div className="px-4 pt-4 pb-24">
        {groups.map((group) => (
          <section key={group.isoMonth} className="mb-6">
            {/* Month header */}
            <h2 className="text-xs font-semibold tracking-widest text-gray-400 mb-2 px-1">
              {group.key}
            </h2>

            {/* Date rows */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
              {group.items.map((item) => (
                <DateRow
                  key={item.id}
                  item={item}
                  onTap={() => setSelectedItem(item)}
                  onDelete={() => handleDelete(item)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <BottomSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onDelete={handleDelete}
        onTitleSaved={handleTitleSaved}
      />

      {toastItem && (
        <UndoToast
          message="Date deleted"
          onUndo={handleUndo}
          onDismiss={handleDismissToast}
        />
      )}
    </>
  );
}

// ── Date row ─────────────────────────────────────────────────────────────────

function DateRow({
  item,
  onTap,
  onDelete,
}: {
  item: UpcomingDateRow;
  onTap: () => void;
  onDelete: () => void;
}) {
  const today = !!item.iso_date && isToday(item.iso_date);
  const past  = !!item.iso_date && isPast(item.iso_date);
  const fresh = isNew(item.created_at);
  const color = bubbleColor(item, today);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors select-none ${
        past ? 'opacity-40' : ''
      }`}
      onClick={onTap}
    >
      {/* Date bubble */}
      {item.iso_date ? (
        <DateBubble iso={item.iso_date} color={color} />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-xs text-gray-400 font-medium">?</span>
        </div>
      )}

      {/* Icon + text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-gray-400">
            <ItemIcon item={item} />
          </span>
          <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
          {fresh && (
            <span
              className="shrink-0 text-xs px-1.5 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: '#4A7C59', fontSize: '10px' }}
            >
              New
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {item.source_label && (
            <span className="text-xs text-gray-400 truncate">{item.source_label}</span>
          )}
          {item.children?.name && (
            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {item.children.name}
            </span>
          )}
        </div>
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
        aria-label="Delete"
      >
        ×
      </button>
    </div>
  );
}

function DateBubble({ iso, color }: { iso: string; color: string }) {
  const { day, month } = parseDayMonth(iso);
  return (
    <div
      className="w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0"
      style={{ backgroundColor: color }}
    >
      <span className="text-white font-bold leading-none" style={{ fontSize: '17px' }}>{day}</span>
      <span className="text-white leading-none mt-0.5" style={{ fontSize: '9px', opacity: 0.85 }}>
        {month}
      </span>
    </div>
  );
}
