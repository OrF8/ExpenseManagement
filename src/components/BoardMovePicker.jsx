import { useMemo, useState } from 'react';
import { ancestorPath, canReparent, indexHierarchy, parentOf } from '../../functions/shared/hierarchy.mjs';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';

/** Browse destinations one level at a time; entering a board never moves it. */
export function BoardMovePicker({ board, boards, uid, loading, error, moving, onMove }) {
  const [locationId, setLocationId] = useState(null);
  const ownedBoards = useMemo(() => boards.filter(b =>
    b.ownerUid === uid && b.memberUids?.includes(uid)), [boards, uid]);
  const hierarchy = useMemo(() => indexHierarchy(ownedBoards), [ownedBoards]);
  const canBrowse = id => canReparent(board.id, id, ownedBoards);
  // If access or structure changes while browsing, safely return to the root.
  const currentId = locationId && canBrowse(locationId) ? locationId : null;
  const { path } = ancestorPath(currentId, ownedBoards);
  const children = (hierarchy.children.get(currentId) ?? []).filter(b => canBrowse(b.id));
  const blocked = loading || !!error || moving || board.deleting || board.ownerUid !== uid;
  const ancestors = path.slice(0, -1);
  const ancestorButtons = ancestors.map(b => (
    <li key={b.id} className="min-w-0">
      <button type="button" disabled={blocked} onClick={() => setLocationId(b.id)}
        className="w-full break-words py-2 text-start text-indigo-700 dark:text-indigo-300 disabled:opacity-50">
        {b.title}
      </button>
    </li>
  ));

  return <div className="min-w-0 space-y-4">
    <p className="text-sm text-gray-500 dark:text-gray-400">פתח לוח כדי לעיין בלוחות המשנה שלו, ולאחר מכן בחר ״העבר לכאן״.</p>
    <nav aria-label="מיקום יעד ההעברה" className="min-w-0 rounded-xl bg-gray-50 p-3 text-sm dark:bg-gray-800">
      <button type="button" disabled={blocked} onClick={() => setLocationId(null)}
        aria-current={currentId === null ? 'location' : undefined}
        className="py-2 text-indigo-700 dark:text-indigo-300 disabled:opacity-50">הרמה הראשית</button>
      {ancestors.length > 2 ? <details key={currentId}>
        <summary className="cursor-pointer py-2 dark:text-gray-200">נתיב היעד · {ancestors.length} לוחות קודמים</summary>
        <ol className="max-h-40 overflow-y-auto">{ancestorButtons}</ol>
      </details> : <ol>{ancestorButtons}</ol>}
      {currentId && <p aria-current="location" className="break-words py-2 font-semibold dark:text-gray-100">{path.at(-1)?.title}</p>}
    </nav>
    <div className="flex flex-wrap gap-2">
      {currentId && <>
        <Button type="button" variant="secondary" disabled={blocked}
          onClick={() => setLocationId(parentOf(hierarchy.byId.get(currentId)))}>למעלה</Button>
        <Button type="button" loading={moving} disabled={blocked || parentOf(board) === currentId}
          onClick={() => onMove(currentId)}>העבר לכאן</Button>
      </>}
      <Button type="button" variant="secondary" disabled={blocked || parentOf(board) === null}
        onClick={() => onMove(null)}>העבר לרמה הראשית</Button>
    </div>
    {loading ? <Spinner /> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : <>
      <p className="text-xs text-gray-500 dark:text-gray-400">לוחות זמינים במיקום זה</p>
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {children.map(child => <li key={child.id}>
          <button type="button" disabled={blocked} onClick={() => setLocationId(child.id)}
            aria-label={`פתח את ${child.title}`}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-start text-sm font-medium text-gray-900 hover:bg-indigo-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
            <span className="break-words">{child.title}</span>
            <span aria-hidden="true" className="shrink-0">←</span>
          </button>
        </li>)}
      </ul>
      {children.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">אין לוחות יעד נוספים במיקום זה.</p>}
    </>}
  </div>;
}
