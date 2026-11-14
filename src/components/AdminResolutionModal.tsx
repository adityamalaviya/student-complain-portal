'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, CheckCircle, WarningCircle, Info } from '@phosphor-icons/react';
import type { Complaint, ComplaintStatus } from '@/types';
import { ComplaintPriorityBadge } from './ComplaintPriorityBadge';

export interface AdminResolutionSubmitResult {
  success: boolean;
  error?: string;
}

interface AdminResolutionModalProps {
  isOpen: boolean;
  complaint: Complaint | null;
  onClose: () => void;
  onSubmit: (
    complaintId: string,
    status: ComplaintStatus,
    officialResponse: string,
    isSubstantive?: boolean
  ) => Promise<AdminResolutionSubmitResult | boolean>;
}

function normalizeStatusForModal(status: ComplaintStatus): 'Pending' | 'In Progress' | 'Resolved' {
  if (status === 'In Progress' || status === 'in_progress') {
    return 'In Progress';
  }
  if (status === 'Resolved' || status === 'resolved') {
    return 'Resolved';
  }
  return 'Pending';
}

export function AdminResolutionModal({
  isOpen,
  complaint,
  onClose,
  onSubmit,
}: AdminResolutionModalProps): React.ReactElement | null {
  const [status, setStatus] = useState<ComplaintStatus>('In Progress');
  const [officialResponse, setOfficialResponse] = useState<string>('');
  const [isSubstantive, setIsSubstantive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmittingRef = useRef<boolean>(false);
  const lastOpenedKeyRef = useRef<string>('');

  // Initialize form state only when opening the modal for a complaint; preserve unsaved input on errors.
  useEffect(() => {
    if (!isOpen || !complaint) {
      lastOpenedKeyRef.current = '';
      return;
    }

    const openKey = `${isOpen}:${complaint.$id}`;
    if (lastOpenedKeyRef.current !== openKey) {
      lastOpenedKeyRef.current = openKey;
      setStatus(normalizeStatusForModal(complaint.status));
      setOfficialResponse('');
      setIsSubstantive(false);
      setErrorMessage(null);
    }
  }, [isOpen, complaint]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !complaint) return null;

  const shortId = complaint.$id ? complaint.$id.slice(-6).toUpperCase() : '000000';
  const currentCanonicalStatus = normalizeStatusForModal(complaint.status);
  const selectedCanonicalStatus = normalizeStatusForModal(status);
  const canSelectPending = currentCanonicalStatus === 'Pending';
  const showSubstantiveOption = selectedCanonicalStatus !== 'Resolved';

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    setErrorMessage(null);

    if (!canSelectPending && selectedCanonicalStatus === 'Pending') {
      setErrorMessage(
        "Cannot revert an 'In Progress' or 'Resolved' complaint back to 'Pending'."
      );
      return;
    }

    const trimmedResponse = officialResponse.trim();
    if (trimmedResponse.length < 5) {
      setErrorMessage('Official department response must be at least 5 characters.');
      return;
    }
    if (trimmedResponse.length > 1000) {
      setErrorMessage('Official department response cannot exceed 1000 characters.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const result = await onSubmit(
        complaint.$id,
        selectedCanonicalStatus,
        trimmedResponse,
        showSubstantiveOption ? isSubstantive : undefined
      );
      const isSuccess = typeof result === 'boolean' ? result : result.success;
      if (isSuccess) {
        onClose();
      } else {
        const msg =
          typeof result === 'object' && result.error
            ? result.error
            : 'Failed to persist department response. Please try again.';
        setErrorMessage(msg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update complaint';
      setErrorMessage(msg);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7 dark:border-slate-800 dark:bg-slate-900">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close modal"
          className="absolute right-5 top-5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={18} weight="bold" />
        </button>

        {/* Modal Header */}
        <div className="pr-8">
          <div className="flex items-center gap-2">
            <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-blue-700 uppercase dark:bg-blue-950 dark:text-blue-300">
              #CV-{shortId}
            </span>
            <ComplaintPriorityBadge priority={complaint.priority} />
          </div>
          <h3 className="mt-2 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Update Grievance #{shortId}
          </h3>
          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
            {complaint.title}
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Filer:{' '}
            <span className="font-medium text-slate-600 dark:text-slate-300">
              {complaint.student_name ?? 'Student'}
            </span>{' '}
            ({complaint.student_enrollment_no ?? '—'})
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {complaint.official_response && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Latest Persisted Response
              </p>
              <p className="mt-1 line-clamp-2 whitespace-pre-wrap">{complaint.official_response}</p>
            </div>
          )}

          {/* Investigation Status Segmented Switch */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Investigation Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs font-semibold dark:border-slate-800 dark:bg-slate-800/80">
              <button
                type="button"
                disabled={isSubmitting || !canSelectPending}
                title={
                  canSelectPending
                    ? 'Keep status as Pending while recording a timeline note'
                    : 'Cannot revert once In Progress or Resolved'
                }
                onClick={() => setStatus('Pending')}
                className={`rounded-lg py-2 transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  selectedCanonicalStatus === 'Pending'
                    ? 'bg-white text-amber-800 shadow-2xs dark:bg-slate-900 dark:text-amber-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStatus('In Progress')}
                className={`rounded-lg py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedCanonicalStatus === 'In Progress'
                    ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-900 dark:text-blue-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                In Progress
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setStatus('Resolved')}
                className={`rounded-lg py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedCanonicalStatus === 'Resolved'
                    ? 'bg-white text-emerald-700 shadow-2xs dark:bg-slate-900 dark:text-emerald-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Resolved
              </button>
            </div>
            {selectedCanonicalStatus === 'Pending' && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <Info size={14} weight="bold" className="mt-0.5 shrink-0" />
                <span>
                  Status remains Pending; your note will be persisted as a complaint timeline entry.
                </span>
              </p>
            )}
          </div>

          {/* Substantive Progress Toggle */}
          {showSubstantiveOption && (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
              <input
                type="checkbox"
                checked={isSubstantive}
                disabled={isSubmitting}
                onChange={(e) => setIsSubstantive(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 dark:border-slate-600 dark:bg-slate-800"
              />
              <span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Record as substantive progress update
                </span>
                <span className="mt-0.5 block text-slate-500 dark:text-slate-400">
                  Stores a dedicated progress update entry for technician work or verified action.
                </span>
              </span>
            </label>
          )}

          {/* Official Department Notes */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="modalRemarks"
                className="text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                Official Department Remarks <span className="text-red-500">*</span>
              </label>
              <span className="font-mono text-xs text-slate-400">Timeline Persisted</span>
            </div>
            <textarea
              id="modalRemarks"
              rows={4}
              required
              disabled={isSubmitting}
              value={officialResponse}
              onChange={(e) => setOfficialResponse(e.target.value)}
              placeholder="Enter official department remarks, technician dispatch notes, or resolution confirmation..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs leading-relaxed text-slate-900 transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 focus:outline-none disabled:opacity-60 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              This response is stored permanently in the complaint timeline for authorized viewers.
            </p>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 active:scale-95 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} weight="bold" />
                  <span>Save Update</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
