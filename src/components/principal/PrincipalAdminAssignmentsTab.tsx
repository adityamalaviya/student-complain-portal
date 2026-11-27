'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus,
  PencilSimple,
  Trash,
  CircleNotch,
  WarningCircle,
  X,
  EnvelopeSimple,
} from '@phosphor-icons/react';
import { EmptyState, ErrorState } from '@/components';
import {
  groupAdminAssignments,
  resolveDepartment,
  type AdminAssignmentScopeDisplay,
} from '@/lib/utils';
import type { Department, DepartmentAdminAssignment } from '@/types';

const SCOPE_BADGE_CONFIG: Record<
  AdminAssignmentScopeDisplay,
  { label: string; className: string }
> = {
  academic: {
    label: 'Academic',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  maintenance: {
    label: 'Maintenance',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  both: {
    label: 'Both (Academic & Maintenance)',
    className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  },
};

export interface PrincipalAdminAssignmentsTabProps {
  departments: Department[];
  assignments: DepartmentAdminAssignment[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenCreateModal?: () => void;
  onOpenAssignModal?: () => void; // backwards compatibility
  onOpenEditModal: (department: Department) => void;
  onDeleteDepartment: (departmentId: string) => Promise<{ success: boolean; error?: string }>;
  onRevoke?: (assignmentId: string) => Promise<{ success: boolean; error?: string }>;
}

export function PrincipalAdminAssignmentsTab({
  departments,
  assignments,
  isLoading,
  error,
  onRefresh,
  onOpenCreateModal,
  onOpenAssignModal,
  onOpenEditModal,
  onDeleteDepartment,
}: PrincipalAdminAssignmentsTabProps): React.ReactElement {
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef<boolean>(false);

  const handleOpenCreate = onOpenCreateModal || onOpenAssignModal || (() => {});

  // Group active assignments by email + department
  const activeGroupedAssignments = useMemo(() => {
    const activeOnly = assignments.filter((a) => a.is_active);
    return groupAdminAssignments(activeOnly);
  }, [assignments]);

  // Index active grouped admins by department_id
  const adminsByDeptId = useMemo(() => {
    const map = new Map<string, typeof activeGroupedAssignments>();
    for (const group of activeGroupedAssignments) {
      const existing = map.get(group.department_id) || [];
      existing.push(group);
      map.set(group.department_id, existing);
    }
    return map;
  }, [activeGroupedAssignments]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && departmentToDelete && !isDeleting && !deletingRef.current) {
        setDepartmentToDelete(null);
        setDeleteError(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return (): void => window.removeEventListener('keydown', handleKeyDown);
  }, [departmentToDelete, isDeleting]);

  const handleConfirmDelete = async (): Promise<void> => {
    if (!departmentToDelete || isDeleting || deletingRef.current) return;

    deletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await onDeleteDepartment(departmentToDelete.$id);
      if (!res.success) {
        setDeleteError(res.error || 'Failed to delete department.');
        return;
      }
      setDepartmentToDelete(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Network error deleting department.');
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Create Department Button */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Departments &amp; Administrators
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Create, manage, and configure institutional departments and their scoped administrators.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <Plus size={16} weight="bold" />
          <span>Create Department</span>
        </button>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="py-16 text-center">
          <CircleNotch size={32} className="mx-auto animate-spin text-blue-700 dark:text-blue-400" />
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Loading departments...</p>
        </div>
      ) : error ? (
        <ErrorState title="Failed to load departments" message={error} onRetry={onRefresh} />
      ) : departments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            title="No Departments Found"
            description="Use the Create Department button above to add your first institutional department."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((dept) => {
            const resolved = resolveDepartment(dept.$id);
            const deptCode =
              dept.code ||
              resolved?.code ||
              dept.$id.replace(/^dept_/, '').toUpperCase();
            const deptAdmins = adminsByDeptId.get(dept.$id) || [];

            return (
              <div
                key={dept.$id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                {/* Top Section: Name, Code & Scopes */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                          {dept.name}
                        </span>
                        <span className="shrink-0 rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {deptCode}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Department Capabilities Tags */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {dept.is_academic && dept.is_maintenance ? (
                      <span className="inline-flex items-center rounded-md bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        Academic &amp; Maintenance
                      </span>
                    ) : (
                      <>
                        {dept.is_maintenance && (
                          <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            Maintenance
                          </span>
                        )}
                        {dept.is_academic && (
                          <span className="inline-flex items-center rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Academic
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Assigned Administrators */}
                  <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800/80">
                    <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase dark:text-slate-500">
                      Assigned Administrator
                    </span>
                    {deptAdmins.length > 0 ? (
                      <div className="mt-1.5 space-y-2">
                        {deptAdmins.map((admin) => {
                          const badge = SCOPE_BADGE_CONFIG[admin.scopeDisplay];
                          return (
                            <div
                              key={admin.key}
                              className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60"
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                <EnvelopeSimple
                                  size={13}
                                  className="shrink-0 text-slate-400 dark:text-slate-500"
                                />
                                <span className="truncate font-mono text-[11px] font-medium text-slate-800 dark:text-slate-200">
                                  {admin.email}
                                </span>
                              </div>
                              <span
                                className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}
                              >
                                {admin.scopeDisplay === 'both'
                                  ? 'Both'
                                  : admin.scopeDisplay === 'academic'
                                  ? 'Acad'
                                  : 'Maint'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-1.5 rounded-xl border border-dashed border-slate-200 p-2 text-center text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                        No administrator assigned
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Buttons: Edit & Delete */}
                <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenEditModal(dept)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                  >
                    <PencilSimple size={13} weight="bold" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDepartmentToDelete(dept);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-2xs transition hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash size={13} weight="bold" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {departmentToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isDeleting && !deletingRef.current) {
              setDepartmentToDelete(null);
              setDeleteError(null);
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <WarningCircle size={20} weight="bold" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Delete Department
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDepartmentToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                aria-label="Close dialog"
                className="text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Are you sure you want to delete department{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  &ldquo;{departmentToDelete.name}&rdquo;
                </span>
                ?
              </p>
              <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <p className="font-semibold">Important:</p>
                <p className="mt-0.5 text-[11px]">
                  This will deactivate the department record and revoke all associated active administrator
                  privileges. Existing grievance history will remain preserved.
                </p>
              </div>

              {deleteError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
                  <WarningCircle size={16} weight="bold" className="shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDepartmentToDelete(null);
                  setDeleteError(null);
                }}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 dark:bg-red-600 dark:hover:bg-red-500"
              >
                {isDeleting && <CircleNotch size={14} className="animate-spin" />}
                <span>Delete Department</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
