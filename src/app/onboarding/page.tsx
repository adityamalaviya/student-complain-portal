'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Buildings,
  CheckCircle,
  Warning,
  WarningCircle,
  IdentificationBadge,
  Lock,
  ArrowRight,
  TerminalWindow,
  Lightning,
  Gear,
  CircleNotch,
  Phone,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import { apiCompleteOnboarding } from '@/lib/api';
import { StrictOnboardingSchema, PhoneNumberSchema } from '@/lib/schemas';
import {
  ENROLLMENT_CODE_MAPPINGS,
  extractAndMapEnrollment,
  resolveDepartment,
  resolveEnrollmentCode,
} from '@/lib/utils';

export default function OnboardingPage(): React.ReactElement {
  const router = useRouter();
  const { user, loading, isOnboarded, isAdmin, isPrincipal, setProfileState, refreshProfile } = useAuth();

  const [name, setName] = useState<string>('');
  const [enrollmentNo, setEnrollmentNo] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const nameInitialized = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<boolean>(false);

  useEffect(() => {
    if (user?.name && !nameInitialized.current) {
      setName(user.name);
      nameInitialized.current = true;
    }
  }, [user]);

  useEffect(() => {
    if (redirecting) return;
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (isAdmin) {
        router.push('/admin');
      } else if (isPrincipal) {
        router.replace('/principal');
      } else if (isOnboarded) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, isPrincipal, router, redirecting]);

  const cleanEnrollment = enrollmentNo.trim();
  const hasMinDigits = cleanEnrollment.length >= 9;
  const deptCode = hasMinDigits ? cleanEnrollment.slice(7, 9) : null;
  const previewMatch = deptCode ? resolveEnrollmentCode(deptCode) : null;
  const enrollmentCheck = extractAndMapEnrollment(cleanEnrollment);
  const confirmedMappingLabels = Object.values(ENROLLMENT_CODE_MAPPINGS)
    .filter((m) => m.confirmed)
    .map((m) => {
      const dept = resolveDepartment(m.department_id);
      return dept ? `${m.enrollment_code} (${dept.name})` : null;
    })
    .filter((label): label is string => Boolean(label))
    .join(', ');

  const cleanPhone = phoneNumber.trim();
  const phoneValidation = PhoneNumberSchema.safeParse(cleanPhone);
  const hasPhoneInput = cleanPhone.length > 0;
  const phoneStartsInvalid = hasPhoneInput && !/^[6-9]/.test(cleanPhone);

  const isNameFormatValid = /^[a-zA-Z\s.'-]+$/.test(name.trim());
  const isNameValid = name.trim().length >= 2 && isNameFormatValid;

  const isFormValid =
    isNameValid &&
    cleanEnrollment.length === 12 &&
    enrollmentCheck.isValid &&
    phoneValidation.success;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmitting) return;

    const validation = StrictOnboardingSchema.safeParse({
      name: name.trim(),
      enrollment_no: cleanEnrollment,
      phone_number: cleanPhone,
    });

    if (!validation.success) {
      setSubmitError(validation.error.issues[0]?.message || 'Please review your profile details.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await apiCompleteOnboarding(validation.data);

      if (response.success && response.data) {
        setRedirecting(true);
        setProfileState(response.data.profile);
        router.replace('/dashboard');
      } else if (response.code === 'PROFILE_ALREADY_LOCKED') {
        // Profile is already completed and locked; refresh profile state and navigate directly to dashboard
        setRedirecting(true);
        await refreshProfile();
        router.replace('/dashboard');
      } else {
        setSubmitError(response.error || 'Failed to complete profile registration.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50 text-slate-900 antialiased selection:bg-blue-600 selection:text-white dark:bg-gray-950 dark:text-slate-100">
      {/* Top Institutional Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
              <Buildings size={20} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-blue-700 dark:text-blue-400">
                  CampusVoice
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-bold text-blue-700 uppercase dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400">
                  PORTAL
                </span>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                Collegiate Governance &amp; Facilities Portal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 dark:border-slate-700 dark:bg-slate-800">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600"></span>
            </span>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Institutional Auth • Active
            </span>
          </div>
        </div>
      </header>

      {/* Main Canvas Flow */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 md:py-10 lg:px-8">
        {/* Step Indicator */}
        <div className="mb-6 w-full max-w-xl">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white/80 px-4 py-2.5 text-xs shadow-xs backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                ✓
              </span>
              <span>Step 1: Institutional Auth</span>
            </div>
            <ArrowRight size={14} className="text-slate-400" />
            <div className="flex items-center gap-2 font-bold text-blue-700 dark:text-blue-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-700 text-xs text-white">
                2
              </span>
              <span>Step 2: Profile, Phone &amp; Identity</span>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full w-2/3 rounded-full bg-blue-700 transition-all duration-500"></div>
          </div>
        </div>

        {/* Central Profile Setup Card */}
        <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8 md:p-10 dark:border-slate-800 dark:bg-slate-900">
          {/* Card Top Emblem & Title */}
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-8 ring-blue-50/50 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-950/40">
              <IdentificationBadge size={32} weight="fill" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Complete Your Student Profile
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
              First-time registration requires your full name, 12-digit enrollment number, and 10-digit mobile number.
            </p>
          </div>

          {/* Submission Error Banner */}
          {submitError && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-xs font-medium">{submitError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Field 1: Full Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="fullName" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                  Full Name (as per college records)
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <CheckCircle size={13} weight="fill" />
                  SSO Confirmed
                </span>
              </div>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
              {name.trim().length > 0 && !isNameFormatValid ? (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Name contains invalid characters. Use letters, spaces, dots, hyphens, and apostrophes only.
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Synced from your Google Account; verify spelling matches college records.
                </p>
              )}
            </div>

            {/* Field 2: Enrollment Number */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="enrollmentNumber" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                  Enrollment Number (12 digits)
                  <span className="ml-1 text-red-600">*</span>
                </label>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">12-Digit Format</span>
              </div>
              <input
                id="enrollmentNumber"
                name="enrollmentNumber"
                type="text"
                inputMode="numeric"
                maxLength={12}
                required
                value={enrollmentNo}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setEnrollmentNo(val);
                }}
                placeholder="e.g. 246510307054"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-base tracking-widest text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />

              {/* Character Breakdown Visual Guide */}
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1 font-mono text-xs dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">Position Guide:</span>
                  <span className="tracking-widest">
                    <span className="text-slate-400">2465103</span>
                    <span className="rounded bg-blue-100 px-1 font-bold text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                      07
                    </span>
                    <span className="text-slate-400">054</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your academic department is derived server-side from characters 8–9 of your enrollment number.
                </p>
              </div>
            </div>

            {/* Field 3: Live Department Detection Card */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-900 dark:text-slate-200">
                Academic Department Jurisdiction
              </label>

              {previewMatch ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 transition-all dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                      {previewMatch.department.id === 'dept_comp' ? (
                        <TerminalWindow size={22} weight="fill" />
                      ) : previewMatch.department.id === 'dept_elec' ? (
                        <Lightning size={22} weight="fill" />
                      ) : previewMatch.department.id === 'dept_mech' ? (
                        <Gear size={22} weight="fill" />
                      ) : (
                        <Buildings size={22} weight="fill" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {previewMatch.department.name}
                        </h2>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900 dark:text-emerald-200">
                          <CheckCircle size={12} weight="fill" />
                          VERIFIED JURISDICTION
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                        Code{' '}
                        <span className="rounded border border-slate-200 bg-white px-1 py-0.5 font-mono font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                          {previewMatch.mapping.enrollment_code}
                        </span>{' '}
                        detected at characters 8–9 • Academic Peer Feed Scope
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 border-t border-emerald-200/60 pt-2.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:text-emerald-300">
                    <Lock size={13} weight="bold" />
                    <span>Peer feed visibility is scoped to this academic department; complaints can be routed to any of the 6 maintenance departments.</span>
                  </div>
                </div>
              ) : hasMinDigits ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 transition-all dark:border-amber-900/60 dark:bg-amber-950/40">
                  <div className="flex items-start gap-3">
                    <WarningCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <div>
                      <h2 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                        Unmapped Department Code: {deptCode}
                      </h2>
                      <p className="mt-1 text-xs text-amber-900 dark:text-amber-300">
                        Department code <span className="font-mono font-bold">{deptCode}</span> is not confirmed in institutional enrollment records. Only confirmed academic department codes (<span className="font-mono font-bold">{confirmedMappingLabels}</span>) can be assigned.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
                  Enter at least 9 digits of your 12-digit enrollment number to detect your academic department.
                </div>
              )}
            </div>

            {/* Field 4: Phone Number */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="phoneNumber" className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                  Mobile Phone Number (10 digits)
                  <span className="ml-1 text-red-600">*</span>
                </label>
                {phoneValidation.success ? (
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <CheckCircle size={13} weight="fill" />
                    Valid 10-Digit Format
                  </span>
                ) : (
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {cleanPhone.length}/10 digits
                  </span>
                )}
              </div>
              <div className="relative">
                <Phone
                  size={18}
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
                <input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  required
                  value={phoneNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setPhoneNumber(val);
                  }}
                  placeholder="e.g. 9876543210"
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pr-3.5 pl-10 font-mono text-base tracking-widest text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
              </div>
              {phoneStartsInvalid ? (
                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                  Mobile number must begin with 6, 7, 8, or 9 and contain exactly 10 digits.
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Enter a 10-digit Indian mobile number (starts with 6, 7, 8, or 9). Locked after saving; future updates require academic Department Admin approval.
                </p>
              )}
            </div>

            {/* Lock Warning Notice */}
            <div className="space-y-1.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-start gap-2.5">
                <Warning size={20} weight="fill" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
                <div>
                  <p className="text-xs font-bold leading-relaxed text-amber-950 dark:text-amber-100">
                    Important Notice: Please check your name, enrollment number, and phone number carefully. Once you save them, they cannot be changed directly through your account.
                  </p>
                  <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-300">
                    Name and enrollment number remain permanently locked; phone number updates require an approved request through your academic Department Admin.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-bold text-white shadow-xs transition hover:bg-blue-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <CircleNotch size={18} className="animate-spin" />
                  <span>Saving Profile &amp; Locking Credentials...</span>
                </>
              ) : (
                <>
                  <span>Save Profile &amp; Continue</span>
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Portal • Strict Department Isolation &amp; Ombudsman Protocol
      </footer>
    </div>
  );
}
