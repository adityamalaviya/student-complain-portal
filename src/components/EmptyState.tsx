import React from 'react';
import Link from 'next/link';
import { Tray, Plus } from '@phosphor-icons/react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionHref?: string;
  actionText?: string;
  onActionClick?: () => void;
}

export function EmptyState({
  title = 'No complaints found',
  description = 'There are no complaints matching your current filters or in this feed right now.',
  actionHref,
  actionText,
  onActionClick,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center sm:p-14 dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Tray size={26} weight="duotone" />
      </div>
      <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>

      {actionHref && actionText && (
        <div className="mt-5">
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 active:scale-[0.99] dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus size={14} weight="bold" />
            <span>{actionText}</span>
          </Link>
        </div>
      )}

      {!actionHref && actionText && onActionClick && (
        <div className="mt-5">
          <button
            type="button"
            onClick={onActionClick}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {actionText}
          </button>
        </div>
      )}
    </div>
  );
}
