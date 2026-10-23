import React from 'react';
import { WarningCircle, ArrowClockwise } from '@phosphor-icons/react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Unable to load content',
  message,
  onRetry,
}: ErrorStateProps): React.ReactElement {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50/50 p-6 text-center dark:border-red-900/60 dark:bg-red-950/20">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
        <WarningCircle size={22} weight="bold" />
      </div>
      <h3 className="text-sm font-bold text-red-900 dark:text-red-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-red-700 dark:text-red-300">{message}</p>

      {onRetry && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-slate-800"
          >
            <ArrowClockwise size={14} weight="bold" />
            <span>Try Again</span>
          </button>
        </div>
      )}
    </div>
  );
}
