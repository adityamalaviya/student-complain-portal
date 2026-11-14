'use client';

import React, { useState } from 'react';
import { PaperPlaneRight, CircleNotch, ChatCircleText, WarningCircle } from '@phosphor-icons/react';

export interface ClarificationReplySubmitResult {
  success: boolean;
  error?: string;
}

interface ClarificationReplyBoxProps {
  complaintId: string;
  onSubmit: (complaintId: string, reply: string) => Promise<ClarificationReplySubmitResult | boolean>;
  onSuccess?: () => void;
}

export function ClarificationReplyBox({
  complaintId,
  onSubmit,
  onSuccess,
}: ClarificationReplyBoxProps): React.ReactElement {
  const [reply, setReply] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedReply = reply.trim();
  const isValidLength = trimmedReply.length >= 1 && trimmedReply.length <= 2000;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmitting || !isValidLength) return;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await onSubmit(complaintId, trimmedReply);
      const isSuccess = typeof res === 'boolean' ? res : res.success;
      if (isSuccess) {
        setReply('');
        if (onSuccess) onSuccess();
      } else if (typeof res === 'object' && res.error) {
        setErrorMessage(res.error);
      } else {
        setErrorMessage('Failed to send reply. Please try again.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error submitting reply.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
        <ChatCircleText size={16} weight="bold" />
        <span>Action Needed: Reply to Administrator Clarification</span>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        The maintenance team needs additional details from you to proceed with this grievance.
      </p>

      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <WarningCircle size={15} weight="bold" className="mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3">
        <textarea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          disabled={isSubmitting}
          placeholder="Provide the requested details here..."
          className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden focus:ring-1 focus:ring-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
        />

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {trimmedReply.length} / 2000 characters
          </span>
          <button
            type="submit"
            disabled={isSubmitting || !isValidLength}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-amber-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
          >
            {isSubmitting ? (
              <>
                <CircleNotch size={14} className="animate-spin" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <PaperPlaneRight size={14} weight="bold" />
                <span>Submit Reply</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

