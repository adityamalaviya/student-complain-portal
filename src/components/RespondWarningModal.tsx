'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, WarningCircle, ChatText, CheckCircle } from '@phosphor-icons/react';
import { apiRespondToWarning } from '@/lib/api';

export interface RespondWarningModalProps {
  isOpen: boolean;
  warningId: string;
  complaintTitle?: string;
  warningReason?: string;
  daysDelayed?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function RespondWarningModal({
  isOpen,
  warningId,
  complaintTitle,
  warningReason,
  daysDelayed,
  onClose,
  onSuccess,
}: RespondWarningModalProps): React.ReactElement | null {
  const [adminResponse, setAdminResponse] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAdminResponse('');
      setErrorMessage(null);
      setIsSubmitting(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isOpen, warningId]);

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

  const trimmedResponse = adminResponse.trim();
  const isValidLength = trimmedResponse.length >= 10 && trimmedResponse.length <= 2000;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!isValidLength) {
      setErrorMessage('Response must be at least 10 characters (and up to 2000 characters).');
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await apiRespondToWarning({
        warning_id: warningId,
        admin_response: trimmedResponse,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to submit response.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : 'Network error submitting response.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="respond-warning-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
              <ChatText size={20} weight="bold" />
            </div>
            <div>
              <h2 id="respond-warning-title" className="text-base font-bold text-slate-900 dark:text-white">
                Respond to Principal Warning
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official Maintenance Department Escalation Response
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

        {/* Warning Context */}
        <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
          {complaintTitle && (
            <div className="font-semibold text-slate-900 dark:text-slate-100">{complaintTitle}</div>
          )}
          {warningReason && (
            <div className="text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-red-700 dark:text-red-400">Principal Warning: </span>
              {warningReason}
            </div>
          )}
          {typeof daysDelayed === 'number' && daysDelayed > 0 && (
            <div className="text-[11px] font-medium text-amber-800 dark:text-amber-400">
              Delayed by {daysDelayed} days
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="admin-warning-response-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Administrator Official Response / Remediation Plan <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Provide an authoritative update on current remediation steps, procurement, or estimated resolution timeline.
            </p>
            <div className="relative mt-2">
              <textarea
                ref={textareaRef}
                id="admin-warning-response-input"
                rows={4}
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                disabled={isSubmitting}
                placeholder="e.g. Technician dispatched; replacement parts arrived from vendor today. Issue will be resolved within 24 hours."
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span>Min 10 characters</span>
                <span className={trimmedResponse.length > 2000 ? 'text-red-500 font-bold' : ''}>
                  {trimmedResponse.length} / 2000
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
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} weight="bold" />
                  <span>Submit Response</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
