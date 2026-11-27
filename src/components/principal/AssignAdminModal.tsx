'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, CircleNotch, WarningCircle, CheckSquare, Square } from '@phosphor-icons/react';
import { apiCreateDepartment, apiUpdateDepartment } from '@/lib/api';
import { getCanonicalDepartmentCode } from '@/lib/utils';
import type { Department } from '@/types';

export interface CreateEditDepartmentModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  department?: Department | null;
  initialAdminEmail?: string;
  initialScopes?: { maintenance: boolean; academic: boolean };
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateEditDepartmentModal({
  isOpen,
  mode,
  department,
  initialAdminEmail = '',
  initialScopes,
  onClose,
  onSuccess,
}: CreateEditDepartmentModalProps): React.ReactElement | null {
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [maintenanceScope, setMaintenanceScope] = useState<boolean>(true);
  const [academicScope, setAcademicScope] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);

  const isMaintenanceOnlyDepartment =
    mode === 'edit' &&
    (department?.$id === 'dept_water' || department?.$id === 'dept_sanit');

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setIsSubmitting(false);
      isSubmittingRef.current = false;

      if (mode === 'edit' && department) {
        setName(department.name || '');
        const canonicalCode = getCanonicalDepartmentCode(department.$id);
        setCode(department.code || canonicalCode || department.$id.replace(/^dept_/, '').toUpperCase());
        setAdminEmail(initialAdminEmail || '');
        setMaintenanceScope(
          initialScopes ? initialScopes.maintenance : (department.is_maintenance ?? true)
        );
        setAcademicScope(
          isMaintenanceOnlyDepartment
            ? false
            : initialScopes
            ? initialScopes.academic
            : (department.is_academic ?? false)
        );
      } else {
        setName('');
        setCode('');
        setAdminEmail(initialAdminEmail || '');
        setMaintenanceScope(true);
        setAcademicScope(true); // Default to both for easy multi-scope
      }
    }
  }, [isOpen, mode, department, initialAdminEmail, initialScopes, isMaintenanceOnlyDepartment]);

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

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (isSubmittingRef.current || isSubmitting) return;

    const trimmedName = name.trim();
    const trimmedCode = code.trim().toUpperCase();
    const trimmedEmail = adminEmail.trim().toLowerCase();

    if (!trimmedName || trimmedName.length < 2) {
      setFormError('Department name must be at least 2 characters long.');
      return;
    }
    if (!trimmedCode || trimmedCode.length < 2) {
      setFormError('Department code must be at least 2 characters long.');
      return;
    }
    if (!/^[A-Z0-9_-]+$/.test(trimmedCode)) {
      setFormError('Department code must contain only letters, numbers, hyphens, or underscores.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFormError('Please enter a valid administrator email address.');
      return;
    }
    if (!maintenanceScope && !academicScope) {
      setFormError('At least one scope (Maintenance or Academic) must be selected.');
      return;
    }
    if (isMaintenanceOnlyDepartment && academicScope) {
      setFormError('Water and Sanitation departments are maintenance-only and cannot be assigned academic scope.');
      return;
    }

    setFormError(null);
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      if (mode === 'create') {
        const res = await apiCreateDepartment({
          name: trimmedName,
          code: trimmedCode,
          admin_email: trimmedEmail,
          scopes: {
            maintenance: maintenanceScope,
            academic: academicScope,
          },
        });

        if (!res.success) {
          setFormError(res.error || 'Failed to create department.');
          return;
        }
      } else if (mode === 'edit' && department) {
        const res = await apiUpdateDepartment({
          department_id: department.$id,
          name: trimmedName,
          code: trimmedCode,
          admin_email: trimmedEmail,
          scopes: {
            maintenance: maintenanceScope,
            academic: academicScope,
          },
        });

        if (!res.success) {
          setFormError(res.error || 'Failed to update department.');
          return;
        }
      }

      onSuccess();
      onClose();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error saving department.');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting && !isSubmittingRef.current) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {mode === 'create' ? 'Create New Department' : 'Edit Department'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === 'create'
                ? 'Register an institutional department and assign its administrator privileges.'
                : 'Modify department details and administrative scope configurations.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Department Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Department Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Computer Science & Engineering"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Department Code */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Department Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CSE, CIVIL, MECH"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-xs uppercase text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Unique 2-10 character uppercase code used for identification badges.
            </p>
          </div>

          {/* Administrator Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Administrator Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="admin@college.edu"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          {/* Scope Checkboxes (Bordered Cards with Left Accent) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Administrative Scope <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
              Select one or both permissions to assign to this department.
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/* Maintenance Scope Card */}
              <button
                type="button"
                onClick={() => setMaintenanceScope((prev) => !prev)}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                  maintenanceScope
                    ? 'border-emerald-500 border-l-4 bg-emerald-50/40 dark:border-emerald-500 dark:bg-emerald-950/20'
                    : 'border-slate-200 border-l-4 border-l-slate-300 bg-white hover:border-slate-300 dark:border-slate-800 dark:border-l-slate-700 dark:bg-slate-800/50'
                }`}
              >
                <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                  {maintenanceScope ? (
                    <CheckSquare size={18} weight="fill" />
                  ) : (
                    <Square size={18} className="text-slate-400 dark:text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-900 dark:text-white">
                    Maintenance
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    Manage grievances
                  </span>
                </div>
              </button>

              {/* Academic Scope Card */}
              <button
                type="button"
                disabled={isMaintenanceOnlyDepartment || isSubmitting}
                onClick={() => {
                  if (!isMaintenanceOnlyDepartment) {
                    setAcademicScope((prev) => !prev);
                  }
                }}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
                  isMaintenanceOnlyDepartment
                    ? 'cursor-not-allowed border-slate-200 border-l-4 border-l-slate-300 bg-slate-100/60 opacity-60 dark:border-slate-800 dark:border-l-slate-700 dark:bg-slate-800/30'
                    : academicScope
                    ? 'border-blue-500 border-l-4 bg-blue-50/40 dark:border-blue-500 dark:bg-blue-950/20'
                    : 'border-slate-200 border-l-4 border-l-slate-300 bg-white hover:border-slate-300 dark:border-slate-800 dark:border-l-slate-700 dark:bg-slate-800/50'
                }`}
              >
                <div className="mt-0.5 text-blue-600 dark:text-blue-400">
                  {academicScope ? (
                    <CheckSquare size={18} weight="fill" />
                  ) : (
                    <Square size={18} className="text-slate-400 dark:text-slate-500" />
                  )}
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-900 dark:text-white">
                    Academic
                  </span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                    {isMaintenanceOnlyDepartment
                      ? 'Maintenance-only department'
                      : 'Review phone changes'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* Error Message */}
          {formError && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <WarningCircle size={16} weight="bold" className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isSubmitting && <CircleNotch size={14} className="animate-spin" />}
              <span>{mode === 'create' ? 'Create Department' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Keep AssignAdminModal export as an alias for backwards compatibility
export const AssignAdminModal = CreateEditDepartmentModal;
