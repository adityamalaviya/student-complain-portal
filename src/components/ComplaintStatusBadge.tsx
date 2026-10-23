import React from 'react';
import type { ComplaintStatus } from '@/types';

interface ComplaintStatusBadgeProps {
  status: ComplaintStatus;
  size?: 'sm' | 'md';
}

export function ComplaintStatusBadge({
  status,
  size = 'sm',
}: ComplaintStatusBadgeProps): React.ReactElement {
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (status === 'resolved') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-300 ${paddingClass}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>Resolved</span>
      </span>
    );
  }

  if (status === 'in_progress') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-blue-100/80 bg-blue-50 font-medium text-blue-700 dark:border-blue-800/80 dark:bg-blue-950/40 dark:text-blue-300 ${paddingClass}`}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" />
        <span>In Progress</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 font-medium text-amber-700 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-300 ${paddingClass}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      <span>Pending</span>
    </span>
  );
}
