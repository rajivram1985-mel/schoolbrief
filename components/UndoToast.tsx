'use client';

import { useEffect } from 'react';

type UndoToastProps = {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  durationMs?: number;
};

export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  durationMs = 4000,
}: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
      <div className="flex items-center justify-between bg-gray-900 text-white rounded-xl px-4 py-3 shadow-lg">
        <span className="text-sm">{message}</span>
        <button
          onClick={onUndo}
          className="ml-4 text-sm font-semibold shrink-0 hover:opacity-80 transition-opacity"
          style={{ color: '#6EE7B7' }}
        >
          Undo
        </button>
      </div>
    </div>
  );
}
