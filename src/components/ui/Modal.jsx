import { useEffect, useId } from 'react';
import { acquireBodyScrollLock } from './bodyScrollLock';

export function Modal({ isOpen, onClose, title, children }) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    return acquireBodyScrollLock();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex min-w-0 items-start justify-center overflow-hidden p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl box-border dark:bg-gray-900 dark:shadow-black/60 sm:max-h-[calc(100dvh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800 sm:px-6">
          <h2 id={titleId} className="min-w-0 break-words text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="סגור"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto overscroll-contain break-words px-4 py-5 sm:px-6 [&_*]:min-w-0 [&_button]:shrink-0">
          {children}
        </div>
      </div>
    </div>
  );
}
