import React from 'react';
import type { PriorityLevel } from '@/types';

interface ComplaintPriorityBadgeProps {
  priority: PriorityLevel;
  size?: 'sm' | 'md';
}

export function ComplaintPriorityBadge({
  priority,
  size = 'sm',
}: ComplaintPriorityBadgeProps): React.ReactElement {
  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (priority === 'high') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-rose-200/80 bg-rose-50 font-medium text-rose-700 dark:border-rose-800/80 dark:bg-rose-950/40 dark:text-rose-300 ${paddingClass}`}
      >
        High Priority
      </span>
    );
  }

  if (priority === 'medium') {
    return (
      <span
        className={`inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 font-medium text-amber-800 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-300 ${paddingClass}`}
      >
        Medium Priority
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border border-slate-200/80 bg-slate-100 font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 ${paddingClass}`}
    >
      Low Priority
    </span>
  );
}
