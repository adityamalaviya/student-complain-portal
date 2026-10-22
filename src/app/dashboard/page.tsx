'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Buildings,
  TerminalWindow,
  Plus,
  SignOut,
  Lock,
  CircleNotch,
  ChatCircleText,
  User,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';

export default function StudentDashboardPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isOnboarded, isAdmin, signOutUser } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (isAdmin) {
        router.push('/admin');
      } else if (!isOnboarded) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const isComputer = profile.department_code === '07';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand & Department Badge */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
                <Buildings size={20} weight="bold" />
              </div>
              <span className="text-base font-bold tracking-tight text-blue-700 dark:text-blue-400">
                CampusVoice
              </span>
            </div>

            <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              {isComputer ? <TerminalWindow size={14} weight="bold" /> : <Buildings size={14} weight="bold" />}
              <span>{profile.department_name}</span>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{profile.name}</p>
              <p className="flex items-center justify-end gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                <Lock size={10} weight="bold" />
                {profile.enrollment_no}
              </p>
            </div>

            <Link
              href="/complaints/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 active:scale-[0.99] dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus size={14} weight="bold" />
              <span className="hidden sm:inline">Raise Complaint</span>
              <span className="sm:hidden">New</span>
            </Link>

            <button
              type="button"
              onClick={signOutUser}
              title="Sign Out"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-red-400"
            >
              <SignOut size={16} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {/* Welcome Banner */}
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                <Lock size={12} weight="fill" />
                Verified Student Identity Active
              </div>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Welcome back, {profile.name}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enrollment: <span className="font-mono font-medium">{profile.enrollment_no}</span> • Jurisdiction:{' '}
                <span className="font-medium text-blue-700 dark:text-blue-400">{profile.department_name}</span>
              </p>
            </div>

            <Link
              href="/complaints/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              <Plus size={16} weight="bold" />
              <span>Submit New Grievance</span>
            </Link>
          </div>
        </div>

        {/* Phase 2 Operational Notice & Grievance Feed Placeholder */}
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
            <ChatCircleText size={24} weight="bold" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {profile.department_name} Grievance Queue Ready
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Authentication and profile lock verified successfully. In Phase 3, department complaints and campus-wide public issues will populate here.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Strict Department Isolation &amp; Ombudsman Protocol
      </footer>
    </div>
  );
}
