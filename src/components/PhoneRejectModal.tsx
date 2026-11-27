'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, XCircle, WarningCircle, Phone, User } from '@phosphor-icons/react';
import type { PhoneChangeRequest } from '@/types';

export interface PhoneRejectModalProps {
  isOpen: boolean;
  request: PhoneChangeRequest | null;
  onClose: () => void;
  onSubmit: (requestId: string, reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function PhoneRejectModal({
  isOpen,
  request,
  onClose,
  onSubmit,
  isSubmitting = false,
}: PhoneRejectModalProps): React.ReactElement | null {
  const [reason, setReason] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSubmittingRef = useRef<boolean>(false);

  // Reset state when opening modal for a new request
  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setErrorMessage(null);
    isSubmittingRef.current = false;
    const focusTimer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    return (): void => clearTimeout(focusTimer);
  }, [isOpen, request]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen && !isSubmitting && !isSubmittingRef.current) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !request) return null;

  const reqId = (request as { request_id?: string }).request_id || request.$id;
  const trimmedReason = reason.trim();
  const isValidLength = trimmedReason.length >= 5 && trimmedReason.length <= 1000;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
    if (!isValidLength) {
      setErrorMessage('Rejection reason must be at least 5 characters (and max 1000 characters).');
      return;
    }
    setErrorMessage(null);
    isSubmittingRef.current = true;
    try {
      await onSubmit(reqId, trimmedReason);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit rejection.');
    } finally {
      isSubmittingRef.current = false;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-reject-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs sm:p-6"
    >
      {/* Backdrop overlay dismiss */}
      <div
        className="fixed inset-0 -z-10"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-red-50/50 p-5 dark:border-slate-800 dark:bg-red-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950/80 dark:text-red-400">
              <XCircle size={22} weight="bold" />
            </div>
            <div>
              <h2 id="phone-reject-title" className="text-base font-bold text-slate-900 dark:text-white">
                Reject Phone Change Request
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                A formal reason will be recorded in the FERPA audit log.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Request Context Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2 dark:border-slate-700/60">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                <User size={14} className="text-slate-500" />
                <span>{request.student_name || request.student_user_id || 'Student'}</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">ID: {reqId.slice(-8)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-slate-500 block">Current Phone</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {request.old_phone_number || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Requested Phone</span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                  {request.requested_phone_number || 'Not specified'}
                </span>
              </div>
            </div>

            {request.reason && (
              <div className="pt-1 text-[11px] italic text-slate-500 border-t border-slate-200/40 dark:border-slate-700/40">
                Student&apos;s reason: &ldquo;{request.reason}&rdquo;
              </div>
            )}
          </div>

          {/* Reason Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="rejection-reason" className="font-semibold text-slate-800 dark:text-slate-200">
                Reason for Rejection <span className="text-red-600">*</span>
              </label>
              <span
                className={`font-mono text-[11px] ${
                  trimmedReason.length > 0 && trimmedReason.length < 5
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                {trimmedReason.length} / 1000 chars (min 5)
              </span>
            </div>

            <textarea
              id="rejection-reason"
              ref={textareaRef}
              rows={3}
              required
              disabled={isSubmitting}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="State the administrative reason for rejecting this phone change (e.g., student identity could not be verified, phone format invalid, mismatched records)..."
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 transition focus:border-red-600 focus:outline-hidden focus:ring-2 focus:ring-red-600/20 disabled:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-red-500 dark:focus:ring-red-500/20"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
            >
              <WarningCircle size={16} weight="bold" className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isValidLength}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={14} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <XCircle size={14} weight="bold" />
                  <span>Confirm Rejection</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
