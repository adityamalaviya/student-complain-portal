import React from 'react';
import {
  Buildings,
  TerminalWindow,
  Lightning,
  Gear,
  Drop,
  Broom,
  CheckCircle,
} from '@phosphor-icons/react';
import { resolveDepartment } from '@/lib/utils';
import type { DepartmentId } from '@/types';

interface DepartmentBadgeProps {
  departmentId?: DepartmentId | string | null;
  name?: string;
  showVerified?: boolean;
  size?: 'sm' | 'md';
}

function renderDepartmentIcon(deptId: string | undefined, iconSize: number): React.ReactElement {
  switch (deptId) {
    case 'dept_comp':
      return <TerminalWindow size={iconSize} weight="bold" />;
    case 'dept_elec':
      return <Lightning size={iconSize} weight="bold" />;
    case 'dept_mech':
      return <Gear size={iconSize} weight="bold" />;
    case 'dept_water':
      return <Drop size={iconSize} weight="bold" />;
    case 'dept_sanit':
      return <Broom size={iconSize} weight="bold" />;
    case 'dept_civil':
    default:
      return <Buildings size={iconSize} weight="bold" />;
  }
}

export function DepartmentBadge({
  departmentId,
  name,
  showVerified = false,
  size = 'md',
}: DepartmentBadgeProps): React.ReactElement {
  const resolved = resolveDepartment(departmentId);
  const displayName =
    name ||
    resolved?.name ||
    (typeof departmentId === 'string' && departmentId
      ? departmentId.replace(/^dept_/, '').toUpperCase()
      : 'Institutional Department');

  const paddingClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300 ${paddingClass}`}
    >
      {renderDepartmentIcon(resolved?.id, iconSize)}
      <span>{displayName}</span>
      {showVerified && (
        <CheckCircle size={iconSize} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
      )}
    </div>
  );
}
