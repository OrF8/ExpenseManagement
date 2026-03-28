import { useId } from 'react';

export function Input({ label, error, className = '', ...props }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
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
          ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-200' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
