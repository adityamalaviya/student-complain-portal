'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, WarningCircle, Clock, Buildings } from '@phosphor-icons/react';
import { apiIssueWarning } from '@/lib/api';

export interface IssueWarningModalProps {
  isOpen: boolean;
  complaintId: string;
  complaintTitle: string;
  departmentName?: string;
  daysDelayed: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function IssueWarningModal({
  isOpen,
  complaintId,
  complaintTitle,
  departmentName,
  daysDelayed,
  onClose,
  onSuccess,
}: IssueWarningModalProps): React.ReactElement | null {
  const [warningReason, setWarningReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setWarningReason('');
      setErrorMessage(null);
      setIsSubmitting(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen, complaintId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const trimmedReason = warningReason.trim();
  const isValidLength = trimmedReason.length >= 10 && trimmedReason.length <= 2000;
  const shortId = complaintId.slice(-6).toUpperCase();

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!isValidLength) {
      setErrorMessage('Warning reason must be at least 10 characters (and up to 2000 characters).');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await apiIssueWarning({
        complaint_id: complaintId,
        warning_reason: trimmedReason,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to issue warning.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : 'Network error issuing warning.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-warning-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
              <WarningCircle size={20} weight="bold" />
            </div>
            <div>
              <h2 id="issue-warning-title" className="text-base font-bold text-slate-900 dark:text-white">
                Issue Formal Administrative Warning
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grievance #{shortId} — delayed by {daysDelayed} days
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close modal"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Complaint Context Summary */}
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
          <div className="font-semibold text-slate-900 dark:text-slate-100">{complaintTitle}</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {departmentName && (
              <span className="flex items-center gap-1">
                <Buildings size={14} className="text-slate-400" />
                <span>{departmentName}</span>
              </span>
            )}
            <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
              <Clock size={14} />
              <span>{daysDelayed} days without resolution</span>
            </span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="warning-reason-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Warning Reason / Directives <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              State the reason for this administrative escalation and provide directives to the assigned Maintenance
              Administrator.
            </p>
            <div className="relative mt-2">
              <textarea
                ref={textareaRef}
                id="warning-reason-input"
                rows={4}
                value={warningReason}
                onChange={(e) => setWarningReason(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. This grievance has exceeded the 5-day institutional milestone without adequate progress updates. Immediate remediation is required within 24 hours."
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:outline-hidden focus:ring-2 focus:ring-red-500/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
              />
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span
                  className={
                    trimmedReason.length > 0 && trimmedReason.length < 10
                      ? 'font-medium text-amber-600 dark:text-amber-400'
                      : 'text-slate-400'
                  }
                >
                  Min 10 characters
                </span>
                <span
                  className={
                    trimmedReason.length > 2000
                      ? 'font-bold text-red-500'
                      : trimmedReason.length > 0 && trimmedReason.length < 10
                      ? 'font-medium text-amber-600 dark:text-amber-400'
                      : 'text-slate-400'
                  }
                >
                  {trimmedReason.length} / 2000
                </span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValidLength || isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Issuing Warning...</span>
                </>
              ) : (
                <>
                  <WarningCircle size={14} weight="bold" />
                  <span>Issue Warning</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
