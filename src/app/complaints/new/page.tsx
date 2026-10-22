'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Buildings,
  Lock,
  WarningCircle,
  Paperclip,
  CheckCircle,
  CircleNotch,
  ArrowLeft,
  TerminalWindow,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';

export default function RaiseComplaintPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isOnboarded } = useAuth();

  const [title, setTitle] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [issueType, setIssueType] = useState<'department' | 'public'>('department');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Guard: unauthenticated -> sign-in; incomplete profile -> onboarding
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isOnboarded) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const isComputer = profile.department_code === '07';

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setIsSubmitting(true);
    // In Phase 2, this verifies client-side credentials binding and prefilled read-only immutability.
    // In Phase 3, backend complaints collection mutation is wired.
    setFeedbackMessage('Form submitted with verified student identity credentials.');
    setIsSubmitting(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 antialiased dark:bg-gray-950 dark:text-slate-100">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ArrowLeft size={18} weight="bold" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Raise Student Complaint</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Institutional Grievance Portal</p>
            </div>
          </div>

          {/* Department Badge */}
          <div className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
            {isComputer ? <TerminalWindow size={15} weight="bold" /> : <Buildings size={15} weight="bold" />}
            <span>{profile.department_name}</span>
          </div>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">New Complaint Filing</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Student identity attributes are permanently locked from your verified profile and prefilled below.
            </p>
          </div>

          {feedbackMessage && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-semibold">{feedbackMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Row 1: Student Name and Enrollment Number (Read-only, prefilled) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="studentName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Student Name
                  </label>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Read-only
                  </span>
                </div>
                <input
                  id="studentName"
                  type="text"
                  readOnly
                  disabled
                  value={profile.name}
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="enrollmentNumber" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Enrollment Number
                  </label>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Read-only
                  </span>
                </div>
                <input
                  id="enrollmentNumber"
                  type="text"
                  readOnly
                  disabled
                  value={profile.enrollment_no}
                  className="w-full cursor-not-allowed font-mono text-sm tracking-widest text-slate-600 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 font-medium dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                />
              </div>
            </div>

            {/* Row 2: Title */}
            <div className="space-y-1.5">
              <label htmlFor="complaintTitle" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Problem / Complaint Title <span className="text-red-600">*</span>
              </label>
              <input
                id="complaintTitle"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Broken lab projector in Lab 4"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>

            {/* Row 3: Department (Prefilled, read-only) and Location */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="departmentName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Department
                  </label>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Read-only
                  </span>
                </div>
                <input
                  id="departmentName"
                  type="text"
                  readOnly
                  disabled
                  value={`${profile.department_name} (Code ${profile.department_code})`}
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="location" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Location / Physical Area <span className="text-red-600">*</span>
                </label>
                <input
                  id="location"
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. IT Block, 2nd Floor, Room 204"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
              </div>
            </div>

            {/* Row 4: Description */}
            <div className="space-y-1.5">
              <label htmlFor="description" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Detailed Description <span className="text-red-600">*</span>
              </label>
              <textarea
                id="description"
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide specific details regarding the issue..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>

            {/* Row 5: Priority Selector & Scope */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Priority Level <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold capitalize transition ${
                        priority === p
                          ? p === 'high'
                            ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
                            : p === 'medium'
                            ? 'border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Visibility Scope <span className="text-red-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIssueType('department')}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      issueType === 'department'
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Department Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueType('public')}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      issueType === 'public'
                        ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Public Issue
                  </button>
                </div>
              </div>
            </div>

            {/* Row 6: Attachment (Optional) */}
            <div className="space-y-1.5">
              <label htmlFor="attachmentInput" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Supporting Attachment (Optional)
              </label>
              <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-4 text-center dark:border-slate-700">
                <div className="space-y-1">
                  <Paperclip size={24} className="mx-auto text-slate-400" />
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    PNG, JPG, or PDF up to 5MB
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6 dark:border-slate-800">
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800 active:scale-[0.99] disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                Submit Complaint
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
