'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { UpcomingDateRow } from '@/app/(app)/upcoming/page';
import { updateDateTitle } from '@/app/actions';

type BottomSheetProps = {
  item: UpcomingDateRow | null;
  onClose: () => void;
  onDelete: (item: UpcomingDateRow) => void;
  onTitleSaved: (id: string, title: string) => void;
};

function formatSheetDate(isoDate: string | null, displayDate: string | null): string {
  if (!isoDate) return displayDate ?? 'Date unknown';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatReceivedDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

export default function BottomSheet({
  item,
  onClose,
  onDelete,
  onTitleSaved,
}: BottomSheetProps) {
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Animate in when item appears
  useEffect(() => {
    if (item) {
      setVisible(false);
      setEditing(false);
      setEditValue(item.title);
      // Tiny delay lets the DOM paint before the transition starts
      requestAnimationFrame(() => setVisible(true));
    }
  }, [item]);

  // Lock body scroll while open
  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [item]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!item) return null;

  async function handleSave() {
    if (!item || !editValue.trim()) return;
    setSaving(true);
    const { error } = await updateDateTitle(item.id, editValue);
    setSaving(false);
    if (!error) {
      onTitleSaved(item.id, editValue.trim());
      setEditing(false);
    }
  }

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 250);
  }

  const noteOrigin = [
    item.source_label,
    item.notes ? `received ${formatReceivedDate(item.notes.created_at)}` : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="fixed inset-0 z-50" onClick={handleClose}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black transition-opacity duration-250"
        style={{ opacity: visible ? 0.4 : 0 }}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto transition-transform duration-250 ease-out"
        style={{ transform: visible ? 'translateY(0)' : 'translateY(100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-6 pt-4 pb-10">
          {/* Title */}
          {editing ? (
            <div className="mb-1">
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full text-lg font-semibold border-b-2 border-[#4A7C59] pb-1 focus:outline-none bg-transparent"
                style={{ color: '#1a1a1a' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setEditing(false);
                }}
              />
              <div className="flex gap-3 mt-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm font-semibold px-4 py-1.5 rounded-lg text-white disabled:opacity-50"
                  style={{ backgroundColor: '#4A7C59' }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-sm text-gray-500 px-4 py-1.5"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <h2 className="text-lg font-semibold mb-1" style={{ color: '#1a1a1a' }}>
              {item.title}
            </h2>
          )}

          {/* Date */}
          <p className="text-sm text-gray-500 mb-5">
            {formatSheetDate(item.iso_date, item.display_date)}
            {item.time ? ` · ${item.time}` : ''}
            {item.location ? ` · ${item.location}` : ''}
          </p>

          {/* Source snippet */}
          {item.source_snippet && (
            <div className="mb-5 border-l-4 border-gray-200 pl-4">
              <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide font-medium">
                From the original email
              </p>
              <p className="text-sm text-gray-600 italic">&ldquo;{item.source_snippet}&rdquo;</p>
            </div>
          )}

          {/* Note origin */}
          {noteOrigin && (
            <p className="text-xs text-gray-400 mb-6">{noteOrigin}</p>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="w-full text-left text-sm font-medium text-gray-700 border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                Edit title
              </button>
            )}

            {item.note_id && (
              <Link
                href={`/notes/${item.note_id}`}
                onClick={handleClose}
                className="block text-sm font-medium text-center rounded-xl px-4 py-3 border border-gray-200 hover:bg-gray-50 transition-colors"
                style={{ color: '#4A7C59' }}
              >
                View full note →
              </Link>
            )}

            <button
              onClick={() => { onDelete(item); handleClose(); }}
              className="w-full text-sm font-medium text-red-500 border border-red-100 rounded-xl px-4 py-3 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
