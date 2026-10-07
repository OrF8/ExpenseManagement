import { Link } from 'react-router-dom';
/** Deep paths remain compact; every accessible ancestor is a real link. */
export function BoardBreadcrumbs({board, path, incomplete}) {
  const ancestors = <ol className="flex flex-col gap-2 py-2">{path.map(b => <li key={b.id}><Link className="block break-words text-indigo-700 dark:text-indigo-300" to={`/board/${b.id}`}>{b.title}</Link></li>)}</ol>;
  return <nav aria-label="מיקום הלוח" className="min-w-0 rounded-xl bg-white p-3 text-sm dark:bg-gray-900">
    <Link className="text-indigo-700 dark:text-indigo-300" to="/boards">הלוחות שלי</Link>
    {incomplete && <p className="text-gray-500">חלק מנתיב הלוח אינו זמין</p>}
    {path.length > 3 ? <details><summary className="cursor-pointer py-2">נתיב הלוח · {path.length} לוחות קודמים</summary><div className="max-h-60 overflow-y-auto">{ancestors}</div></details> : ancestors}
    <span aria-current="page" className="block break-words font-semibold dark:text-gray-100">{board?.title}</span>
  </nav>;
}
