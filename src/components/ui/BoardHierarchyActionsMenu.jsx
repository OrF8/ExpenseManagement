import { useEffect, useRef, useState } from 'react';

/**
 * BoardHierarchyActionsMenu – a compact dropdown trigger that exposes
 * the two board-hierarchy actions:
 *   • הוסף לוח-משנה  (Add sub-board)
 *   • העבר תחת לוח   (Move under board)
 *
 * Only the options whose conditions are met are rendered, so the caller
 * still passes the same guards it had before.
 *
 * Props:
 *   canAddSubBoard  – whether to show "הוסף לוח-משנה"
 *   canMoveUnder    – whether to show "העבר תחת לוח"
 *   onAddSubBoard   – handler for "הוסף לוח-משנה"
 *   onMoveUnder     – handler for "העבר תחת לוח"
 */
export function BoardHierarchyActionsMenu({
  canAddSubBoard,
  canMoveUnder,
  onAddSubBoard,
  onMoveUnder,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (!canAddSubBoard && !canMoveUnder) return null;

  function handleAction(handler) {
    setOpen(false);
    handler();
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="
          inline-flex items-center justify-center gap-1
          rounded-lg font-medium transition-colors
          focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400
          bg-white text-gray-700 border border-gray-300 hover:bg-gray-50
          dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-700
          px-2 py-1.5 text-xs
          sm:px-3 sm:py-1.5 sm:text-sm
        "
      >
        {/* chevron-down icon */}
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="hidden sm:inline">פעולות לוח</span>
        <span className="sm:hidden">פעולות</span>
      </button>

      {/* Dropdown menu */}
      {open && (
        <div
          role="menu"
          aria-label="פעולות לוח"
          className="
            absolute z-50 mt-1
            min-w-max rounded-lg shadow-lg border
            bg-white dark:bg-gray-800
            border-gray-200 dark:border-gray-700
            py-1 text-sm
            end-0
          "
        >
          {canAddSubBoard && (
            <button
              role="menuitem"
              type="button"
              onClick={() => handleAction(onAddSubBoard)}
              className="
                w-full flex items-center gap-2
                px-4 py-2
                text-gray-700 dark:text-gray-200
                hover:bg-gray-50 dark:hover:bg-gray-700
                transition-colors text-start
              "
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              הוסף לוח-משנה
            </button>
          )}
          {canMoveUnder && (
            <button
              role="menuitem"
              type="button"
              onClick={() => handleAction(onMoveUnder)}
              className="
                w-full flex items-center gap-2
                px-4 py-2
                text-gray-700 dark:text-gray-200
                hover:bg-gray-50 dark:hover:bg-gray-700
                transition-colors text-start
              "
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h12" />
              </svg>
              העבר תחת לוח
            </button>
          )}
        </div>
      )}
    </div>
  );
}
