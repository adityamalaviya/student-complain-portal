'use client';

import React, { useState } from 'react';
import { Check, ThumbsUp, CircleNotch } from '@phosphor-icons/react';

interface ComplaintSupportButtonProps {
  complaintId: string;
  supportCount: number;
  hasSupported: boolean;
  onToggleSupport?: (complaintId: string) => Promise<void> | void;
  disabled?: boolean;
  variant?: 'card' | 'detail';
  className?: string;
}

export function ComplaintSupportButton({
  complaintId,
  supportCount,
  hasSupported,
  onToggleSupport,
  disabled = false,
  variant = 'card',
  className = '',
}: ComplaintSupportButtonProps): React.ReactElement {
  const [isPending, setIsPending] = useState<boolean>(false);

  const handleClick = async (e: React.MouseEvent): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isPending || hasSupported || !onToggleSupport) {
      return;
    }

    try {
      setIsPending(true);
      await onToggleSupport(complaintId);
    } finally {
      setIsPending(false);
    }
  };

  if (variant === 'detail') {
    if (hasSupported) {
      return (
        <button
          type="button"
          disabled
          aria-label="Supported"
          className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition sm:w-auto dark:bg-blue-600 ${className}`}
        >
          <Check size={18} weight="bold" />
          <span>Supported · {supportCount}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isPending}
        aria-label="Support this issue"
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-xs transition hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 ${className}`}
      >
        {isPending ? (
          <CircleNotch size={18} className="animate-spin text-blue-700 dark:text-blue-400" />
        ) : (
          <ThumbsUp size={18} weight="bold" className="text-slate-600 dark:text-slate-400" />
        )}
        <span>{isPending ? 'Supporting...' : `Support · ${supportCount}`}</span>
      </button>
    );
  }

  // Card Variant (Screen 3)
  if (hasSupported) {
    return (
      <button
        type="button"
        disabled
        aria-label="Supported"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-blue-200/80 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition dark:border-blue-900/80 dark:bg-blue-950/60 dark:text-blue-300 ${className}`}
      >
        <Check size={14} weight="bold" />
        <span>Supported · {supportCount}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      aria-label="Support this issue"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-800 ${className}`}
    >
      {isPending ? (
        <CircleNotch size={14} className="animate-spin text-blue-700 dark:text-blue-400" />
      ) : (
        <ThumbsUp size={14} weight="bold" className="text-slate-500 dark:text-slate-400" />
      )}
      <span>{isPending ? 'Supporting...' : `Support · ${supportCount}`}</span>
    </button>
  );
}
