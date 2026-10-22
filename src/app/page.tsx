'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Buildings, ArrowRight, ShieldCheck, CheckCircle } from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';

export default function HomePage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isOnboarded, isAdmin } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      if (isAdmin) {
        router.push('/admin');
      } else if (isOnboarded) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center antialiased dark:bg-gray-950">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5 sm:p-10 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-md">
            <Buildings size={28} weight="bold" />
          </div>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            CampusVoice
          </h1>
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
            PORTAL
          </span>
        </div>

        <p className="mb-8 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Institutional student grievance and community advocacy platform. Resolving departmental issues with transparent oversight.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/sign-in"
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-xs transition hover:bg-blue-800 active:scale-[0.99] dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <span>Access Student Portal</span>
            <ArrowRight size={16} weight="bold" />
          </Link>

          <Link
            href="/api/health"
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            System Status &amp; Health Check
          </Link>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 border-t border-slate-100 pt-6 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck size={14} weight="bold" className="text-blue-700 dark:text-blue-400" />
            Appwrite Cloud Auth
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <CheckCircle size={14} weight="bold" className="text-emerald-600 dark:text-emerald-400" />
            Department Isolation
          </span>
        </div>
      </div>
    </main>
  );
}
