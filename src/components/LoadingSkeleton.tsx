import React from 'react';

interface LoadingSkeletonProps {
  count?: number;
}

export function LoadingSkeleton({ count = 3 }: LoadingSkeletonProps): React.ReactElement {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          {/* Header row */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-5 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Title */}
          <div className="mb-2 h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />

          {/* Location */}
          <div className="mb-4 h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />

          {/* Description */}
          <div className="mb-2 h-4 w-full rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mb-5 h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-8 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
