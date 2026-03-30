/**
 * Global app footer with links to Privacy Policy and Terms of Service.
 */
import { Link } from 'react-router-dom';

export function AppFooter() {
  return (
    <footer className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 py-4 mt-auto">
      <div dir="ltr" className="max-w-3xl mx-auto px-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-400 dark:text-gray-500">
        <span>&copy; Expense Management</span>
        <span aria-hidden="true">&middot;</span>
        <Link
          to="/privacy"
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          Privacy Policy
        </Link>
        <span aria-hidden="true">&middot;</span>
        <Link
          to="/terms"
          className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
