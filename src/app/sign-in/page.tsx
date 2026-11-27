'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Buildings,
  ShieldCheck,
  CheckCircle,
  Question,
  WarningCircle,
  GraduationCap,
  X,
  Info,
} from '@phosphor-icons/react';
import { useAuth, useAuthGuard } from '@/lib/hooks';

function SignInContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  useAuthGuard('guest_or_redirect');
  const [isHelpdeskOpen, setIsHelpdeskOpen] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const rawError = searchParams.get('error');
  const errorMsg = searchParams.get('message') || searchParams.get('error_description') || (rawError && rawError !== 'oauth_failed' ? rawError : null);
  const oauthError = Boolean(rawError);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && isHelpdeskOpen) {
        setIsHelpdeskOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [isHelpdeskOpen]);

  const handleGoogleSignIn = (): void => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    signIn();
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 text-slate-900 antialiased selection:bg-blue-600 selection:text-white dark:bg-gray-950 dark:text-slate-100">
      {/* Top Institutional Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
              <Buildings size={20} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-blue-700 dark:text-blue-400">
                  CampusVoice
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-blue-700 uppercase dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
                  PORTAL
                </span>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                Collegiate Governance &amp; Student Ombudsman
              </p>
            </div>
          </div>

          {/* Operational Status */}
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 md:flex dark:border-slate-700 dark:bg-slate-800">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
              </span>
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Academic Year 2024-2025 • Operational
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsHelpdeskOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
            >
              <Question size={16} weight="bold" />
              <span>Helpdesk</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Auth Canvas */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-lg">
          {/* Card Container */}
          <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
            {/* Academic Shield Emblem */}
            <div className="-mt-2 mb-6 flex justify-center">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 p-0.5 shadow-md">
                  <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-white dark:bg-slate-900">
                    <ShieldCheck size={32} weight="fill" className="text-blue-700 dark:text-blue-400" />
                  </div>
                </div>
                <div className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full bg-white p-0.5 shadow-xs dark:bg-slate-900">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-blue-700 text-white">
                    <GraduationCap size={13} weight="fill" />
                  </div>
                </div>
              </div>
            </div>

            {/* Headline */}
            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Sign in to CampusVoice
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Access your department grievance feed, track community issues, and support campus resolutions with your Google account.
              </p>
            </div>

            {/* OAuth Failure Banner */}
            {oauthError && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold">
                    Google sign-in could not be completed.
                  </p>
                  {errorMsg ? (
                    <p className="text-xs font-mono text-red-700 dark:text-red-300">
                      Reason: {errorMsg}
                    </p>
                  ) : (
                    <p className="text-xs text-red-700 dark:text-red-300">
                      Please check the browser console or your OAuth credentials and try again.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Google OAuth Action Button */}
            <div className="space-y-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isSigningIn}
                className="group flex w-full items-center justify-center gap-3.5 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-sm font-bold text-slate-800 shadow-xs transition-all hover:bg-slate-50 hover:shadow-sm active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
              >
                {/* Google Official Logo SVG */}
                <svg className="h-5 w-5 transition-transform group-hover:scale-105" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span>{isSigningIn ? 'Redirecting to Google...' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="mx-4 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                  Google Account Sign-In
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>
            </div>

            {/* Guidance Banner */}
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 dark:border-blue-900/40 dark:bg-blue-950/30">
              <ShieldCheck size={20} weight="bold" className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Sign in with Google
                </p>
                <p className="text-xs leading-snug text-slate-600 dark:text-slate-400">
                  Sign in with your Google account. First-time students will complete a quick 1-step profile confirmation.
                </p>
              </div>
            </div>

            {/* Security Compliance Badges */}
            <div className="mt-6 space-y-2 border-t border-slate-200 pt-6 dark:border-slate-800">
              <p className="mb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                Institutional Compliance &amp; Protocol
              </p>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck size={18} weight="fill" className="text-blue-700 dark:text-blue-400" />
                    <span className="text-xs font-medium">Protected with Appwrite Cloud Auth</span>
                  </div>
                  <CheckCircle size={16} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200">
                  <div className="flex items-center gap-2.5">
                    <GraduationCap size={18} weight="fill" className="text-blue-700 dark:text-blue-400" />
                    <span className="text-xs font-medium">Verified Student Identification</span>
                  </div>
                  <CheckCircle size={16} weight="fill" className="text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Strict Department Isolation &amp; Ombudsman Protocol
      </footer>

      {/* Helpdesk Guidance Modal */}
      {isHelpdeskOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="helpdesk-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsHelpdeskOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Question size={20} weight="bold" />
                </div>
                <div>
                  <h2
                    id="helpdesk-modal-title"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    CampusVoice Sign-In Helpdesk
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Authentication &amp; Onboarding Guidance
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpdeskOpen(false)}
                aria-label="Close helpdesk dialog"
                className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-slate-900 dark:text-white">
                  1. Google Sign-In Issues
                </p>
                <p className="mt-1">
                  Ensure third-party cookies and pop-ups/redirects are allowed for this site, and sign in with your Google account.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="font-semibold text-slate-900 dark:text-white">
                  2. First-Time Student Verification
                </p>
                <p className="mt-1">
                  New students must confirm their full name, 12-digit enrollment number, and 10-digit Indian mobile number during onboarding.
                </p>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                <Info size={16} weight="bold" className="mt-0.5 shrink-0" />
                <p>
                  For enrollment code discrepancies, locked profile corrections, or administrator access, contact your Academic Department Administrator or the College Ombudsman Office.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsHelpdeskOpen(false)}
                className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignInPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-700 border-t-transparent dark:border-blue-400"></div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
