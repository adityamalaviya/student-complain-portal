import React from 'react';
import { Buildings, TerminalWindow, CheckCircle } from '@phosphor-icons/react';
import type { DepartmentCode } from '@/types';

interface DepartmentBadgeProps {
  code: DepartmentCode;
  name?: string;
  showVerified?: boolean;
  size?: 'sm' | 'md';
}

export function DepartmentBadge({
  code,
  name,
  showVerified = false,
  size = 'md',
}: DepartmentBadgeProps): React.ReactElement {
  const isComputer = code === '07';
  const displayName = name || (isComputer ? 'Computer Department' : 'Civil Department');

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 ${paddingClass}`}
    >
      {isComputer ? (
        <TerminalWindow size={iconSize} weight="bold" />
      ) : (
        <Buildings size={iconSize} weight="bold" />
      )}
      <span>{displayName}</span>
      {showVerified && (
        <CheckCircle size={iconSize} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
      )}
    </div>
  );
}
