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
  DownloadSimple,
  User,
  ShieldCheck,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiGetComplaint,
  apiGetComplaintAttachment,
  apiSupportComplaint,
} from '@/lib/api';
import { resolveDepartment } from '@/lib/utils';
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

  const { user, loading, isOnboarded, isAdmin, isPrincipal } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [hasSupported, setHasSupported] = useState<boolean>(false);
  const [supportCount, setSupportCount] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloadingAttachment, setIsDownloadingAttachment] = useState<boolean>(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Authentication & Onboarding Guards
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isOnboarded && !isAdmin && !isPrincipal) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, isPrincipal, router]);

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
        setSupportCount(res.data.complaint.support_count ?? 1);
      } else if (
        res.code === 'NOT_FOUND' ||
        res.code === 'UNAUTHORIZED' ||
        res.error?.includes('404')
      ) {
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

  // Support complaint handler
  const handleSupportClick = async (_id?: string): Promise<void> => {
    if (hasSupported || !complaintId) return;

    const prevSupported = hasSupported;
    const prevCount = supportCount;

    setHasSupported(true);
    setSupportCount((prev) => prev + 1);

    try {
      const res = await apiSupportComplaint(complaintId);
      if (res.success && res.data) {
        setSupportCount(res.data.support_count);
        setHasSupported(res.data.has_supported);
      } else {
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

  const handleDownloadAttachment = async (): Promise<void> => {
    if (!complaint?.$id || !complaint.attachment_file_id || isDownloadingAttachment) {
      return;
    }

    setAttachmentError(null);
    setIsDownloadingAttachment(true);
    try {
      const res = await apiGetComplaintAttachment(
        complaint.$id,
        complaint.attachment_file_id
      );
      if (!res.success || !res.data?.attachment) {
        setAttachmentError(res.error || 'Unable to retrieve private attachment.');
        return;
      }

      const { file_name, mime_type, content_base64 } = res.data.attachment;
      const binary = atob(content_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime_type });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file_name || 'complaint-attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to download attachment.';
      setAttachmentError(msg);
    } finally {
      setIsDownloadingAttachment(false);
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
          {fetchError ||
            'The requested complaint record does not exist or is not available under your authorized institutional jurisdiction.'}
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
  const maintDept = resolveDepartment(
    complaint.maintenance_department_id || complaint.department_code
  );
  const academicDept = resolveDepartment(complaint.student_department_id);

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
            <DepartmentBadge
              code={maintDept?.id || complaint.maintenance_department_id || 'dept_comp'}
              name={maintDept?.name || complaint.department_name}
              size="sm"
            />
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
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

        {/* Surface Card Container */}
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          {/* Meta & Status Pill Row */}
          <div className="flex flex-wrap items-center gap-2.5 pb-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {academicDept?.name || 'Academic Department'} Complaint
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

          {/* Location & Routing */}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <MapPin size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
              <span>{complaint.location}</span>
            </span>
            <span>•</span>
            <span>
              Maintenance Team:{' '}
              <strong className="font-semibold text-slate-700 dark:text-slate-200">
                {maintDept?.name || complaint.department_name || complaint.maintenance_department_id}
              </strong>
            </span>
          </div>

          {/* Separator */}
          <hr className="my-6 border-slate-100 dark:border-slate-800" />

          {/* Description Body */}
          <div className="space-y-4 text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-300">
            <p className="whitespace-pre-wrap">{complaint.description}</p>
          </div>

          {/* Authorized Submitter Details (never returned by backend to peer students) */}
          {(complaint.student_name ||
            complaint.student_enrollment_no ||
            complaint.student_phone_number) && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-800/40">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-300">
                <ShieldCheck size={14} weight="bold" className="text-blue-700 dark:text-blue-400" />
                <span>Authorized Submitter Details</span>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                {complaint.student_name && (
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                    <User size={14} className="shrink-0 text-slate-400" />
                    <span className="font-medium">{complaint.student_name}</span>
                  </div>
                )}
                {complaint.student_enrollment_no && (
                  <div className="font-mono text-slate-600 dark:text-slate-300">
                    Enroll: {complaint.student_enrollment_no}
                  </div>
                )}
                {complaint.student_phone_number && (
                  <div className="font-mono text-slate-600 dark:text-slate-300">
                    Phone: {complaint.student_phone_number}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Attachment Preview (only returned to Creator, concerned Maintenance Admin, or Principal) */}
          {complaint.attachment_file_id && (
            <div className="mt-6">
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">
                Attached Documentation
              </h3>
              <div className="inline-flex w-full flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:w-auto dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-700 shadow-2xs dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
                    <FileText size={20} weight="bold" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-900 dark:text-white">
                      Attachment ({complaint.attachment_file_id.slice(0, 10)}...)
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Private Institutional Attachment Archive
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDownloadAttachment()}
                  disabled={isDownloadingAttachment}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-blue-700 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
                >
                  {isDownloadingAttachment ? (
                    <CircleNotch size={14} className="animate-spin" />
                  ) : (
                    <DownloadSimple size={14} weight="bold" />
                  )}
                  <span>{isDownloadingAttachment ? 'Downloading...' : 'Download'}</span>
                </button>
              </div>
              {attachmentError && (
                <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                  {attachmentError}
                </p>
              )}
            </div>
          )}

          {/* Community Support Block */}
          <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:p-5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Users size={20} weight="bold" />
              </div>
              <div>
                <p className="text-xs text-slate-900 sm:text-sm dark:text-white">
                  <strong className="text-sm font-bold sm:text-base">{supportCount}</strong> students support this issue
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Includes creator baseline and peer department support
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

          {/* Official Admin Response Box */}
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
                  <span className="hidden rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 sm:inline-block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {maintDept?.name || complaint.department_name} Administration
                  </span>
                </div>
                {complaint.resolved_at && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Resolved {formatReportedDate(complaint.resolved_at)}
                  </span>
                )}
              </div>

              <div className="text-xs leading-relaxed text-slate-700 sm:pl-8 sm:text-sm dark:text-slate-300">
                <p className="whitespace-pre-wrap">{complaint.official_response}</p>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-200/60 pt-2 text-xs dark:border-slate-800/60">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Current Status:</span>
                  <ComplaintStatusBadge status={complaint.status} size="sm" />
                </div>
              </div>
            </div>
          )}
        </article>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Protected Academic &amp; Maintenance Jurisdiction
      </footer>
    </div>
  );
}
