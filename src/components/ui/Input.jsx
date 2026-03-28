import { useId } from 'react';

export function Input({ label, error, className = '', ...props }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`
          block w-full rounded-lg border border-gray-200 bg-white
          px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400
          focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200
          disabled:bg-gray-50 disabled:text-gray-500
          dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500
          dark:focus:border-indigo-500 dark:focus:ring-indigo-900
          dark:disabled:bg-gray-900 dark:disabled:text-gray-600
          ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-600 dark:focus:border-red-500 dark:focus:ring-red-900' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-500 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
