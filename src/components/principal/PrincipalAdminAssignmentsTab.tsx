'use client';

import React, { useState } from 'react';
import {
  UserPlus,
  CircleNotch,
  Trash,
  X,
  WarningCircle,
} from '@phosphor-icons/react';
import { DepartmentBadge, EmptyState, ErrorState } from '@/components';
import { resolveDepartment } from '@/lib/utils';
import type { DepartmentAdminAssignment } from '@/types';

function formatTimestamp(dateString?: string): string {
  if (!dateString) return 'Recently';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

export interface PrincipalAdminAssignmentsTabProps {
  assignments: DepartmentAdminAssignment[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenAssignModal: () => void;
  onRevoke: (assignmentId: string) => Promise<{ success: boolean; error?: string }>;
}

export function PrincipalAdminAssignmentsTab({
  assignments,
  isLoading,
  error,
  onRefresh,
  onOpenAssignModal,
  onRevoke,
}: PrincipalAdminAssignmentsTabProps): React.ReactElement {
  const [confirmRevokeAssignment, setConfirmRevokeAssignment] =
    useState<DepartmentAdminAssignment | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeActionError, setRevokeActionError] = useState<string | null>(null);

  const handleConfirmRevoke = async (): Promise<void> => {
    if (!confirmRevokeAssignment) return;
    const assignmentId = confirmRevokeAssignment.$id;
    setRevokingId(assignmentId);
    setRevokeActionError(null);

    const res = await onRevoke(assignmentId);
    setRevokingId(null);

    if (res.success) {
      setConfirmRevokeAssignment(null);
    } else {
      setRevokeActionError(res.error || 'Failed to revoke administrator assignment.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Department Administrator Assignments
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Provision and manage scoped administrator privileges across all six institutional departments.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAssignModal}
          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-700 px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <UserPlus size={16} weight="bold" />
          <span>Assign Administrator</span>
        </button>
      </div>

      {revokeActionError && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-center gap-2">
            <WarningCircle size={16} weight="bold" className="shrink-0" />
            <span>{revokeActionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setRevokeActionError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center">
          <CircleNotch size={32} className="mx-auto animate-spin text-blue-700 dark:text-blue-400" />
        </div>
      ) : error ? (
        <ErrorState title="Failed to load administrators" message={error} onRetry={onRefresh} />
      ) : assignments.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            title="No Administrators Assigned"
            description="Use the Assign Administrator button to provision department permissions."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Admin Email
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Department
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Scope
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Assigned At
                  </th>
                  <th scope="col" className="px-6 py-3.5 text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {assignments.map((a) => {
                  const isRevoking = revokingId === a.$id;
                  return (
                    <tr key={a.$id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                      <td className="px-6 py-4 font-mono font-medium text-slate-900 dark:text-white">
                        {a.email}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <DepartmentBadge departmentId={a.department_id} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                            a.scope === 'academic'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {a.scope === 'academic' ? 'Academic (Phone Approvals)' : 'Maintenance (Grievances)'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                            a.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {a.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                        {formatTimestamp(a.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {a.is_active ? (
                          <button
                            type="button"
                            disabled={isRevoking}
                            onClick={() => {
                              setRevokeActionError(null);
                              setConfirmRevokeAssignment(a);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            {isRevoking ? (
                              <CircleNotch size={12} className="animate-spin" />
                            ) : (
                              <Trash size={12} weight="bold" />
                            )}
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">Inactive</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* In-App Revocation Confirmation Dialog (Replaces native browser confirm()) */}
      {confirmRevokeAssignment && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                <Trash size={20} weight="bold" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Revoke Administrator Assignment
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action deactivates administrative privileges immediately.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
              <div className="font-mono font-medium text-slate-900 dark:text-white">
                {confirmRevokeAssignment.email}
              </div>
              <div className="mt-1 text-slate-500 dark:text-slate-400">
                {resolveDepartment(confirmRevokeAssignment.department_id)?.name} •{' '}
                <span className="capitalize">{confirmRevokeAssignment.scope} Scope</span>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Are you sure you want to revoke this administrator assignment? If this user has no other active assignments, their role will revert to Student.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRevokeAssignment(null)}
                disabled={Boolean(revokingId)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRevoke}
                disabled={Boolean(revokingId)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {revokingId && <CircleNotch size={14} className="animate-spin" />}
                <span>Confirm Revocation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
