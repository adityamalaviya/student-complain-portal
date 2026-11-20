'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import {
  CircleNotch,
  Clock,
  WarningCircle,
  CheckCircle,
  Funnel,
  ArrowRight,
} from '@phosphor-icons/react';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  DepartmentBadge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components';
import { resolveDepartment } from '@/lib/utils';
import type { PrincipalDashboardData, DepartmentId } from '@/types';

const CANONICAL_DEPARTMENTS: readonly DepartmentId[] = [
  'dept_comp',
  'dept_civil',
  'dept_elec',
  'dept_mech',
  'dept_water',
  'dept_sanit',
];

function formatTimestamp(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

export interface PrincipalGrievanceOverviewTabProps {
  dashboardData: PrincipalDashboardData | null;
  isLoading: boolean;
  error: string | null;
  departmentFilter: string;
  onDepartmentFilterChange: (deptId: string) => void;
  onRetry: () => void;
  onIssueWarning: (complaint: {
    id: string;
    title: string;
    departmentName: string;
    daysDelayed: number;
  }) => void;
}

export function PrincipalGrievanceOverviewTab({
  dashboardData,
  isLoading,
  error,
  departmentFilter,
  onDepartmentFilterChange,
  onRetry,
  onIssueWarning,
}: PrincipalGrievanceOverviewTabProps): React.ReactElement {
  const filteredComplaints = useMemo(() => {
    if (!dashboardData?.recent_complaints) return [];
    if (departmentFilter === 'all') return dashboardData.recent_complaints;
    return dashboardData.recent_complaints.filter(
      (c) =>
        c.maintenance_department_id === departmentFilter ||
        c.student_department_id === departmentFilter
    );
  }, [dashboardData?.recent_complaints, departmentFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <CircleNotch size={36} className="animate-spin text-blue-700 dark:text-blue-400" />
        </div>
        <LoadingSkeleton count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <ErrorState title="Failed to load dashboard" message={error} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 6 Department Cards in a Grid */}
      <section aria-labelledby="department-cards-heading">
        <h2 id="department-cards-heading" className="sr-only">
          Department Performance Metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CANONICAL_DEPARTMENTS.map((deptId) => {
            const dept = resolveDepartment(deptId);
            const breakdown = dashboardData?.metrics?.department_breakdown?.[deptId] || {
              total: 0,
              pending: 0,
              in_progress: 0,
              resolved: 0,
              delayed: 0,
            };
            const delayedCount = breakdown.delayed ?? 0;
            const hasDelayed = delayedCount > 0;

            return (
              <div
                key={deptId}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <DepartmentBadge departmentId={deptId} size="md" />
                    <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {breakdown.total} total
                    </span>
                  </div>

                  {/* Department Type Badges */}
                  <div className="mt-3 flex items-center gap-1.5 text-[11px]">
                    {dept?.is_academic && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 font-medium dark:bg-blue-950/60 dark:text-blue-300">
                        Academic
                      </span>
                    )}
                    {dept?.is_maintenance && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium dark:bg-emerald-950/60 dark:text-emerald-300">
                        Maintenance
                      </span>
                    )}
                  </div>

                  {/* Status Counts Breakdown */}
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center dark:border-slate-800">
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase dark:text-slate-400">
                        Pending
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {breakdown.pending}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase dark:text-slate-400">
                        In Progress
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                        {breakdown.in_progress}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-slate-500 uppercase dark:text-slate-400">
                        Resolved
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        {breakdown.resolved}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Delayed Count Badge */}
                <div
                  className={`mt-4 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition ${
                    hasDelayed
                      ? 'border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                      : 'border border-slate-100 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400'
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Clock size={14} weight={hasDelayed ? 'bold' : 'regular'} />
                    Delayed (&gt;5d)
                  </span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      hasDelayed
                        ? 'rounded-md bg-amber-200/80 px-2 py-0.5 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {delayedCount}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Delayed Institutional Grievances (>5 Days) Oversight Section */}
      <section
        aria-labelledby="delayed-complaints-heading"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col justify-between gap-2 border-b border-slate-100 bg-amber-50/60 p-5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              <WarningCircle size={18} weight="bold" />
            </div>
            <div>
              <h2
                id="delayed-complaints-heading"
                className="text-sm font-bold text-slate-900 sm:text-base dark:text-white"
              >
                Delayed Grievances Requiring Administrative Escalation
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Complaints exceeding institutional 5-day response milestones (Pending &gt; 5d or In Progress without updates).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-200/80 px-3 py-1 font-mono text-xs font-bold text-amber-950 dark:bg-amber-900/60 dark:text-amber-200">
              {dashboardData?.delayed_complaints?.length || 0} Delayed
            </span>
          </div>
        </div>

        {!dashboardData?.delayed_complaints || dashboardData.delayed_complaints.length === 0 ? (
          <div className="flex items-center gap-3 p-6 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
              <CheckCircle size={18} weight="bold" />
            </div>
            <div>
              <span className="font-semibold text-slate-900 dark:text-white">
                No Delayed Grievances
              </span>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                All active complaints are currently operating within the institutional 5-day resolution window.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Complaint
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Maintenance Dept
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Delay Elapsed
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Warnings Issued
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dashboardData.delayed_complaints.map((item) => {
                  const complaint = item.complaint;
                  const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
                  const maintDept = resolveDepartment(complaint.maintenance_department_id);

                  return (
                    <tr
                      key={complaint.$id}
                      className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="max-w-xs px-6 py-4 font-medium text-slate-900 sm:max-w-sm dark:text-white">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/complaints/${complaint.$id}`}
                            className="truncate font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            {complaint.title}
                          </Link>
                          <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
                            #CV-{shortId}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <DepartmentBadge
                          departmentId={complaint.maintenance_department_id || complaint.student_department_id}
                          size="sm"
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <ComplaintStatusBadge status={complaint.status} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 font-mono text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          <Clock size={12} weight="bold" />
                          {item.days_delayed} days
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {item.warning_count > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 font-mono text-xs font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                            <WarningCircle size={12} weight="bold" />
                            {item.warning_count} Warning{item.warning_count > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">None yet</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onIssueWarning({
                              id: complaint.$id,
                              title: complaint.title,
                              departmentName: maintDept?.name || complaint.department_name || '',
                              daysDelayed: item.days_delayed,
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs transition hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                        >
                          <WarningCircle size={13} weight="bold" />
                          <span>Issue Warning</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recent Institutional Complaints Feed with Department Filter */}
      <section
        aria-labelledby="recent-complaints-heading"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2
              id="recent-complaints-heading"
              className="text-sm font-bold text-slate-900 sm:text-base dark:text-white"
            >
              Recent Grievances Across Campus
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live chronological feed of all logged student grievances across academic and maintenance streams.
            </p>
          </div>

          {/* Department Filter Selector */}
          <div className="flex items-center gap-2">
            <Funnel size={14} className="text-slate-400" />
            <select
              value={departmentFilter}
              onChange={(e) => onDepartmentFilterChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Departments</option>
              {CANONICAL_DEPARTMENTS.map((deptId) => {
                const dept = resolveDepartment(deptId);
                return (
                  <option key={deptId} value={deptId}>
                    {dept?.name}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {filteredComplaints.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No Grievances Found"
              description="No grievances match the selected department filter."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Grievance
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Department
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Priority
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Reported
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredComplaints.map((c) => {
                  const shortId = c.$id ? c.$id.slice(-6).toUpperCase() : '000000';
                  return (
                    <tr
                      key={c.$id}
                      className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="max-w-xs px-6 py-4 font-medium text-slate-900 sm:max-w-sm dark:text-white">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`/complaints/${c.$id}`}
                            className="truncate font-semibold hover:text-blue-700 dark:hover:text-blue-400"
                          >
                            {c.title}
                          </Link>
                          <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300">
                            #CV-{shortId}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <DepartmentBadge
                          departmentId={c.maintenance_department_id || c.student_department_id}
                          size="sm"
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <ComplaintStatusBadge status={c.status} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <ComplaintPriorityBadge priority={c.priority} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                        {formatTimestamp(c.created_at || c.$createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
