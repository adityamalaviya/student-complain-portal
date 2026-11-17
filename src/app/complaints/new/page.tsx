'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ID, Permission, Role } from 'appwrite';
import {
  Lock,
  Paperclip,
  CircleNotch,
  ArrowLeft,
  WarningCircle,
  CheckCircle,
  Wrench,
  X,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import { storage, APPWRITE_CONFIG } from '@/lib/appwrite';
import { apiCreateComplaint, apiListDepartments } from '@/lib/api';
import { ComplaintCreateSchema } from '@/lib/schemas';
import { getMaintenanceDepartments, resolveDepartment } from '@/lib/utils';
import { DepartmentBadge } from '@/components';
import type { Department } from '@/types';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'] as const;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export default function RaiseComplaintPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isOnboarded, isAdmin, isPrincipal } = useAuth();

  const [departments, setDepartments] = useState<Department[]>(() =>
    getMaintenanceDepartments().map((d) => ({
      $id: d.id,
      name: d.name,
      is_academic: d.is_academic,
      is_maintenance: d.is_maintenance,
      is_active: d.is_active,
    }))
  );
  const [maintenanceDeptId, setMaintenanceDeptId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Guard: unauthenticated -> sign-in; non-student -> workspace; incomplete profile -> onboarding
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (isAdmin) {
        router.push('/admin');
      } else if (isPrincipal) {
        router.replace('/principal');
      } else if (!isOnboarded) {
        router.push('/onboarding');
      }
    }
  }, [loading, user, isOnboarded, isAdmin, isPrincipal, router]);

  // Load authoritative maintenance departments from backend
  useEffect(() => {
    let isMounted = true;

    async function loadDepartments(): Promise<void> {
      const res = await apiListDepartments();
      if (isMounted && res.success && res.data?.departments) {
        const activeMaintenance = res.data.departments.filter(
          (d) => d.is_maintenance && d.is_active
        );
        if (activeMaintenance.length > 0) {
          setDepartments(activeMaintenance);
        }
      }
    }

    void loadDepartments();
    return (): void => {
      isMounted = false;
    };
  }, []);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  const academicDept = resolveDepartment(profile.student_department_id);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size <= 0) {
      setErrorMessage('Attachment file cannot be empty.');
      setSelectedFile(null);
      setSelectedFileName(null);
      return;
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setErrorMessage('Attachment size exceeds the 5 MB limit.');
      setSelectedFile(null);
      setSelectedFileName(null);
      return;
    }

    const ext = file.name.includes('.')
      ? file.name.split('.').pop()?.trim().toLowerCase() || ''
      : '';
    const isAllowedType = ALLOWED_MIME_TYPES.some((mime) => file.type === mime);
    const isAllowedExt = ALLOWED_EXTENSIONS.some((allowedExt) => ext === allowedExt);
    if (!isAllowedType || !isAllowedExt) {
      setErrorMessage('Only PDF, JPG, JPEG, or PNG attachments are permitted.');
      setSelectedFile(null);
      setSelectedFileName(null);
      return;
    }

    setSelectedFile(file);
    setSelectedFileName(file.name);
    setErrorMessage(null);
  };

  const handleClearFile = (): void => {
    setSelectedFile(null);
    setSelectedFileName(null);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const departmentName = academicDept?.name || profile.department_name;

    const baseValidation = ComplaintCreateSchema.safeParse({
      title,
      maintenance_department_id: maintenanceDeptId,
      location,
      description,
      priority,
      ...(departmentName ? { department_name: departmentName } : {}),
    });

    if (!baseValidation.success) {
      const firstIssue = baseValidation.error.issues[0];
      setErrorMessage(firstIssue?.message || 'Please check your inputs.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    let uploadedFileId: string | undefined;
    try {
      setIsSubmitting(true);

      if (selectedFile && user) {
        try {
          const uploadedFile = await storage.createFile(
            APPWRITE_CONFIG.attachmentsBucketId,
            ID.unique(),
            selectedFile,
            [
              Permission.read(Role.user(user.$id)),
              Permission.delete(Role.user(user.$id)),
            ]
          );
          uploadedFileId = uploadedFile.$id;
        } catch (uploadErr: unknown) {
          const uploadMsg =
            uploadErr instanceof Error ? uploadErr.message : 'Failed to upload attachment';
          setErrorMessage(`Attachment upload failed: ${uploadMsg}`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      const finalValidation = ComplaintCreateSchema.safeParse({
        ...baseValidation.data,
        ...(uploadedFileId ? { attachment_file_id: uploadedFileId } : {}),
        ...(departmentName ? { department_name: departmentName } : {}),
      });

      if (!finalValidation.success) {
        if (uploadedFileId) {
          await storage.deleteFile(APPWRITE_CONFIG.attachmentsBucketId, uploadedFileId).catch(() => {});
        }
        setErrorMessage(finalValidation.error.issues[0]?.message || 'Invalid attachment.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const res = await apiCreateComplaint({
        ...finalValidation.data,
        ...(departmentName ? { department_name: departmentName } : {}),
      });

      if (res.success && res.data) {
        setSuccessMessage('Complaint filed successfully. Redirecting to your department feed...');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
          router.push('/dashboard');
        }, 1200);
      } else {
        if (uploadedFileId) {
          await storage.deleteFile(APPWRITE_CONFIG.attachmentsBucketId, uploadedFileId).catch(() => {});
        }
        setErrorMessage(res.error || 'Failed to submit complaint. Please try again.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: unknown) {
      if (uploadedFileId) {
        await storage.deleteFile(APPWRITE_CONFIG.attachmentsBucketId, uploadedFileId).catch(() => {});
      }
      const msg = err instanceof Error ? err.message : 'Network error submitting complaint';
      setErrorMessage(msg);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
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
              <h1 className="text-base font-bold text-slate-900 dark:text-white">
                Raise Student Complaint
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Institutional Facilities &amp; Grievance Portal
              </p>
            </div>
          </div>

          <DepartmentBadge
            departmentId={academicDept?.id ?? profile.student_department_id}
            name={academicDept?.name || profile.department_name}
            size="sm"
          />
        </div>
      </header>

      {/* Main Form Container */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-6 border-b border-slate-100 pb-4 dark:border-slate-800">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">New Complaint Filing</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Your complaint is scoped to your academic department for peer visibility and routed to your chosen Maintenance Department for resolution.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              <WarningCircle size={20} weight="bold" className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-xs font-semibold">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs font-semibold">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Row 1: Student Name, Enrollment Number & Academic Department (Read-only, prefilled) */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="studentName" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Student Name
                  </label>
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Locked
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
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Locked
                  </span>
                </div>
                <input
                  id="enrollmentNumber"
                  type="text"
                  readOnly
                  disabled
                  value={profile.enrollment_no}
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 font-mono text-sm font-medium tracking-widest text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="academicDepartment" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Academic Department
                  </label>
                  <span className="flex items-center gap-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    <Lock size={12} weight="bold" />
                    Scope
                  </span>
                </div>
                <input
                  id="academicDepartment"
                  type="text"
                  readOnly
                  disabled
                  value={academicDept?.name || profile.department_name || 'Verified Academic Dept'}
                  className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-400"
                />
              </div>
            </div>

            {/* Row 2: Title */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="complaintTitle" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Problem / Complaint Title <span className="text-red-600">*</span>
                </label>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {title.length}/150 (min 5)
                </span>
              </div>
              <input
                id="complaintTitle"
                type="text"
                required
                minLength={5}
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Water cooler leakage outside Computer Lab 2"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>

            {/* Row 3: Maintenance Department Selector and Location */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="maintenanceDepartment" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Maintenance Department <span className="text-red-600">*</span>
                  </label>
                  <span className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                    <Wrench size={12} weight="bold" />
                    Routed Team
                  </span>
                </div>
                <select
                  id="maintenanceDepartment"
                  name="maintenanceDepartment"
                  required
                  value={maintenanceDeptId}
                  onChange={(e) => setMaintenanceDeptId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                >
                  <option value="">Select a maintenance department...</option>
                  {departments.map((dept) => (
                    <option key={dept.$id} value={dept.$id}>
                      {dept.name} ({dept.is_academic ? 'Academic & Maintenance' : 'Maintenance Only'})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose which of the 6 institutional maintenance teams should resolve this issue.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="location" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Location / Physical Area <span className="text-red-600">*</span>
                  </label>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {location.length}/100 (min 3)
                  </span>
                </div>
                <input
                  id="location"
                  type="text"
                  required
                  minLength={3}
                  maxLength={100}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. IT Block, 2nd Floor, Room 204"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                />
              </div>
            </div>

            {/* Row 4: Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="description" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Detailed Description <span className="text-red-600">*</span>
                </label>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {description.length}/2000 (min 10)
                </span>
              </div>
              <textarea
                id="description"
                rows={4}
                required
                minLength={10}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide specific details regarding the issue (minimum 10 characters)..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition focus:border-blue-700 focus:ring-3 focus:ring-blue-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              />
            </div>

            {/* Row 5: Priority Selector */}
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
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Row 6: Attachment (Optional) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="attachmentInput" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supporting Attachment (Optional)
                </label>
                {selectedFileName && (
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                  >
                    <X size={12} weight="bold" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
              <label
                htmlFor="attachmentInput"
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-5 text-center transition hover:border-blue-700 hover:bg-blue-50/20 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-blue-950/20"
              >
                <Paperclip size={24} className="mx-auto text-slate-400 dark:text-slate-500" />
                <p className="mt-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {selectedFileName ? (
                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                      Selected: {selectedFileName}
                    </span>
                  ) : (
                    'Click to attach PDF, JPG, JPEG, or PNG up to 5 MB'
                  )}
                </p>
                <input
                  id="attachmentInput"
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
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
                id="submitComplaintButton"
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-blue-800 active:scale-95 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <>
                    <CircleNotch size={14} className="animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Complaint</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
