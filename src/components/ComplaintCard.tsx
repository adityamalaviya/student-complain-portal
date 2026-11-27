'use client';

import React from 'react';
import Link from 'next/link';
import { MapPin } from '@phosphor-icons/react';
import { resolveDepartment } from '@/lib/utils';
import type { Complaint } from '@/types';
import { ComplaintStatusBadge } from './ComplaintStatusBadge';
import { ComplaintPriorityBadge } from './ComplaintPriorityBadge';
import { ComplaintSupportButton } from './ComplaintSupportButton';
import { DepartmentBadge } from './DepartmentBadge';

interface ComplaintCardProps {
  complaint: Complaint;
  hasSupported?: boolean;
  onSupport?: (complaintId: string) => Promise<void> | void;
  showAdminActions?: boolean;
  onAdminUpdate?: (complaint: Complaint) => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
  } catch {
    return 'Recently';
  }
}

export function ComplaintCard({
  complaint,
  hasSupported = false,
  onSupport,
  showAdminActions = false,
  onAdminUpdate,
}: ComplaintCardProps): React.ReactElement {
  const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
  const maintDept = resolveDepartment(complaint.maintenance_department_id);
  const isOwnComplaint = Boolean(complaint.is_own_complaint);

  return (
    <article className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      {/* Header: Maintenance Department, Status, Priority & ID */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DepartmentBadge
            departmentId={maintDept?.id ?? complaint.maintenance_department_id}
            name={maintDept?.name || complaint.department_name}
            size="sm"
          />
          <ComplaintStatusBadge status={complaint.status} />
          {complaint.priority !== 'low' && (
            <ComplaintPriorityBadge priority={complaint.priority} />
          )}
        </div>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
          #CV-{shortId}
        </span>
      </div>

      {/* Title & Location */}
      <div className="mb-2">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 transition group-hover:text-blue-700 sm:text-lg dark:text-white dark:group-hover:text-blue-400">
          <Link href={`/complaints/${complaint.$id}`} className="hover:underline">
            {complaint.title}
          </Link>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <MapPin size={14} className="shrink-0 text-slate-400 dark:text-slate-500" />
          <span>{complaint.location}</span>
        </p>
      </div>

      {/* Description Snippet */}
      <p className="mb-4 line-clamp-2 text-xs leading-relaxed text-slate-600 sm:text-sm dark:text-slate-300">
        {complaint.description}
      </p>

      {/* Admin Official Response (if present) */}
      {complaint.official_response && (
        <div className="mb-5 rounded-r-xl border-l-2 border-blue-700 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-700 sm:text-sm dark:border-blue-500 dark:bg-slate-800/70 dark:text-slate-300">
          <span className="mr-1.5 font-bold text-slate-900 dark:text-white">Admin Response:</span>
          <span>{complaint.official_response}</span>
        </div>
      )}

      {/* Card Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Reported {formatRelativeTime(complaint.$createdAt || complaint.created_at)}
        </span>

        {showAdminActions ? (
          <button
            type="button"
            onClick={() => onAdminUpdate?.(complaint)}
            className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-2xs transition hover:border-blue-700 hover:text-blue-700 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            Resolve / Update
          </button>
        ) : (
          <ComplaintSupportButton
            complaintId={complaint.$id}
            supportCount={complaint.support_count ?? 1}
            hasSupported={isOwnComplaint ? false : hasSupported}
            onToggleSupport={onSupport}
            disabled={isOwnComplaint}
            disabledReason={isOwnComplaint ? 'Creator baseline support cannot be removed' : undefined}
            variant="card"
          />
        )}
      </div>
    </article>
  );
}
