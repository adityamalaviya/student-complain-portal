'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Plus,
  SignOut,
  Lock,
  CircleNotch,
  Phone,
} from '@phosphor-icons/react';
import { useAuth, useAuthGuard, useSupportToggle, type SupportStateSnapshot } from '@/lib/hooks';
import {
  apiListComplaints,
  type ListComplaintsParams,
} from '@/lib/api';
import { resolveDepartment } from '@/lib/utils';
import type { Complaint, ComplaintStatus } from '@/types';
import {
  ComplaintCard,
  DepartmentBadge,
  SearchAndFilterBar,
  type FeedType,
  LoadingSkeleton,
  EmptyState,
  ErrorState,
  PhoneChangeModal,
} from '@/components';

function statusMatchesFilter(
  complaintStatus: ComplaintStatus,
  filter: ComplaintStatus | 'all'
): boolean {
  if (filter === 'all') return true;
  if (filter === 'Pending' || filter === 'open') {
    return complaintStatus === 'Pending' || complaintStatus === 'open';
  }
  if (filter === 'In Progress' || filter === 'in_progress') {
    return complaintStatus === 'In Progress' || complaintStatus === 'in_progress';
  }
  if (filter === 'Resolved' || filter === 'resolved') {
    return complaintStatus === 'Resolved' || complaintStatus === 'resolved';
  }
  return complaintStatus === filter;
}

export default function StudentDashboardPage(): React.ReactElement {
  const {
    profile,
    loading,
    error: authError,
    isOnboarded,
    signOutUser,
    refreshProfile,
  } = useAuth();
  useAuthGuard('student');

  const [feedType, setFeedType] = useState<FeedType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [userSupportedIds, setUserSupportedIds] = useState<Set<string>>(new Set());
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState<boolean>(false);
  const fetchSeqRef = useRef<number>(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return (): void => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch academic-department-scoped complaints from backend API with out-of-order guard
  const fetchComplaints = useCallback(async (): Promise<void> => {
    if (!profile) return;
    const seq = ++fetchSeqRef.current;
    setIsLoadingFeed(true);
    setFeedError(null);

    try {
      const params: ListComplaintsParams = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (debouncedSearchQuery.trim().length > 0) {
        params.search = debouncedSearchQuery.trim();
      }

      const response = await apiListComplaints(params);
      if (seq !== fetchSeqRef.current) return;

      if (response.success && response.data) {
        const fetched = response.data.complaints || [];
        setComplaints(fetched);
        const supported = new Set<string>();
        for (const c of fetched) {
          if (c.has_supported && !c.is_own_complaint && c.$id) {
            supported.add(c.$id);
          }
        }
        setUserSupportedIds(supported);
      } else {
        setComplaints([]);
        if (response.error && response.code !== 'EMPTY_QUEUE') {
          setFeedError(response.error);
        }
      }
    } catch (err: unknown) {
      if (seq !== fetchSeqRef.current) return;
      const msg = err instanceof Error ? err.message : 'Network error loading complaints';
      setFeedError(msg);
      setComplaints([]);
    } finally {
      if (seq === fetchSeqRef.current) {
        setIsLoadingFeed(false);
      }
    }
  }, [profile, statusFilter, debouncedSearchQuery]);

  useEffect(() => {
    if (profile && isOnboarded) {
      void fetchComplaints();
    }
  }, [profile, isOnboarded, fetchComplaints]);

  const applySupportState = useCallback(
    (complaintId: string, snapshot: SupportStateSnapshot): void => {
      setUserSupportedIds((prev) => {
        const next = new Set(prev);
        if (snapshot.has_supported) {
          next.add(complaintId);
        } else {
          next.delete(complaintId);
        }
        return next;
      });
      setComplaints((prev) =>
        prev.map((c) =>
          c.$id === complaintId
            ? {
                ...c,
                support_count: snapshot.support_count,
                has_supported: snapshot.has_supported,
              }
            : c
        )
      );
    },
    []
  );

  const { toggleSupport } = useSupportToggle({
    applyState: applySupportState,
    onError: (msg) => console.warn('[handleSupportComplaint]', msg),
  });

  // Support complaint handler with full toggle lifecycle (support / remove-support)
  const handleSupportComplaint = async (complaintId: string): Promise<void> => {
    const target = complaints.find((c) => c.$id === complaintId);
    if (target?.is_own_complaint || (profile?.user_id && target?.student_user_id === profile.user_id)) {
      return;
    }

    await toggleSupport({
      complaintId,
      currentSupported: userSupportedIds.has(complaintId),
      currentCount: target ? (target.support_count ?? 1) : 1,
      isOwnComplaint: Boolean(target?.is_own_complaint),
    });
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const isMine = Boolean(
        c.is_own_complaint || (profile?.user_id && c.student_user_id === profile.user_id)
      );
      if (feedType === 'mine' && !isMine) {
        return false;
      }
      if (!statusMatchesFilter(c.status, statusFilter)) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = c.title.toLowerCase().includes(q);
        const matchesLocation = c.location.toLowerCase().includes(q);
        const matchesDesc = c.description.toLowerCase().includes(q);
        if (!matchesTitle && !matchesLocation && !matchesDesc) {
          return false;
        }
      }
      return true;
    });
  }, [complaints, feedType, profile?.user_id, statusFilter, searchQuery]);

  const counts = useMemo(() => {
    const mineCount = complaints.filter((c) =>
      Boolean(c.is_own_complaint || (profile?.user_id && c.student_user_id === profile.user_id))
    ).length;
    return {
      all: complaints.length,
      mine: mineCount,
    };
  }, [complaints, profile?.user_id]);

  if (authError && !profile && !loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-gray-950">
        <div className="w-full max-w-md space-y-4">
          <ErrorState message={authError} onRetry={() => void refreshProfile()} />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const academicDept = resolveDepartment(profile.student_department_id);
  const academicDeptName = academicDept?.name || profile.department_name || 'Academic Department';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:h-16 sm:px-6">
          {/* Left: Brand & Academic Department Badge */}
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                CampusVoice
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <div className="hidden sm:inline-flex">
              <DepartmentBadge
                departmentId={academicDept?.id ?? profile.student_department_id}
                name={academicDeptName}
                showVerified
                size="sm"
              />
            </div>
          </div>

          {/* Right: Actions & Profile */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <Link
              href="/complaints/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-white shadow-xs transition hover:bg-blue-800 active:scale-95 sm:px-3.5 sm:py-2 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus size={14} weight="bold" />
              <span>New Complaint</span>
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            {/* Student Phone Profile & Request Trigger (Desktop) */}
            {profile.phone_number && (
              <button
                type="button"
                onClick={() => setIsPhoneModalOpen(true)}
                title="View Phone Profile & Request Change"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Phone size={13} className="text-blue-600 dark:text-blue-400" />
                <span className="font-mono">+91 {profile.phone_number}</span>
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Update
                </span>
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <div className="hidden text-right md:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {profile.name}
                </p>
                <p className="flex items-center justify-end gap-1 font-mono text-xs text-slate-400 dark:text-slate-500">
                  <Lock size={10} weight="bold" />
                  {profile.enrollment_no}
                </p>
              </div>

              <button
                type="button"
                onClick={signOutUser}
                title="Sign Out"
                aria-label="Sign Out"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <SignOut size={15} weight="bold" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sub-Bar: Department Scope & Phone Update Access */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2 sm:hidden dark:border-slate-800 dark:bg-slate-900/80">
          <DepartmentBadge
            departmentId={academicDept?.id ?? profile.student_department_id}
            name={academicDeptName}
            showVerified
            size="sm"
          />

          {profile.phone_number && (
            <button
              type="button"
              onClick={() => setIsPhoneModalOpen(true)}
              aria-label="Update Phone Number"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Phone size={12} className="text-blue-600 dark:text-blue-400" />
              <span className="font-mono">+91 {profile.phone_number}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                Update
              </span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Header Section */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Department Complaints
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            Complaints filed by students in {academicDeptName}, routed across campus maintenance teams.
          </p>
        </div>

        {/* Search & Filter Bar */}
        <SearchAndFilterBar
          feedType={feedType}
          onFeedTypeChange={setFeedType}
          counts={counts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />

        {/* Complaint Feed Stream */}
        {isLoadingFeed ? (
          <LoadingSkeleton count={3} />
        ) : feedError ? (
          <ErrorState
            title="Failed to retrieve complaints"
            message={feedError}
            onRetry={fetchComplaints}
          />
        ) : filteredComplaints.length === 0 ? (
          <EmptyState
            title="No complaints in this queue"
            description={
              searchQuery
                ? `No grievances matched "${searchQuery}". Try adjusting your keywords or clearing the filter.`
                : feedType === 'mine'
                ? 'You have not filed any complaints yet.'
                : `There are currently no complaints reported for ${academicDeptName}.`
            }
            actionHref="/complaints/new"
            actionText="Submit New Complaint"
          />
        ) : (
          <div className="space-y-4">
            {filteredComplaints.map((complaint) => (
              <ComplaintCard
                key={complaint.$id}
                complaint={complaint}
                hasSupported={userSupportedIds.has(complaint.$id)}
                onSupport={handleSupportComplaint}
              />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 sm:flex-row">
          <span>CampusVoice Institutional Portal • Academic Department Scope</span>
          <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
            Academic Jurisdiction: {academicDeptName}
          </span>
        </div>
      </footer>

      {/* Student Phone Change Request Modal */}
      {profile.phone_number && (
        <PhoneChangeModal
          isOpen={isPhoneModalOpen}
          onClose={() => setIsPhoneModalOpen(false)}
          currentPhoneNumber={profile.phone_number}
          academicDepartmentName={academicDeptName}
          onPhoneUpdated={async () => {
            await refreshProfile({ silent: true });
          }}
        />
      )}
    </div>
  );
}
