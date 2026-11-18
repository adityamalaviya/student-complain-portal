'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CircleNotch,
  SignOut,
  Clock,
  Funnel,
  Buildings,
  ShieldCheck,
  WarningCircle,
  CheckCircle,
  ArrowRight,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import { apiGetPrincipalDashboard } from '@/lib/api';
import { resolveDepartment } from '@/lib/utils';
import type {
  Complaint,
  PrincipalDashboardData,
  DepartmentId,
} from '@/types';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  DepartmentBadge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from '@/components';

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

export default function PrincipalDashboardPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isPrincipal, signOutUser } = useAuth();

  const [dashboardData, setDashboardData] = useState<PrincipalDashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Auth guard:
  // - loading -> show spinner
  // - not authenticated -> redirect /sign-in
  // - authenticated but not principal -> redirect /dashboard
  // - only render if isPrincipal === true
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isPrincipal) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, isPrincipal, router]);

  const fetchDashboardData = useCallback(async (): Promise<void> => {
    if (!user || !isPrincipal) return;
    setIsLoadingDashboard(true);
    setFetchError(null);

    try {
      const response = await apiGetPrincipalDashboard();
      if (response.success && response.data) {
        setDashboardData(response.data);
      } else {
        setFetchError(response.error || 'Failed to load dashboard');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load dashboard';
      setFetchError(msg);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [user, isPrincipal]);

  useEffect(() => {
    if (!loading && user && isPrincipal) {
      void fetchDashboardData();
    }
  }, [loading, user, isPrincipal, fetchDashboardData]);

  const filteredComplaints = useMemo(() => {
    const list = dashboardData?.recent_complaints || [];
    if (departmentFilter === 'all') {
      return list;
    }
    return list.filter((c) => {
      const maintId = resolveDepartment(c.maintenance_department_id)?.id || c.maintenance_department_id;
      const studentDeptId = resolveDepartment(c.student_department_id)?.id || c.student_department_id;
      return maintId === departmentFilter || studentDeptId === departmentFilter;
    });
  }, [dashboardData?.recent_complaints, departmentFilter]);

  if (loading || !user || !isPrincipal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          {/* Brand & Role Scope */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/principal" className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-700 ring-4 ring-blue-100 dark:bg-blue-400 dark:ring-blue-900/30" />
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                CampusVoice
              </span>
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <ShieldCheck size={14} weight="bold" />
              Principal Governance
            </span>
          </div>

          {/* User & Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 sm:pr-4 dark:border-slate-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                PRN
              </div>
              <span className="hidden text-xs font-semibold text-slate-800 sm:inline dark:text-slate-200">
                {profile?.name || 'Principal'}
              </span>
            </div>

            <button
              type="button"
              onClick={signOutUser}
              title="Sign Out"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              <SignOut size={15} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                Principal Dashboard
              </h1>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
                Institutional oversight of student grievances, department SLA compliance, and delay monitoring.
              </p>
            </div>
            {dashboardData?.metrics && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-2xs dark:bg-slate-900">
                  Total Complaints: <strong className="text-slate-900 dark:text-white">{dashboardData.metrics.total_complaints}</strong>
                </span>
                <span className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-2xs dark:bg-slate-900">
                  Total Delayed: <strong className={dashboardData.metrics.total_delayed > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-900 dark:text-white'}>{dashboardData.metrics.total_delayed}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Loading Spinner for full dashboard */}
        {isLoadingDashboard ? (
          <div className="space-y-6">
            <div className="flex items-center justify-center py-12">
              <CircleNotch size={36} className="animate-spin text-blue-700 dark:text-blue-400" />
            </div>
            <LoadingSkeleton count={3} />
          </div>
        ) : fetchError ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <ErrorState
              title="Failed to load dashboard"
              message={fetchError}
              onRetry={fetchDashboardData}
            />
          </div>
        ) : (
          <div className="space-y-8">
            {/* 6 Department Cards in a Grid */}
            <section aria-labelledby="department-cards-heading">
              <h2 id="department-cards-heading" className="sr-only">
                Department Performance Metrics
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CANONICAL_DEPARTMENTS.map((deptId) => {
                  const dept = resolveDepartment(deptId);
                  const deptName = dept?.name || deptId;
                  const breakdown = dashboardData?.metrics?.department_breakdown?.[deptId] || {
                    total: 0,
                    pending: 0,
                    in_progress: 0,
                    resolved: 0,
                    delayed: 0,
                  };
                  const delayedCount = breakdown.delayed ?? (breakdown as Record<string, number>).delayed_count ?? 0;
                  const hasDelayed = delayedCount > 0;

                  return (
                    <div
                      key={deptId}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                          <div className="flex items-center gap-2">
                            <Buildings size={18} className="text-blue-700 dark:text-blue-400" />
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              {deptName}
                            </h3>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Total: {breakdown.total}
                          </span>
                        </div>

                        {/* Counts Grid */}
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Pending
                            </span>
                            <span className="font-mono text-base font-bold text-slate-900 dark:text-white">
                              {breakdown.pending}
                            </span>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              In Progress
                            </span>
                            <span className="font-mono text-base font-bold text-blue-700 dark:text-blue-400">
                              {breakdown.in_progress}
                            </span>
                          </div>
                          <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Resolved
                            </span>
                            <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                              {breakdown.resolved}
                            </span>
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
                  <span className="rounded-full bg-amber-200/80 px-2.5 py-1 font-mono text-xs font-bold text-amber-950 dark:bg-amber-900/70 dark:text-amber-200">
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
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      SLA Response Standards Met
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Zero complaints currently exceed the 5-day threshold across all 6 departments.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Title & ID
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
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dashboardData.delayed_complaints.map((item) => {
                        const complaint = item.complaint;
                        const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
                        return (
                          <tr
                            key={complaint.$id}
                            tabIndex={0}
                            role="button"
                            onClick={() => router.push(`/complaints/${complaint.$id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                router.push(`/complaints/${complaint.$id}`);
                              }
                            }}
                            className="cursor-pointer transition hover:bg-amber-50/40 dark:hover:bg-amber-950/10"
                          >
                            <td className="max-w-xs px-6 py-4 font-medium text-slate-900 sm:max-w-md dark:text-white">
                              <div className="flex flex-col gap-0.5">
                                <span className="truncate font-semibold hover:text-blue-700 dark:hover:text-blue-400">
                                  {complaint.title}
                                </span>
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
                            <td className="whitespace-nowrap px-6 py-4 font-mono">
                              {item.warning_count > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950/60 dark:text-red-400">
                                  {item.warning_count} warning{item.warning_count > 1 ? 's' : ''}
                                </span>
                              ) : (
                                <span className="text-slate-400">None</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-400">
                                Inspect
                                <ArrowRight size={13} weight="bold" />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Recent Complaints Section with Filter Dropdown */}
            <section
              aria-labelledby="recent-complaints-heading"
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900"
            >
              {/* Header with Department filter dropdown */}
              <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/50 p-5 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-2">
                  <h2
                    id="recent-complaints-heading"
                    className="text-sm font-bold text-slate-900 sm:text-base dark:text-white"
                  >
                    Recent Institutional Grievances
                  </h2>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {filteredComplaints.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Funnel size={14} className="text-slate-400" />
                  <label htmlFor="department-filter" className="sr-only">
                    Filter by Department
                  </label>
                  <select
                    id="department-filter"
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-blue-700 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-blue-500"
                  >
                    <option value="all">All Departments</option>
                    {CANONICAL_DEPARTMENTS.map((deptId) => {
                      const dept = resolveDepartment(deptId);
                      return (
                        <option key={deptId} value={deptId}>
                          {dept?.name || deptId}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Complaints Table */}
              {filteredComplaints.length === 0 ? (
                <div className="p-8">
                  <EmptyState
                    title="No complaints found"
                    description={
                      departmentFilter === 'all'
                        ? 'There are currently no recorded complaints in the system.'
                        : 'No complaints match the selected department filter.'
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Title
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
                          Created At
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredComplaints.map((c) => {
                        const shortId = c.$id ? c.$id.slice(-6).toUpperCase() : '000000';
                        return (
                          <tr
                            key={c.$id}
                            tabIndex={0}
                            role="button"
                            onClick={() => router.push(`/complaints/${c.$id}`)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                router.push(`/complaints/${c.$id}`);
                              }
                            }}
                            className="cursor-pointer transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="max-w-xs px-6 py-4 font-medium text-slate-900 sm:max-w-md dark:text-white">
                              <div className="flex flex-col gap-0.5">
                                <span className="truncate font-semibold hover:text-blue-700 dark:hover:text-blue-400">
                                  {c.title}
                                </span>
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
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Governance Portal • Office of the Principal
      </footer>
    </div>
  );
}
