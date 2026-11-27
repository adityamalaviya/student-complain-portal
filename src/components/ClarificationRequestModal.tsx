'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, Question, WarningCircle } from '@phosphor-icons/react';
import { normalizeComplaintStatus } from '@/lib/utils';
import type { Complaint } from '@/types';

export interface ClarificationSubmitResult {
  success: boolean;
  error?: string;
}

interface ClarificationRequestModalProps {
  isOpen: boolean;
  complaint: Complaint | null;
  onClose: () => void;
  onSubmit: (complaintId: string, question: string) => Promise<ClarificationSubmitResult | boolean>;
}

export function ClarificationRequestModal({
  isOpen,
  complaint,
  onClose,
  onSubmit,
}: ClarificationRequestModalProps): React.ReactElement | null {
  const [question, setQuestion] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSubmittingRef = useRef<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setQuestion('');
      setErrorMessage(null);
    }
  }, [isOpen, complaint?.$id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen && !isSubmittingRef.current) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !complaint) {
    return null;
  }

  const isResolved = normalizeComplaintStatus(complaint.status) === 'Resolved';
  const trimmedQuestion = question.trim();
  const isValidLength = trimmedQuestion.length >= 5 && trimmedQuestion.length <= 2000;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;

    if (isResolved) {
      setErrorMessage('Cannot request clarification on a resolved complaint.');
      return;
    }

    if (!isValidLength) {
      setErrorMessage('Clarification request must be between 5 and 2000 characters.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    isSubmittingRef.current = true;

    try {
      const res = await onSubmit(complaint.$id, trimmedQuestion);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      if (isSuccess) {
        onClose();
      } else if (typeof res === 'object' && res.error) {
        setErrorMessage(res.error);
      } else {
        setErrorMessage('Failed to send clarification request. Please retry.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error submitting request.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clarification-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isSubmittingRef.current && !isSubmitting) onClose();
        }}
      />

      {/* Modal Surface */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <Question size={20} weight="bold" />
            </div>
            <div>
              <h2
                id="clarification-modal-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                Request Clarification
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Inquire directly with the complaint author
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
            <p className="flex-1">{errorMessage}</p>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="clarification-question"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Question or Clarification Inquiry{' '}
              <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Ask for specific missing details (e.g., room number, exact equipment tag, photo evidence).
            </p>
            <textarea
              id="clarification-question"
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. Could you please specify which bench in Lab 304 has the broken network port?"
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Min 5 characters</span>
              <span className={trimmedQuestion.length > 2000 ? 'font-bold text-red-500' : ''}>
                {trimmedQuestion.length} / 2000
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isValidLength || isResolved}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Send Request</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

