'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheck,
  SignOut,
  CircleNotch,
  MagnifyingGlass,
  Lock,
  Buildings,
  TerminalWindow,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiGetAdminDashboard,
  apiListAdminComplaints,
  apiUpdateAdminComplaint,
  type ListAdminComplaintsParams,
} from '@/lib/api';
import type { Complaint, ComplaintStatus, AdminMetrics } from '@/types';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  AdminResolutionModal,
  LoadingSkeleton,
  EmptyState,
  ErrorState,
} from '@/components';

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

export default function AdminDashboardPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isAdmin, signOutUser } = useAuth();

  const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected complaint for resolution modal
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Authorization Guard: Admin only
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isAdmin) {
        // Not an administrator; redirect to student dashboard
        router.push('/dashboard');
      }
    }
  }, [loading, user, isAdmin, router]);

  // Fetch admin metrics and complaints queue
  const fetchAdminData = useCallback(async (): Promise<void> => {
    if (!profile || !isAdmin) return;
    setIsLoading(true);
    setFetchError(null);

    try {
      // Parallel fetch metrics and list
      const params: ListAdminComplaintsParams = { page, limit: 20 };
      if (activeTab === 'pending') {
        params.status = 'open';
      } else if (activeTab === 'resolved') {
        params.status = 'resolved';
      }

      const [metricsRes, listRes] = await Promise.all([
        apiGetAdminDashboard(),
        apiListAdminComplaints(params),
      ]);

      if (metricsRes.success && metricsRes.data) {
        setMetrics(metricsRes.data.metrics);
      }

      if (listRes.success && listRes.data) {
        setComplaints(listRes.data.complaints || []);
        setTotalCount(listRes.data.total || 0);
      } else {
        setComplaints([]);
        if (listRes.error && listRes.code !== 'EMPTY_QUEUE') {
          setFetchError(listRes.error);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error loading admin queue';
      setFetchError(msg);
      setComplaints([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile, isAdmin, activeTab, page]);

  useEffect(() => {
    if (isAdmin) {
      void fetchAdminData();
    }
  }, [isAdmin, fetchAdminData]);

  // Handle modal submit
  const handleResolutionSubmit = async (
    complaintId: string,
    newStatus: ComplaintStatus,
    officialResponse: string
  ): Promise<boolean> => {
    try {
      const res = await apiUpdateAdminComplaint(complaintId, {
        status: newStatus,
        official_response: officialResponse,
      });

      if (res.success && res.data) {
        // Update item in local state
        setComplaints((prev) =>
          prev.map((c) =>
            c.$id === complaintId
              ? {
                  ...c,
                  status: newStatus,
                  official_response: officialResponse,
                  resolved_at: newStatus === 'resolved' ? new Date().toISOString() : undefined,
                }
              : c
          )
        );
        // Refresh metrics in background
        void apiGetAdminDashboard().then((m) => {
          if (m.success && m.data) setMetrics(m.data.metrics);
        });
        return true;
      }
      return false;
    } catch (err: unknown) {
      console.warn('[handleResolutionSubmit]', err);
      return false;
    }
  };

  // Filtered complaints by search
  const displayedComplaints = useMemo(() => {
    if (!searchQuery.trim()) return complaints;
    const q = searchQuery.toLowerCase();
    return complaints.filter((c) => {
      const shortId = c.$id.toLowerCase();
      const title = c.title.toLowerCase();
      const student = c.student_name.toLowerCase();
      const enrollment = c.student_enrollment_no.toLowerCase();
      return (
        shortId.includes(q) ||
        title.includes(q) ||
        student.includes(q) ||
        enrollment.includes(q)
      );
    });
  }, [complaints, searchQuery]);

  if (loading || !profile || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const isComputer = profile.department_code === '07';
  const openCount = metrics?.total_open ?? 0;
  const inProgressCount = metrics?.total_in_progress ?? 0;
  const resolvedCount = metrics?.total_resolved ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top App Bar (Screen 6) */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          {/* Brand & Department Scope */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/admin" className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-700 ring-4 ring-blue-100 dark:bg-blue-400 dark:ring-blue-900/30" />
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                CampusVoice
              </span>
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {isComputer ? (
                <TerminalWindow size={13} weight="bold" className="text-blue-700 dark:text-blue-400" />
              ) : (
                <Buildings size={13} weight="bold" className="text-blue-700 dark:text-blue-400" />
              )}
              <span>{profile.department_name} Admin (Code {profile.department_code})</span>
            </div>
          </div>

          {/* Right Header Cluster */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quick search input */}
            <div className="relative hidden lg:block">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search records or tickets..."
                className="w-64 rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-4 text-xs text-slate-900 transition placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-800/80 dark:text-white dark:focus:border-blue-500"
              />
            </div>

            {/* Admin identity badge */}
            <div className="flex items-center gap-2 border-l border-slate-200 pl-3 sm:pl-4 dark:border-slate-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                ADM
              </div>
              <span className="hidden text-xs font-semibold text-slate-800 xl:inline dark:text-slate-200">
                {profile.name}
              </span>
            </div>

            {/* Sign out */}
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

      {/* Main Admin Canvas */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        {/* Sub-Header: Quiet inline metrics & Linear tabs */}
        <div className="mb-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                Department Grievances
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
                <span>{openCount + inProgressCount} pending review</span>
                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>{resolvedCount} resolved this semester</span>
                <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="text-blue-700 font-medium dark:text-blue-400">SLA standard: 48h</span>
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-6 border-b border-slate-200 text-xs font-semibold sm:text-sm dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('pending');
                  setPage(1);
                }}
                className={`relative -mb-px pb-2.5 transition ${
                  activeTab === 'pending'
                    ? 'border-b-2 border-blue-700 font-bold text-blue-700 dark:border-blue-400 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>Pending</span>
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {openCount + inProgressCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('resolved');
                  setPage(1);
                }}
                className={`relative -mb-px pb-2.5 transition ${
                  activeTab === 'resolved'
                    ? 'border-b-2 border-blue-700 font-bold text-blue-700 dark:border-blue-400 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>Resolved</span>
                <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {resolvedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('all');
                  setPage(1);
                }}
                className={`relative -mb-px pb-2.5 transition ${
                  activeTab === 'all'
                    ? 'border-b-2 border-blue-700 font-bold text-blue-700 dark:border-blue-400 dark:text-blue-400'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>All Records</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Single Wide Card Container (Screen 6) */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {/* Context Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-6 py-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-blue-700 dark:text-blue-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Showing {profile.department_name} assigned complaints
              </span>
            </div>

            <div className="flex items-center gap-4 text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending Review
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" /> In Progress
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Resolved
              </span>
            </div>
          </div>

          {/* Spacious Single-Column List */}
          {isLoading ? (
            <div className="p-6">
              <LoadingSkeleton count={3} />
            </div>
          ) : fetchError ? (
            <div className="p-6">
              <ErrorState
                title="Failed to load admin queue"
                message={fetchError}
                onRetry={fetchAdminData}
              />
            </div>
          ) : displayedComplaints.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Queue is completely clear"
                description={`No ${activeTab === 'all' ? '' : activeTab} grievances currently require action in ${profile.department_name}.`}
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedComplaints.map((complaint) => {
                const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
                return (
                  <li
                    key={complaint.$id}
                    className="flex flex-col justify-between gap-5 px-6 py-7 transition hover:bg-slate-50/60 md:flex-row md:items-center dark:hover:bg-slate-800/30"
                  >
                    <div className="max-w-3xl space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded dark:bg-slate-800 dark:text-slate-300">
                          #CV-{shortId}
                        </span>
                        <h2 className="text-sm font-semibold text-slate-900 transition hover:text-blue-700 sm:text-base dark:text-white dark:hover:text-blue-400">
                          <Link href={`/complaints/${complaint.$id}`}>
                            {complaint.title}
                          </Link>
                        </h2>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-700 dark:text-slate-300">
                          {complaint.student_name}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{complaint.student_enrollment_no}</span>
                        <span>·</span>
                        <span>{formatTimestamp(complaint.$createdAt || complaint.created_at)}</span>
                        <span>·</span>
                        <ComplaintStatusBadge status={complaint.status} size="sm" />
                        {complaint.priority === 'high' && (
                          <ComplaintPriorityBadge priority="high" size="sm" />
                        )}
                      </div>

                      {complaint.official_response && (
                        <p className="mt-2 text-xs italic text-slate-600 dark:text-slate-400">
                          Latest Note: &ldquo;{complaint.official_response}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-3 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComplaint(complaint);
                          setIsModalOpen(true);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 shadow-2xs transition hover:border-blue-700 hover:text-blue-700 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
                      >
                        Resolve / Update
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Card Footer: Quiet Pagination & FERPA Integrity Note */}
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4 text-xs text-slate-500 sm:flex-row dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Lock size={14} className="text-blue-700 dark:text-blue-400" />
              <span>Protected by FERPA Cryptographic Audit Trail</span>
            </div>

            <div className="flex items-center gap-4">
              <span>Total records: {totalCount}</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={displayedComplaints.length < 20}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Informational Footnote */}
        <div className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400">
          Institutional Student Affairs &amp; Ombudsman escalation protocols are active. Inquiries over 48 hours without department notes auto-escalate to Dean Council.
        </div>
      </main>

      {/* Centered Resolution Modal (Screen 6) */}
      <AdminResolutionModal
        isOpen={isModalOpen}
        complaint={selectedComplaint}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedComplaint(null);
        }}
        onSubmit={handleResolutionSubmit}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Governance Portal • Administrative Jurisdiction: {profile.department_name}
      </footer>
    </div>
  );
}
