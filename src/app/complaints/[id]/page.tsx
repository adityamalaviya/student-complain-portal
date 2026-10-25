'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  FileText,
  Users,
  CheckCircle,
  CircleNotch,
  Question,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import { apiGetComplaint, apiSupportComplaint } from '@/lib/api';
import type { Complaint } from '@/types';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  ComplaintSupportButton,
  DepartmentBadge,
} from '@/components';

function formatReportedDate(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

export default function ComplaintDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams();
  const complaintId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const { user, profile, loading, isOnboarded, isAdmin } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [hasSupported, setHasSupported] = useState<boolean>(false);
  const [supportCount, setSupportCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Authentication & Onboarding Guards
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isOnboarded && !isAdmin) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, router]);

  // Fetch complaint details
  const fetchComplaintDetails = useCallback(async (): Promise<void> => {
    if (!complaintId) return;
    setIsLoading(true);
    setIsNotFound(false);
    setFetchError(null);

    try {
      const res = await apiGetComplaint(complaintId);
      if (res.success && res.data) {
        setComplaint(res.data.complaint);
        setHasSupported(Boolean(res.data.has_supported));
        setSupportCount(res.data.complaint.support_count || 0);
      } else if (res.code === 'NOT_FOUND' || res.code === 'UNAUTHORIZED' || res.error?.includes('404')) {
        // Oracle Elimination: Mismatched department access returns generic 404
        setIsNotFound(true);
      } else {
        setFetchError(res.error || 'Failed to load complaint details');
      }
    } catch {
      setIsNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    if (user && complaintId) {
      void fetchComplaintDetails();
    }
  }, [user, complaintId, fetchComplaintDetails]);

  // Support complaint handler (Phase 4)
  const handleSupportClick = async (_id?: string): Promise<void> => {
    if (hasSupported || !complaintId) return;

    // Snapshot previous state for rollback
    const prevSupported = hasSupported;
    const prevCount = supportCount;

    // Optimistic UI update
    setHasSupported(true);
    setSupportCount((prev) => prev + 1);

    try {
      const res = await apiSupportComplaint(complaintId);
      if (res.success && res.data) {
        setSupportCount(res.data.support_count);
        setHasSupported(res.data.has_supported);
      } else {
        // Rollback state
        if (res.code === 'ALREADY_SUPPORTED') {
          setHasSupported(true);
          setSupportCount(prevCount);
        } else {
          setHasSupported(prevSupported);
          setSupportCount(prevCount);
        }
        if (res.error) {
          console.warn('[handleSupportClick]', res.error);
        }
      }
    } catch (err: unknown) {
      setHasSupported(prevSupported);
      setSupportCount(prevCount);
      console.warn('[handleSupportClick] Network error:', err);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  // Oracle Elimination / 404 View
  if (isNotFound || !complaint) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Question size={32} weight="bold" />
        </div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Grievance Not Found</h1>
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500 sm:text-sm dark:text-slate-400">
          The requested complaint record does not exist or is not available under your authorized institutional jurisdiction.
        </p>
        <div className="mt-6">
          <Link
            href={isAdmin ? '/admin' : '/dashboard'}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <ArrowLeft size={16} weight="bold" />
            <span>Return to {isAdmin ? 'Admin Console' : 'Complaints Feed'}</span>
          </Link>
        </div>
      </div>
    );
  }

  const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
  const isPublic = complaint.issue_type === 'public';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href={isAdmin ? '/admin' : '/dashboard'}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ArrowLeft size={18} weight="bold" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight text-slate-900 sm:text-base dark:text-white">
                CampusVoice
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-blue-700 dark:bg-blue-400" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <DepartmentBadge code={complaint.department_code} name={complaint.department_name} size="sm" />
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-[780px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* Navigation Back Link */}
        <div className="mb-6">
          <Link
            href={isAdmin ? '/admin' : '/dashboard'}
            className="group inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900 sm:text-sm dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft size={16} weight="bold" className="transition-transform group-hover:-translate-x-0.5" />
            <span>Back to {isAdmin ? 'Department Queue' : 'Complaints Feed'}</span>
          </Link>
        </div>

        {/* Surface Card Container (Screen 5) */}
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {/* Meta & Status Pill Row */}
          <div className="flex flex-wrap items-center gap-2.5 pb-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {isPublic ? 'Public Grievance' : 'Department Grievance'}
            </span>
            <span>•</span>
            <ComplaintStatusBadge status={complaint.status} />
            <ComplaintPriorityBadge priority={complaint.priority} />
            <span>•</span>
            <span>Reported {formatReportedDate(complaint.$createdAt || complaint.created_at)}</span>
          </div>

          {/* Ticket Identifier */}
          <div className="mt-1 font-mono text-xs font-bold tracking-wider text-slate-400 dark:text-slate-500">
            #CV-{shortId}
          </div>

          {/* Complaint Title */}
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
            {complaint.title}
          </h1>

          {/* Location Badge Line */}
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            <MapPin size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
            <span>{complaint.location}</span>
          </div>

          {/* Separator */}
          <hr className="my-6 border-slate-100 dark:border-slate-800" />

          {/* Description Body */}
          <div className="space-y-4 text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300">
            <p className="whitespace-pre-wrap">{complaint.description}</p>
          </div>

          {/* Attachment Preview (if any) */}
          {complaint.attachment_file_id && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Attached Documentation
              </h3>
              <div className="inline-flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:w-auto dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
                    <FileText size={20} weight="bold" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white">
                      Attachment ({complaint.attachment_file_id.slice(0, 10)}...)
                    </p>
                    <p className="text-[11px] text-slate-400">Institutional Attachment Archive</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Community Support Block (Phase 4) */}
          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:p-5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Users size={20} weight="bold" />
              </div>
              <div>
                <p className="text-xs text-slate-900 sm:text-sm dark:text-white">
                  <strong className="text-sm font-bold sm:text-base">{supportCount}</strong> students support this issue
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Boosts visibility for Faculty Council review and priority resolution
                </p>
              </div>
            </div>

            <ComplaintSupportButton
              complaintId={complaint.$id}
              supportCount={supportCount}
              hasSupported={hasSupported}
              onToggleSupport={handleSupportClick}
              variant="detail"
            />
          </div>

          {/* Official Admin Response Box (if present, Stitch Screen 5 left accent border) */}
          {complaint.official_response && (
            <div className="mt-8 rounded-r-xl border border-l-4 border-slate-200 border-l-blue-700 bg-blue-50/20 p-5 dark:border-slate-800 dark:border-l-blue-500 dark:bg-blue-950/20">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-white dark:bg-blue-600">
                    <CheckCircle size={14} weight="bold" />
                  </div>
                  <span className="text-xs font-bold text-slate-900 sm:text-sm dark:text-white">
                    Administrator Response
                  </span>
                  <span className="hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 sm:inline-block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {complaint.department_name} Administration
                  </span>
                </div>
                {complaint.resolved_at && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Resolved {formatReportedDate(complaint.resolved_at)}
                  </span>
                )}
              </div>

              <div className="text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300 sm:pl-8">
                <p className="whitespace-pre-wrap">{complaint.official_response}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-200/60 pt-2 text-xs dark:border-slate-800/60">
                  <span className="font-semibold text-slate-500">Current Status:</span>
                  <ComplaintStatusBadge status={complaint.status} size="sm" />
                </div>
              </div>
            </div>
          )}
        </article>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Protected by Academic Ombudsman &amp; FERPA Protocol
      </footer>
    </div>
  );
}
