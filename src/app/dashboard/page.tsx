'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Buildings,
  TerminalWindow,
  Plus,
  SignOut,
  Lock,
  CircleNotch,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiListComplaints,
  apiSupportComplaint,
  type ListComplaintsParams,
} from '@/lib/api';
import type { Complaint, ComplaintStatus } from '@/types';
import {
  ComplaintCard,
  SearchAndFilterBar,
  type FeedType,
  LoadingSkeleton,
  EmptyState,
  ErrorState,
} from '@/components';

export default function StudentDashboardPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isOnboarded, isAdmin, signOutUser } = useAuth();

  const [feedType, setFeedType] = useState<FeedType>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [userSupportedIds, setUserSupportedIds] = useState<Set<string>>(new Set());
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Guard: Redirect if not student or not authenticated
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (isAdmin) {
        router.push('/admin');
      } else if (!isOnboarded) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, router]);

  // Fetch complaints from backend API
  const fetchComplaints = useCallback(async (): Promise<void> => {
    if (!profile) return;
    setIsLoadingFeed(true);
    setFeedError(null);

    try {
      const params: ListComplaintsParams = {};
      if (feedType === 'department') {
        params.feed_type = 'department';
      } else if (feedType === 'public') {
        params.feed_type = 'public';
      }

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
        // If empty or error during development, fallback gracefully
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
  }, [profile, feedType, statusFilter, searchQuery]);

  useEffect(() => {
    if (profile && isOnboarded) {
      void fetchComplaints();
    }
  }, [profile, isOnboarded, fetchComplaints]);

  // Support complaint handler (Phase 4 integration)
  const handleSupportComplaint = async (complaintId: string): Promise<void> => {
    if (userSupportedIds.has(complaintId)) return;

    // Optimistic local state update
    setUserSupportedIds((prev) => new Set(prev).add(complaintId));
    setComplaints((prev) =>
      prev.map((c) =>
        c.$id === complaintId ? { ...c, support_count: (c.support_count || 0) + 1 } : c
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
      } else if (res.error) {
        console.warn('[handleSupportComplaint]', res.error);
      }
    } catch (err: unknown) {
      console.warn('[handleSupportComplaint] Network error:', err);
    }
  };

  // Filtered complaints client-side if needed for search
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      // If feedType is department, must match user's department
      if (feedType === 'department' && c.department_code !== profile?.department_code) {
        return false;
      }
      // If feedType is public, must be public issue
      if (feedType === 'public' && c.issue_type !== 'public') {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }
      // Search query
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
  }, [complaints, feedType, profile?.department_code, statusFilter, searchQuery]);

  // Counts for tabs
  const counts = useMemo(() => {
    let deptCount = 0;
    let pubCount = 0;
    complaints.forEach((c) => {
      if (c.department_code === profile?.department_code && c.issue_type === 'department') {
        deptCount++;
      }
      if (c.issue_type === 'public') {
        pubCount++;
      }
    });
    return {
      all: complaints.length,
      department: deptCount,
      public: pubCount,
    };
  }, [complaints, profile?.department_code]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const isComputer = profile.department_code === '07';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top Header Navigation (Screen 3) */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Left: Brand & Department Badge */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight text-slate-900 dark:text-white">
                CampusVoice
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {isComputer ? (
                <TerminalWindow size={13} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Buildings size={13} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
              )}
              <span>{profile.department_name}</span>
            </div>
          </div>

          {/* Right: Actions & Profile */}
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/complaints/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 active:scale-[0.98] dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus size={14} weight="bold" />
              <span>New Complaint</span>
            </Link>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <div className="flex items-center gap-2.5">
              <div className="hidden text-right md:block">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {profile.name}
                </p>
                <p className="flex items-center justify-end gap-1 font-mono text-[10px] text-slate-400">
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
      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Header Section */}
        <div className="mb-7">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px] dark:text-white">
            Complaints
          </h1>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            Department grievances and campus-wide public issues.
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
                : feedType === 'department'
                ? `There are currently no active complaints reported for ${profile.department_name}.`
                : 'No public grievances have been submitted yet.'
            }
            actionHref="/complaints/new"
            actionText="Submit New Grievance"
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
        <div className="mx-auto max-w-5xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CampusVoice Institutional Ombudsman Portal • FERPA Compliant</span>
          <span className="font-mono text-[11px] text-slate-400">
            Jurisdiction: {profile.department_name} (Code {profile.department_code})
          </span>
        </div>
      </footer>
    </div>
  );
}
