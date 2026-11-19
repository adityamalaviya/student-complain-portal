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
  ClockCounterClockwise,
  Clock,
  WarningCircle,
  ArrowsClockwise,
  ChatText,
  NotePencil,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiGetComplaint,
  apiGetComplaintAttachment,
  apiSupportComplaint,
  apiRemoveSupport,
  apiRequestClarification,
  apiReplyClarification,
  apiUpdateAdminComplaint,
} from '@/lib/api';
import { resolveDepartment, calculateComplaintDelay } from '@/lib/utils';
import type { Complaint, ComplaintStatus, ComplaintTimeline, ComplaintWarning } from '@/types';
import {
  ComplaintStatusBadge,
  ComplaintPriorityBadge,
  ComplaintSupportButton,
  DepartmentBadge,
  AdminResolutionModal,
  ClarificationRequestModal,
  ClarificationReplyBox,
  IssueWarningModal,
  RespondWarningModal,
  type AdminResolutionSubmitResult,
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

function formatTimelineDate(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return 'Recently';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

function getTimelineEntryMeta(entry: ComplaintTimeline): {
  title: string;
  badgeClass: string;
  containerClass: string;
} {
  switch (entry.entry_type) {
    case 'status_change':
      return {
        title: 'Status Change',
        badgeClass:
          'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
        containerClass:
          'border-slate-200 border-l-slate-500 bg-slate-50/70 dark:border-slate-800 dark:border-l-slate-400 dark:bg-slate-800/30',
      };
    case 'progress_update':
      return {
        title: 'Progress Update',
        badgeClass:
          'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300',
        containerClass:
          'border-slate-200 border-l-indigo-600 bg-indigo-50/25 dark:border-slate-800 dark:border-l-indigo-400 dark:bg-indigo-950/20',
      };
    case 'clarification_request':
    case 'request_clarification' as unknown as ComplaintTimeline['entry_type']:
      return {
        title: 'Clarification Requested',
        badgeClass:
          'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
        containerClass:
          'border-slate-200 border-l-amber-500 bg-amber-50/20 dark:border-slate-800 dark:border-l-amber-400 dark:bg-amber-950/15',
      };
    case 'clarification_reply':
    case 'reply_clarification' as unknown as ComplaintTimeline['entry_type']:
      return {
        title: 'Student Reply',
        badgeClass:
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
        containerClass:
          'border-slate-200 border-l-emerald-600 bg-emerald-50/20 dark:border-slate-800 dark:border-l-emerald-400 dark:bg-emerald-950/15',
      };
    case 'admin_response':
    default:
      return {
        title: 'Official Response',
        badgeClass:
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
        containerClass:
          'border-slate-200 border-l-blue-700 bg-blue-50/20 dark:border-slate-800 dark:border-l-blue-500 dark:bg-blue-950/20',
      };
  }
}

function getSafeTimelineAuthorLabel(
  entry: ComplaintTimeline,
  maintDeptName?: string
): string {
  if (entry.author_label) {
    return entry.author_label;
  }
  if (entry.author_role === 'department_admin') {
    return maintDeptName ? `${maintDeptName} Maintenance Admin` : 'Maintenance Admin';
  }
  if (entry.author_role === 'principal') {
    return 'Principal';
  }
  return 'Complaint Creator';
}

export default function ComplaintDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams();
  const complaintId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const { user, loading, isOnboarded, isAdmin, isPrincipal } = useAuth();

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<ComplaintTimeline[]>([]);
  const [hasSupported, setHasSupported] = useState<boolean>(false);
  const [supportCount, setSupportCount] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDownloadingAttachment, setIsDownloadingAttachment] = useState<boolean>(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState<boolean>(false);
  const [isClarificationModalOpen, setIsClarificationModalOpen] = useState<boolean>(false);
  const [warnings, setWarnings] = useState<ComplaintWarning[]>([]);
  const [isIssueWarningModalOpen, setIsIssueWarningModalOpen] = useState<boolean>(false);
  const [selectedWarningForResponse, setSelectedWarningForResponse] = useState<ComplaintWarning | null>(null);
  const [isRespondWarningModalOpen, setIsRespondWarningModalOpen] = useState<boolean>(false);

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
        setTimeline(Array.isArray(res.data.timeline) ? res.data.timeline : []);
        setHasSupported(Boolean(res.data.has_supported));
        setSupportCount(res.data.complaint.support_count ?? 1);
        const rawWarnings = (res.data as { warnings?: ComplaintWarning[] }).warnings;
        setWarnings(Array.isArray(rawWarnings) ? rawWarnings : []);
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

  // Support complaint handler (with full toggle lifecycle: support / remove-support)
  const handleSupportClick = async (_id?: string): Promise<void> => {
    if (!complaintId) return;

    const prevSupported = hasSupported;
    const prevCount = supportCount;

    if (hasSupported) {
      // Optimistic revocation
      setHasSupported(false);
      setSupportCount((prev) => Math.max(1, prev - 1));

      try {
        const res = await apiRemoveSupport(complaintId);
        if (res.success && res.data) {
          setSupportCount(res.data.support_count);
          setHasSupported(res.data.has_supported);
        } else {
          setHasSupported(prevSupported);
          setSupportCount(prevCount);
          if (res.error) {
            console.warn('[handleSupportClick remove]', res.error);
          }
        }
      } catch (err: unknown) {
        setHasSupported(prevSupported);
        setSupportCount(prevCount);
        console.warn('[handleSupportClick remove] Network error:', err);
      }
    } else {
      // Optimistic support
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
            console.warn('[handleSupportClick add]', res.error);
          }
        }
      } catch (err: unknown) {
        setHasSupported(prevSupported);
        setSupportCount(prevCount);
        console.warn('[handleSupportClick add] Network error:', err);
      }
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

  const handleDetailResolutionSubmit = async (
    targetComplaintId: string,
    newStatus: ComplaintStatus,
    officialResponse: string,
    isSubstantive?: boolean
  ): Promise<AdminResolutionSubmitResult> => {
    try {
      const res = await apiUpdateAdminComplaint(targetComplaintId, {
        status: newStatus,
        official_response: officialResponse,
        ...(typeof isSubstantive === 'boolean' ? { is_substantive: isSubstantive } : {}),
      });

      if (!res.success || !res.data) {
        return {
          success: false,
          error: res.error || 'Failed to persist department response.',
        };
      }

      // Refetch persisted complaint and timeline from Appwrite instead of relying on temporary submission response.
      await fetchComplaintDetails();
      return { success: true };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected network error while saving update.';
      return {
        success: false,
        error: msg,
      };
    }
  };

  const handleClarificationSubmit = async (
    targetComplaintId: string,
    question: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiRequestClarification(targetComplaintId, question);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: res.error || 'Failed to submit clarification request.',
        };
      }
      await fetchComplaintDetails();
      return { success: true };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected error submitting clarification request.';
      return {
        success: false,
        error: msg,
      };
    }
  };

  const handleClarificationReplySubmit = async (
    targetComplaintId: string,
    reply: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiReplyClarification(targetComplaintId, reply);
      if (!res.success || !res.data) {
        return {
          success: false,
          error: res.error || 'Failed to submit clarification reply.',
        };
      }
      await fetchComplaintDetails();
      return { success: true };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unexpected error submitting clarification reply.';
      return {
        success: false,
        error: msg,
      };
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
  const maintDept = resolveDepartment(complaint.maintenance_department_id);
  const academicDept = resolveDepartment(complaint.student_department_id);
  const isCreator = Boolean(
    user &&
      complaint &&
      ((user as { id?: string }).id === complaint.student_user_id ||
        (user as { $id?: string }).$id === complaint.student_user_id)
  );
  const hasClarificationRequest = timeline.some(
    (entry) =>
      entry.entry_type === 'clarification_request' ||
      (entry.entry_type as string) === 'request_clarification'
  );

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
              departmentId={maintDept?.id ?? complaint.maintenance_department_id}
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
              disabled={isCreator}
              variant="detail"
            />
          </div>

          {/* Institutional Administrative Warnings Section */}
          {complaint && (warnings.length > 0 || (isPrincipal && complaint.status !== 'Resolved' && (Boolean(complaint.is_delayed) || calculateComplaintDelay(complaint).is_delayed))) && (
            <section className="mt-8 rounded-2xl border border-red-200 bg-red-50/40 p-5 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    <WarningCircle size={18} weight="bold" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 sm:text-base dark:text-white">
                      Institutional Administrative Warnings
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Formal directives issued by the Principal for complaints exceeding resolution milestones.
                    </p>
                  </div>
                </div>

                {isPrincipal && complaint.status !== 'Resolved' && (Boolean(complaint.is_delayed) || calculateComplaintDelay(complaint).is_delayed) && (
                  <button
                    type="button"
                    onClick={() => setIsIssueWarningModalOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                  >
                    <WarningCircle size={14} weight="bold" />
                    <span>Issue Warning</span>
                  </button>
                )}
              </div>

              {warnings.length === 0 ? (
                <div className="mt-4 rounded-xl border border-red-100 bg-white/80 p-4 text-xs text-slate-600 dark:border-red-950/40 dark:bg-slate-900/60 dark:text-slate-400">
                  This grievance has exceeded the 5-day resolution milestone. No formal administrative warnings have been issued yet.
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {warnings.map((w, idx) => (
                    <div
                      key={w.$id || idx}
                      className="rounded-xl border border-red-200 bg-white p-4 shadow-2xs dark:border-red-900/60 dark:bg-slate-900"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
                            Warning #{idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Issued by Principal
                          </span>
                          <span className="text-xs text-slate-500">• {formatTimelineDate(w.created_at)}</span>
                        </div>
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                          <Clock size={12} weight="bold" />
                          {w.days_delayed}d delayed
                        </span>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                        {w.warning_reason}
                      </p>

                      {w.admin_response ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                            <span>Maintenance Administrator Response:</span>
                            {w.responded_at && <span>{formatTimelineDate(w.responded_at)}</span>}
                          </div>
                          <p className="mt-1 text-slate-800 dark:text-slate-200">{w.admin_response}</p>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800">
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                            Awaiting response from Maintenance Administrator...
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedWarningForResponse(w);
                                setIsRespondWarningModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-900/60 dark:text-amber-200"
                            >
                              <ChatText size={12} weight="bold" />
                              <span>Respond to Warning</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Official Responses & Chronological Complaint Timeline */}
          <section className="mt-8 border-t border-slate-100 pt-6 dark:border-slate-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <ClockCounterClockwise
                  size={18}
                  weight="bold"
                  className="text-blue-700 dark:text-blue-400"
                />
                <h2 className="text-sm font-bold text-slate-900 sm:text-base dark:text-white">
                  Official Response &amp; Activity Timeline
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {timeline.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {complaint.status === 'Resolved' && complaint.resolved_at && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <CheckCircle size={13} weight="bold" />
                    <span>Resolved {formatTimelineDate(complaint.resolved_at)}</span>
                  </span>
                )}

                {isAdmin && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsClarificationModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 active:scale-95 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    >
                      <Question size={14} weight="bold" />
                      <span>Request Clarification</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsResolutionModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 active:scale-95 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/50"
                    >
                      <NotePencil size={14} weight="bold" />
                      <span>Update / Respond</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {timeline.length > 0 ? (
              <ol className="space-y-3">
                {timeline.map((entry, idx) => {
                  const meta = getTimelineEntryMeta(entry);
                  const authorLabel = getSafeTimelineAuthorLabel(
                    entry,
                    maintDept?.name || complaint.department_name
                  );
                  return (
                    <li
                      key={entry.$id || `${entry.entry_type}-${entry.created_at}-${idx}`}
                      className={`rounded-r-xl border border-l-4 p-4 ${meta.containerClass}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
                          >
                            {entry.entry_type === 'status_change' ? (
                              <ArrowsClockwise size={12} weight="bold" />
                            ) : entry.entry_type === 'progress_update' ? (
                              <CheckCircle size={12} weight="bold" />
                            ) : (
                              <ChatText size={12} weight="bold" />
                            )}
                            <span>{meta.title}</span>
                          </span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {authorLabel}
                          </span>
                        </div>
                        <time
                          dateTime={entry.created_at}
                          className="font-mono text-xs text-slate-500 dark:text-slate-400"
                        >
                          {formatTimelineDate(entry.created_at)}
                        </time>
                      </div>

                      {entry.entry_type === 'status_change' &&
                        entry.old_status &&
                        entry.new_status && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                            <ComplaintStatusBadge status={entry.old_status} size="sm" />
                            <span aria-hidden="true" className="font-bold text-slate-400">
                              →
                            </span>
                            <ComplaintStatusBadge status={entry.new_status} size="sm" />
                          </div>
                        )}

                      <p className="mt-2.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-700 sm:text-sm dark:text-slate-200">
                        {entry.content}
                      </p>
                    </li>
                  );
                })}
              </ol>
            ) : complaint.official_response ? (
              <div className="rounded-r-xl border border-l-4 border-slate-200 border-l-blue-700 bg-blue-50/20 p-5 dark:border-slate-800 dark:border-l-blue-500 dark:bg-blue-950/20">
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
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      Current Status:
                    </span>
                    <ComplaintStatusBadge status={complaint.status} size="sm" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/30 dark:text-slate-400">
                No administrative responses or status updates recorded yet.
              </div>
            )}

            {/* Student Clarification Reply Interface (Complaint Author Only) */}
            {isCreator && hasClarificationRequest && complaint.status !== 'Resolved' && (
              <ClarificationReplyBox
                complaintId={complaint.$id}
                onSubmit={handleClarificationReplySubmit}
              />
            )}
          </section>
        </article>
      </main>

      {isAdmin && (
        <>
          <AdminResolutionModal
            isOpen={isResolutionModalOpen}
            complaint={complaint}
            onClose={() => setIsResolutionModalOpen(false)}
            onSubmit={handleDetailResolutionSubmit}
          />
          <ClarificationRequestModal
            isOpen={isClarificationModalOpen}
            complaint={complaint}
            onClose={() => setIsClarificationModalOpen(false)}
            onSubmit={handleClarificationSubmit}
          />
        </>
      )}

      {isPrincipal && complaint && (
        <IssueWarningModal
          isOpen={isIssueWarningModalOpen}
          complaintId={complaint.$id}
          complaintTitle={complaint.title}
          departmentName={maintDept?.name || complaint.department_name}
          daysDelayed={calculateComplaintDelay(complaint).days_delayed}
          onClose={() => setIsIssueWarningModalOpen(false)}
          onSuccess={() => {
            setIsIssueWarningModalOpen(false);
            void fetchComplaintDetails();
          }}
        />
      )}

      {selectedWarningForResponse && (
        <RespondWarningModal
          isOpen={isRespondWarningModalOpen}
          warningId={selectedWarningForResponse.$id}
          complaintTitle={complaint?.title}
          warningReason={selectedWarningForResponse.warning_reason}
          daysDelayed={selectedWarningForResponse.days_delayed}
          onClose={() => {
            setIsRespondWarningModalOpen(false);
            setSelectedWarningForResponse(null);
          }}
          onSuccess={() => {
            setIsRespondWarningModalOpen(false);
            setSelectedWarningForResponse(null);
            void fetchComplaintDetails();
          }}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Protected Academic &amp; Maintenance Jurisdiction
      </footer>
    </div>
  );
}
