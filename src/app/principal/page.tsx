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
  UserPlus,
  Users,
  Scroll,
  X,
  ArrowsClockwise,
  Prohibit,
  Trash,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiGetPrincipalDashboard,
  apiListAdminAssignments,
  apiAssignAdmin,
  apiRevokeAdmin,
  apiGetAuditHistory,
} from '@/lib/api';
import { resolveDepartment } from '@/lib/utils';
import type {
  Complaint,
  PrincipalDashboardData,
  DepartmentId,
  DepartmentAdminAssignment,
  AuditLog,
} from '@/types';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  DepartmentBadge,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  IssueWarningModal,
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

  // Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'admins' | 'audit'>('overview');

  // Overview Tab State
  const [dashboardData, setDashboardData] = useState<PrincipalDashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Warning Modal State
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false);
  const [selectedComplaintForWarning, setSelectedComplaintForWarning] = useState<{
    id: string;
    title: string;
    departmentName: string;
    daysDelayed: number;
  } | null>(null);

  // Admin Assignments State
  const [adminAssignments, setAdminAssignments] = useState<DepartmentAdminAssignment[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState<boolean>(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [assignEmail, setAssignEmail] = useState<string>('');
  const [assignDeptId, setAssignDeptId] = useState<string>('dept_comp');
  const [assignScope, setAssignScope] = useState<'academic' | 'maintenance'>('maintenance');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState<boolean>(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Auth Guard
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isPrincipal) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, isPrincipal, router]);

  // Fetch Overview Data
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

  // Fetch Admin Assignments
  const fetchAdminAssignments = useCallback(async (): Promise<void> => {
    if (!user || !isPrincipal) return;
    setIsLoadingAdmins(true);
    setAdminsError(null);

    try {
      const res = await apiListAdminAssignments();
      if (res.success && res.data) {
        setAdminAssignments(res.data.assignments);
      } else {
        setAdminsError(res.error || 'Failed to list administrators');
      }
    } catch (err) {
      setAdminsError(err instanceof Error ? err.message : 'Failed to load administrators');
    } finally {
      setIsLoadingAdmins(false);
    }
  }, [user, isPrincipal]);

  // Fetch Audit History
  const fetchAuditLogs = useCallback(async (): Promise<void> => {
    if (!user || !isPrincipal) return;
    setIsLoadingAudit(true);
    setAuditError(null);

    try {
      const res = await apiGetAuditHistory({
        action: auditActionFilter !== 'all' ? auditActionFilter : undefined,
        limit: 100,
      });
      if (res.success && res.data) {
        setAuditLogs(res.data.audit_logs);
      } else {
        setAuditError(res.error || 'Failed to load audit history');
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [user, isPrincipal, auditActionFilter]);

  // Initial Load
  useEffect(() => {
    if (user && isPrincipal) {
      fetchDashboardData();
    }
  }, [user, isPrincipal, fetchDashboardData]);

  // Tab Change Handler
  useEffect(() => {
    if (activeTab === 'admins') {
      fetchAdminAssignments();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAdminAssignments, fetchAuditLogs]);

  // Filter complaints in recent section
  const filteredComplaints = useMemo(() => {
    if (!dashboardData?.recent_complaints) return [];
    if (departmentFilter === 'all') return dashboardData.recent_complaints;
    return dashboardData.recent_complaints.filter(
      (c) => c.maintenance_department_id === departmentFilter || c.student_department_id === departmentFilter
    );
  }, [dashboardData?.recent_complaints, departmentFilter]);

  // Handle Assign Admin Submit
  const handleAssignSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const targetDept = resolveDepartment(assignDeptId);
    if (!targetDept) {
      setAssignError('Please select a valid department.');
      return;
    }
    if (assignScope === 'academic' && !targetDept.is_academic) {
      setAssignError(`Department '${targetDept.name}' is maintenance-only and cannot have academic administrators.`);
      return;
    }
    if (!assignEmail || !assignEmail.includes('@')) {
      setAssignError('Please provide a valid email address.');
      return;
    }

    setAssignError(null);
    setIsSubmittingAssign(true);

    try {
      const res = await apiAssignAdmin({
        email: assignEmail.trim().toLowerCase(),
        department_id: assignDeptId,
        scope: assignScope,
      });

      if (!res.success) {
        setAssignError(res.error || 'Failed to assign administrator.');
        setIsSubmittingAssign(false);
        return;
      }

      setIsSubmittingAssign(false);
      setIsAssignModalOpen(false);
      setAssignEmail('');
      await fetchAdminAssignments();
    } catch (err) {
      setIsSubmittingAssign(false);
      setAssignError(err instanceof Error ? err.message : 'Network error assigning administrator.');
    }
  };

  // Handle Revoke Admin
  const handleRevokeAssignment = async (assignmentId: string): Promise<void> => {
    if (!confirm('Are you sure you want to revoke this administrative assignment?')) return;
    setRevokingId(assignmentId);

    try {
      const res = await apiRevokeAdmin(assignmentId);
      if (res.success) {
        await fetchAdminAssignments();
      } else {
        alert(res.error || 'Failed to revoke administrator.');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Network error revoking administrator.');
    } finally {
      setRevokingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  if (!user || !isPrincipal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const selectedDeptObj = resolveDepartment(assignDeptId);
  const isInvalidAcademicDept = assignScope === 'academic' && (!selectedDeptObj || !selectedDeptObj.is_academic);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 transition-colors dark:bg-slate-950 dark:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          {/* Logo / Branding */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
              <ShieldCheck size={24} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  CampusVoice
                </span>
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-blue-800 uppercase dark:bg-blue-950 dark:text-blue-300">
                  Principal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Institutional Governance & Compliance
              </p>
            </div>
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
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Institutional Governance
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
              Cross-department oversight, five-day delay warnings, admin role provisioning, and audit integrity.
            </p>
          </div>
          {dashboardData?.metrics && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-2xs dark:bg-slate-900">
                Total Grievances: <strong className="text-slate-900 dark:text-white">{dashboardData.metrics.total_complaints}</strong>
              </span>
              <span className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-2xs dark:bg-slate-900">
                Delayed (&gt;5d):{' '}
                <strong className={dashboardData.metrics.total_delayed > 0 ? 'font-bold text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}>
                  {dashboardData.metrics.total_delayed}
                </strong>
              </span>
              <span className="rounded-lg bg-white px-3 py-1.5 font-medium shadow-2xs dark:bg-slate-900">
                Warnings Issued:{' '}
                <strong className="text-red-700 dark:text-red-400 font-bold">
                  {dashboardData.metrics.total_warnings_issued}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'overview'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck size={18} weight={activeTab === 'overview' ? 'bold' : 'regular'} />
            <span>Grievance Oversight</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'admins'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users size={18} weight={activeTab === 'admins' ? 'bold' : 'regular'} />
            <span>Admin Assignments</span>
            {adminAssignments.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {adminAssignments.filter((a) => a.is_active).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'audit'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Scroll size={18} weight={activeTab === 'audit' ? 'bold' : 'regular'} />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW & DELAYED GRIEVANCES */}
        {activeTab === 'overview' && (
          <>
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
                                  <div className="flex items-center justify-end gap-2">
                                    {item.is_warning_eligible && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedComplaintForWarning({
                                            id: complaint.$id,
                                            title: complaint.title,
                                            departmentName: maintDept?.name || 'Maintenance',
                                            daysDelayed: item.days_delayed,
                                          });
                                          setWarningModalOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950/60 dark:text-red-300 dark:hover:bg-red-900/60"
                                      >
                                        <WarningCircle size={13} weight="bold" />
                                        <span>Issue Warning</span>
                                      </button>
                                    )}
                                    <Link
                                      href={`/complaints/${complaint.$id}`}
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                    >
                                      <span>Inspect</span>
                                      <ArrowRight size={12} weight="bold" />
                                    </Link>
                                  </div>
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
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-blue-500"
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
          </>
        )}

        {/* TAB 2: ADMIN ASSIGNMENTS */}
        {activeTab === 'admins' && (
          <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Department Administrator Assignments
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Provision and manage scoped administrator privileges across all six institutional departments.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssignError(null);
                  setIsAssignModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
              >
                <UserPlus size={16} weight="bold" />
                <span>Assign Administrator</span>
              </button>
            </div>

            {isLoadingAdmins ? (
              <div className="py-12 text-center">
                <CircleNotch size={32} className="mx-auto animate-spin text-blue-700 dark:text-blue-400" />
              </div>
            ) : adminsError ? (
              <ErrorState title="Failed to load administrators" message={adminsError} onRetry={fetchAdminAssignments} />
            ) : adminAssignments.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
                <EmptyState
                  title="No Administrators Assigned"
                  description="Use the Assign Administrator button to provision department permissions."
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Admin Email
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Department
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Scope
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Assigned At
                        </th>
                        <th scope="col" className="px-6 py-3.5 text-right">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {adminAssignments.map((a) => {
                        const isRevoking = revokingId === a.$id;
                        return (
                          <tr key={a.$id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-white">
                              {a.email}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <DepartmentBadge departmentId={a.department_id} size="sm" />
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                                  a.scope === 'academic'
                                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                              >
                                {a.scope === 'academic' ? 'Academic (Phone Approvals)' : 'Maintenance (Grievances)'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4">
                              <span
                                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                                  a.is_active
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {a.is_active ? 'Active' : 'Revoked'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                              {formatTimestamp(a.created_at)}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-right">
                              {a.is_active ? (
                                <button
                                  type="button"
                                  disabled={isRevoking}
                                  onClick={() => handleRevokeAssignment(a.$id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                                >
                                  {isRevoking ? (
                                    <CircleNotch size={12} className="animate-spin" />
                                  ) : (
                                    <Trash size={12} weight="bold" />
                                  )}
                                  <span>Revoke</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400">Inactive</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SYSTEM AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  System Audit Trail
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Append-only immutable record of all lifecycle, governance, and privileged administrative mutations.
                </p>
              </div>

              {/* Action Filter */}
              <div className="flex items-center gap-2">
                <Funnel size={14} className="text-slate-400" />
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="all">All Actions</option>
                  <option value="issue_warning">issue_warning</option>
                  <option value="respond_to_warning">respond_to_warning</option>
                  <option value="assign_department_admin">assign_department_admin</option>
                  <option value="revoke_department_admin">revoke_department_admin</option>
                  <option value="update_complaint_status">update_complaint_status</option>
                  <option value="add_progress_update">add_progress_update</option>
                  <option value="request_phone_change">request_phone_change</option>
                  <option value="review_phone_change">review_phone_change</option>
                  <option value="complete_phone_change">complete_phone_change</option>
                </select>
                <button
                  type="button"
                  onClick={fetchAuditLogs}
                  title="Refresh Audit Logs"
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ArrowsClockwise size={14} weight="bold" />
                </button>
              </div>
            </div>

            {isLoadingAudit ? (
              <div className="py-12 text-center">
                <CircleNotch size={32} className="mx-auto animate-spin text-blue-700 dark:text-blue-400" />
              </div>
            ) : auditError ? (
              <ErrorState title="Failed to load audit logs" message={auditError} onRetry={fetchAuditLogs} />
            ) : auditLogs.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
                <EmptyState
                  title="No Audit Logs Found"
                  description="No audit records match the current filter selection."
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">
                          Timestamp
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Action
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Actor
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Target Resource
                        </th>
                        <th scope="col" className="px-6 py-3.5">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs.map((log) => (
                        <tr
                          key={log.$id}
                          className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                            {formatTimestamp(log.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                              {log.action}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                {log.actor_id.slice(-6)}
                              </span>
                              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                                {log.actor_role}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {log.target_resource_type}:{log.target_resource_id.slice(-6)}
                          </td>
                          <td className="max-w-xs truncate px-6 py-4 font-mono text-[11px] text-slate-500 sm:max-w-sm dark:text-slate-400">
                            <button
                              type="button"
                              onClick={() => setSelectedAuditLog(log)}
                              className="text-left font-mono underline hover:text-blue-700 dark:hover:text-blue-400"
                            >
                              {log.details ? log.details.slice(0, 60) + '...' : '{}'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Assign Administrator Modal */}
      {isAssignModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Assign Department Administrator
              </h3>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Administrator Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  placeholder="faculty@college.edu"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Institutional Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignDeptId}
                  onChange={(e) => setAssignDeptId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {CANONICAL_DEPARTMENTS.map((deptId) => {
                    const dept = resolveDepartment(deptId);
                    return (
                      <option key={deptId} value={deptId}>
                        {dept?.name} ({dept?.is_academic ? 'Academic & Maintenance' : 'Maintenance Only'})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Administrative Scope <span className="text-red-500">*</span>
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignScope('maintenance')}
                    className={`rounded-xl border p-3 text-left transition ${
                      assignScope === 'maintenance'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold">Maintenance</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Manage grievances</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAssignScope('academic')}
                    className={`rounded-xl border p-3 text-left transition ${
                      assignScope === 'academic'
                        ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold">Academic</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">Review phone changes</div>
                  </button>
                </div>
              </div>

              {/* Water/Sanitation Academic Warning */}
              {isInvalidAcademicDept && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <Prohibit size={16} weight="bold" className="mt-0.5 shrink-0" />
                  <span>
                    Water and Sanitation are maintenance-only departments. Academic scope is strictly prohibited for these departments.
                  </span>
                </div>
              )}

              {assignError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                  <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
                  <span>{assignError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  disabled={isSubmittingAssign}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAssign || isInvalidAcademicDept}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {isSubmittingAssign && <CircleNotch size={14} className="animate-spin" />}
                  <span>Save Assignment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Log Details Inspector Modal */}
      {selectedAuditLog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Audit Log Event Inspector
              </h3>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Action:</span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedAuditLog.action}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Timestamp:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.created_at}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Actor:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.actor_id} ({selectedAuditLog.actor_role})
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Target Resource:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.target_resource_type}:{selectedAuditLog.target_resource_id}
                  </div>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-500">Payload Details:</span>
                <pre className="mt-1 max-h-60 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedAuditLog.details), null, 2);
                    } catch {
                      return selectedAuditLog.details;
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Warning Modal */}
      {selectedComplaintForWarning && (
        <IssueWarningModal
          isOpen={warningModalOpen}
          complaintId={selectedComplaintForWarning.id}
          complaintTitle={selectedComplaintForWarning.title}
          departmentName={selectedComplaintForWarning.departmentName}
          daysDelayed={selectedComplaintForWarning.daysDelayed}
          onClose={() => {
            setWarningModalOpen(false);
            setSelectedComplaintForWarning(null);
          }}
          onSuccess={() => {
            fetchDashboardData();
          }}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Governance Portal • Office of the Principal
      </footer>
    </div>
  );
}
