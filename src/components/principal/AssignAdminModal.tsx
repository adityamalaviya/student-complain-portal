'use client';

import React, { useState } from 'react';
import { X, CircleNotch, WarningCircle, Prohibit } from '@phosphor-icons/react';
import { apiAssignAdmin } from '@/lib/api';
import { resolveDepartment } from '@/lib/utils';
import type { DepartmentId } from '@/types';

const CANONICAL_DEPARTMENTS: readonly DepartmentId[] = [
  'dept_comp',
  'dept_civil',
  'dept_elec',
  'dept_mech',
  'dept_water',
  'dept_sanit',
];

export interface AssignAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AssignAdminModal({
  isOpen,
  onClose,
  onSuccess,
}: AssignAdminModalProps): React.ReactElement | null {
  const [assignEmail, setAssignEmail] = useState<string>('');
  const [assignDeptId, setAssignDeptId] = useState<string>('dept_comp');
  const [assignScope, setAssignScope] = useState<'academic' | 'maintenance'>('maintenance');
  const [assignError, setAssignError] = useState<string | null>(null);
  const [isSubmittingAssign, setIsSubmittingAssign] = useState<boolean>(false);

  if (!isOpen) return null;

  const selectedDeptObj = resolveDepartment(assignDeptId);
  const isInvalidAcademicDept =
    assignScope === 'academic' && (!selectedDeptObj || !selectedDeptObj.is_academic);

  const handleAssignSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const targetDept = resolveDepartment(assignDeptId);
    if (!targetDept) {
      setAssignError('Please select a valid department.');
      return;
    }
    if (assignScope === 'academic' && !targetDept.is_academic) {
      setAssignError(
        `Department '${targetDept.name}' is maintenance-only and cannot have academic administrators.`
      );
      return;
    }
    if (!assignEmail || !assignEmail.includes('@')) {
      setAssignError('Please provide a valid email address.');
      return;
    }

    setAssignError(null);
    setIsSubmittingAssign(true);

    try {
      const res = await apiAssignAdmin({
        email: assignEmail.trim().toLowerCase(),
        department_id: assignDeptId,
        scope: assignScope,
      });

      if (!res.success) {
        setAssignError(res.error || 'Failed to assign administrator.');
        setIsSubmittingAssign(false);
        return;
      }

      setIsSubmittingAssign(false);
      setAssignEmail('');
      onSuccess();
      onClose();
    } catch (err) {
      setIsSubmittingAssign(false);
      setAssignError(err instanceof Error ? err.message : 'Network error assigning administrator.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Assign Department Administrator
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Administrator Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={assignEmail}
              onChange={(e) => setAssignEmail(e.target.value)}
              placeholder="faculty@college.edu"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Institutional Department <span className="text-red-500">*</span>
            </label>
            <select
              value={assignDeptId}
              onChange={(e) => setAssignDeptId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-900 focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {CANONICAL_DEPARTMENTS.map((deptId) => {
                const dept = resolveDepartment(deptId);
                return (
                  <option key={deptId} value={deptId}>
                    {dept?.name} ({dept?.is_academic ? 'Academic & Maintenance' : 'Maintenance Only'})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Administrative Scope <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAssignScope('maintenance')}
                className={`rounded-xl border p-3 text-left transition ${
                  assignScope === 'maintenance'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-bold">Maintenance</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Manage grievances</div>
              </button>

              <button
                type="button"
                onClick={() => setAssignScope('academic')}
                className={`rounded-xl border p-3 text-left transition ${
                  assignScope === 'academic'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-200'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                <div className="text-xs font-bold">Academic</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">Review phone changes</div>
              </button>
            </div>
          </div>

          {/* Water/Sanitation Academic Warning */}
          {isInvalidAcademicDept && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <Prohibit size={16} weight="bold" className="mt-0.5 shrink-0" />
              <span>
                Water and Sanitation are maintenance-only departments. Academic scope is strictly prohibited for these departments.
              </span>
            </div>
          )}

          {assignError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
              <WarningCircle size={16} weight="bold" className="mt-0.5 shrink-0" />
              <span>{assignError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingAssign}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAssign || isInvalidAcademicDept}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {isSubmittingAssign && <CircleNotch size={14} className="animate-spin" />}
              <span>Save Assignment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
