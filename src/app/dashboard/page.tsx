'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  SignOut,
  Lock,
  CircleNotch,
  Phone,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiListComplaints,
  apiSupportComplaint,
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
  const router = useRouter();
  const { user, profile, loading, isOnboarded, isAdmin, isPrincipal, signOutUser, refreshProfile } = useAuth();

  const [feedType, setFeedType] = useState<FeedType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [userSupportedIds, setUserSupportedIds] = useState<Set<string>>(new Set());
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState<boolean>(false);

  // Guard: Redirect if not student or not authenticated
  useEffect(() => {
    if (isPrincipal) {
      router.replace('/principal');
      return;
    }
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (isAdmin) {
        router.push('/admin');
      } else if (!isOnboarded) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, isPrincipal, router]);

  // Fetch academic-department-scoped complaints from backend API
  const fetchComplaints = useCallback(async (): Promise<void> => {
    if (!profile) return;
    setIsLoadingFeed(true);
    setFeedError(null);

    try {
      const params: ListComplaintsParams = {};
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      if (searchQuery.trim().length > 0) {
        params.search = searchQuery.trim();
      }

      const response = await apiListComplaints(params);
      if (response.success && response.data) {
        setComplaints(response.data.complaints || []);
      } else {
        setComplaints([]);
        if (response.error && response.code !== 'EMPTY_QUEUE') {
          setFeedError(response.error);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error loading complaints';
      setFeedError(msg);
      setComplaints([]);
    } finally {
      setIsLoadingFeed(false);
    }
  }, [profile, statusFilter, searchQuery]);

  useEffect(() => {
    if (profile && isOnboarded) {
      void fetchComplaints();
    }
  }, [profile, isOnboarded, fetchComplaints]);

  // Support complaint handler
  const handleSupportComplaint = async (complaintId: string): Promise<void> => {
    if (userSupportedIds.has(complaintId)) return;

    const prevSupported = userSupportedIds.has(complaintId);
    const target = complaints.find((c) => c.$id === complaintId);
    const prevCount = target ? (target.support_count ?? 1) : 1;

    setUserSupportedIds((prev) => new Set(prev).add(complaintId));
    setComplaints((prev) =>
      prev.map((c) =>
        c.$id === complaintId ? { ...c, support_count: prevCount + 1 } : c
      )
    );

    try {
      const res = await apiSupportComplaint(complaintId);
      if (res.success && res.data) {
        setComplaints((prev) =>
          prev.map((c) =>
            c.$id === complaintId
              ? { ...c, support_count: res.data?.support_count ?? c.support_count }
              : c
          )
        );
      } else {
        if (res.code === 'ALREADY_SUPPORTED') {
          setComplaints((prev) =>
            prev.map((c) =>
              c.$id === complaintId ? { ...c, support_count: prevCount } : c
            )
          );
        } else {
          setUserSupportedIds((prev) => {
            const next = new Set(prev);
            if (!prevSupported) next.delete(complaintId);
            return next;
          });
          setComplaints((prev) =>
            prev.map((c) =>
              c.$id === complaintId ? { ...c, support_count: prevCount } : c
            )
          );
        }
        if (res.error) {
          console.warn('[handleSupportComplaint]', res.error);
        }
      }
    } catch (err: unknown) {
      setUserSupportedIds((prev) => {
        const next = new Set(prev);
        if (!prevSupported) next.delete(complaintId);
        return next;
      });
      setComplaints((prev) =>
        prev.map((c) =>
          c.$id === complaintId ? { ...c, support_count: prevCount } : c
        )
      );
      console.warn('[handleSupportComplaint] Network error:', err);
    }
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
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Left: Brand & Academic Department Badge */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                CampusVoice
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <DepartmentBadge
              departmentId={academicDept?.id ?? profile.student_department_id}
              name={academicDeptName}
              showVerified
              size="sm"
            />
          </div>

          {/* Right: Actions & Profile */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/complaints/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 active:scale-95 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus size={14} weight="bold" />
              <span>New Complaint</span>
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            {/* Student Phone Profile & Request Trigger */}
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
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
              >
                <SignOut size={15} weight="bold" />
              </button>
            </div>
          </div>
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
            await refreshProfile();
          }}
        />
      )}
    </div>
  );
}
