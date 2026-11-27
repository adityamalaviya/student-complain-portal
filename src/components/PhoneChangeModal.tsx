'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Phone,
  ShieldCheck,
  WarningCircle,
  CheckCircle,
  CircleNotch,
  Clock,
  ArrowRight,
  Lock,
} from '@phosphor-icons/react';
import {
  apiRequestPhoneChange,
  apiCompletePhoneChange,
  apiListPhoneChangeRequests,
} from '@/lib/api';
import { getPhoneChangeWorkflowState, normalizePhoneInput } from '@/lib/utils';
import type { PhoneChangeRequest } from '@/types';

interface PhoneChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhoneNumber: string;
  academicDepartmentName: string;
  onPhoneUpdated?: (newPhone: string) => Promise<void> | void;
}

const PHONE_REGEX = /^[6-9]\d{9}$/;

export function PhoneChangeModal({
  isOpen,
  onClose,
  currentPhoneNumber,
  academicDepartmentName,
  onPhoneUpdated,
}: PhoneChangeModalProps): React.ReactElement | null {
  const [requests, setRequests] = useState<PhoneChangeRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [completedPhone, setCompletedPhone] = useState<string | null>(null);

  // Form states
  const [reason, setReason] = useState<string>('');
  const [requestedPhone, setRequestedPhone] = useState<string>('');
  const [newPhoneNumber, setNewPhoneNumber] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [forceNewRequest, setForceNewRequest] = useState<boolean>(false);

  const isSubmittingRef = useRef<boolean>(false);
  const loadSeqRef = useRef<number>(0);

  // Load existing requests for this student
  const loadRequests = useCallback(async (): Promise<void> => {
    const seq = ++loadSeqRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await apiListPhoneChangeRequests();
      if (seq !== loadSeqRef.current) return;
      if (res.success && res.data) {
        setRequests(res.data.requests || []);
      } else if (res.error) {
        setErrorMessage(res.error);
      }
    } catch {
      if (seq === loadSeqRef.current) {
        setErrorMessage('Unable to load phone change request history.');
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      loadSeqRef.current += 1;
      return;
    }
    void loadRequests();
    setReason('');
    setRequestedPhone('');
    setNewPhoneNumber('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setCompletedPhone(null);
    setForceNewRequest(false);
    isSubmittingRef.current = false;
  }, [isOpen, loadRequests]);

  // Handle ESC key to dismiss dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isOpen && !isSubmitting && !isSubmittingRef.current) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Explicit state-machine resolution for student phone change flow
  const activeRequest = requests[0] ?? null;
  const workflowState = getPhoneChangeWorkflowState(activeRequest, forceNewRequest);

  // Handler: Submit phone change request
  const handleSubmitRequest = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;
    setErrorMessage(null);

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setErrorMessage('Reason must be at least 10 characters long.');
      return;
    }
    if (trimmedReason.length > 1000) {
      setErrorMessage('Reason cannot exceed 1000 characters.');
      return;
    }

    const trimmedRequestedPhone = requestedPhone.trim();
    if (trimmedRequestedPhone.length > 0 && !PHONE_REGEX.test(trimmedRequestedPhone)) {
      setErrorMessage('Requested phone number must be exactly 10 digits starting with 6, 7, 8, or 9.');
      return;
    }
    if (trimmedRequestedPhone.length > 0 && trimmedRequestedPhone === currentPhoneNumber) {
      setErrorMessage('Requested phone number cannot be the same as your current phone number.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await apiRequestPhoneChange({
        reason: trimmedReason,
        ...(trimmedRequestedPhone.length > 0 ? { requested_phone_number: trimmedRequestedPhone } : {}),
      });

      if (res.success && res.data) {
        setSuccessMessage('Phone change request submitted to your Academic Department Administrator.');
        setReason('');
        setRequestedPhone('');
        setForceNewRequest(false);
        await loadRequests();
      } else {
        setErrorMessage(res.error || 'Failed to submit phone change request.');
      }
    } catch {
      setErrorMessage('Network error submitting request. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Handler: Complete phone change using one-time permission
  const handleCompleteUpdate = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!activeRequest || isSubmittingRef.current || isSubmitting) return;
    setErrorMessage(null);

    const trimmedPhone = newPhoneNumber.trim();
    if (!PHONE_REGEX.test(trimmedPhone)) {
      setErrorMessage('Phone number must be exactly 10 digits and begin with 6, 7, 8, or 9.');
      return;
    }

    if (trimmedPhone === currentPhoneNumber) {
      setErrorMessage('New phone number cannot be identical to your current phone number.');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await apiCompletePhoneChange({
        request_id: activeRequest.$id,
        new_phone_number: trimmedPhone,
      });

      if (res.success && res.data) {
        setCompletedPhone(trimmedPhone);
        setSuccessMessage('Phone number updated successfully! The number is now locked.');
        if (onPhoneUpdated) {
          await onPhoneUpdated(trimmedPhone);
        }
        await loadRequests();
      } else {
        setErrorMessage(res.error || 'Failed to complete phone number update.');
      }
    } catch {
      setErrorMessage('Network error updating phone number. Please try again.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="phone-change-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
              <Phone size={18} weight="bold" />
            </div>
            <div>
              <h2
                id="phone-change-modal-title"
                className="text-base font-semibold text-slate-900 dark:text-slate-100"
              >
                Student Phone Number Update
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Routed to {academicDepartmentName} Academic Administrator
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Current Phone Status Banner */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/50">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Current Registered Phone:</span>
              <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                +91 {currentPhoneNumber}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-slate-200/80 px-2.5 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Lock size={12} weight="bold" />
              <span className="font-medium">Locked</span>
            </div>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <WarningCircle size={16} weight="fill" className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle size={16} weight="fill" className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <CircleNotch size={24} className="animate-spin text-blue-600" />
            </div>
          ) : completedPhone ? (
            /* STATE 0: COMPLETED CONFIRMATION */
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle size={18} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
                  <span>Phone Number Updated &amp; Locked</span>
                </div>
                <p className="mt-1 text-emerald-800 dark:text-emerald-300">
                  Your registered mobile number is now updated to{' '}
                  <span className="font-mono font-semibold">+91 {completedPhone}</span> and locked against modification.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : workflowState === 'approved_ready' && activeRequest ? (
            /* STATE 1: ONE-TIME PERMISSION GRANTED */
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldCheck size={18} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
                  <span>One-Time Update Permission Granted</span>
                </div>
                <p className="mt-1 text-emerald-800 dark:text-emerald-300">
                  Your academic Department Administrator has approved your request. Enter your new phone number below. This one-time permission will be consumed upon successful database save.
                </p>
                {activeRequest.decision_reason && (
                  <p className="mt-2 text-xs italic text-emerald-700 dark:text-emerald-400">
                    Admin note: &quot;{activeRequest.decision_reason}&quot;
                  </p>
                )}
              </div>

              <form onSubmit={handleCompleteUpdate} noValidate className="space-y-3">
                <div>
                  <label htmlFor="new_phone_input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    New 10-Digit Mobile Number
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-medium text-slate-400">
                      +91
                    </span>
                    <input
                      id="new_phone_input"
                      type="tel"
                      inputMode="numeric"
                      value={newPhoneNumber}
                      onChange={(e) => {
                        setNewPhoneNumber(normalizePhoneInput(e.target.value, newPhoneNumber));
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={activeRequest.requested_phone_number || '9876543210'}
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-11 pr-3 text-sm font-mono text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      aria-required="true"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Must start with 6, 7, 8, or 9 and be exactly 10 digits.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <CircleNotch size={14} className="animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={14} weight="bold" />
                        <span>Update &amp; Lock Phone</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : workflowState === 'pending_review' && activeRequest ? (
            /* STATE 2: PENDING REVIEW */
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <Clock size={18} weight="bold" className="text-amber-600 dark:text-amber-400" />
                  <span>Request Under Academic Review</span>
                </div>
                <p className="mt-1 text-amber-800 dark:text-amber-300">
                  Your request has been forwarded to the {academicDepartmentName} Academic Department Administrator. You will receive one-time update permission once verified.
                </p>
                <div className="mt-3 rounded-md bg-white/70 p-2.5 text-xs dark:bg-slate-900/70">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Submitted Reason:</span>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">{activeRequest.reason}</p>
                  {activeRequest.requested_phone_number && (
                    <p className="mt-1 text-slate-500 font-mono">
                      Proposed: +91 {activeRequest.requested_phone_number}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          ) : workflowState === 'rejected' && activeRequest ? (
            /* STATE 3: REJECTED */
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                <div className="flex items-center gap-2 font-semibold">
                  <WarningCircle size={18} weight="bold" className="text-red-600 dark:text-red-400" />
                  <span>Request Rejected by Academic Admin</span>
                </div>
                {activeRequest.decision_reason && (
                  <p className="mt-1 text-red-800 dark:text-red-300">
                    Reason: &quot;{activeRequest.decision_reason}&quot;
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setForceNewRequest(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  <span>Submit a new request</span>
                  <ArrowRight size={12} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* STATE 4: SUBMIT NEW REQUEST FORM */
            <form onSubmit={handleSubmitRequest} noValidate className="space-y-4">
              <div>
                <label htmlFor="reason_input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Reason for Phone Number Change <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="reason_input"
                  rows={3}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Explain why your mobile number has changed (e.g., lost SIM, network port, or new personal device)..."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  aria-required="true"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                  <span>Minimum 10 characters</span>
                  <span>{reason.trim().length} / 1000</span>
                </div>
              </div>

              <div>
                <label htmlFor="requested_phone_input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Proposed New Number (Optional)
                </label>
                <div className="relative mt-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-medium text-slate-400">
                    +91
                  </span>
                  <input
                    id="requested_phone_input"
                    type="tel"
                    inputMode="numeric"
                    value={requestedPhone}
                    onChange={(e) => {
                      setRequestedPhone(normalizePhoneInput(e.target.value, requestedPhone));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="9876543210"
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-11 pr-3 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  You can specify the proposed number now or provide it once approved.
                </p>
              </div>

              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                <span className="font-semibold">Security Note:</span> To prevent unauthorized identity modifications, student phone number changes require formal academic verification before locking the new number.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
                >
                  {isSubmitting ? (
                    <>
                      <CircleNotch size={14} className="animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRight size={14} weight="bold" />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
