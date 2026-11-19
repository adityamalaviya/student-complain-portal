'use client';

import React, { useState } from 'react';
import {
  CircleNotch,
  Funnel,
  ArrowsClockwise,
  X,
} from '@phosphor-icons/react';
import { EmptyState, ErrorState } from '@/components';
import type { AuditLog } from '@/types';

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

export interface PrincipalAuditTrailTabProps {
  auditLogs: AuditLog[];
  isLoading: boolean;
  error: string | null;
  actionFilter: string;
  onActionFilterChange: (filter: string) => void;
  onRefresh: () => void;
}

export function PrincipalAuditTrailTab({
  auditLogs,
  isLoading,
  error,
  actionFilter,
  onActionFilterChange,
  onRefresh,
}: PrincipalAuditTrailTabProps): React.ReactElement {
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            System Audit Trail
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Append-only immutable record of all lifecycle, governance, and privileged administrative mutations.
          </p>
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-2">
          <Funnel size={14} className="text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => onActionFilterChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition focus:border-blue-700 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Actions</option>
            <option value="issue_warning">issue_warning</option>
            <option value="respond_to_warning">respond_to_warning</option>
            <option value="assign_department_admin">assign_department_admin</option>
            <option value="revoke_department_admin">revoke_department_admin</option>
            <option value="update_complaint_status">update_complaint_status</option>
            <option value="add_progress_update">add_progress_update</option>
            <option value="request_phone_change">request_phone_change</option>
            <option value="review_phone_change">review_phone_change</option>
            <option value="complete_phone_change">complete_phone_change</option>
          </select>
          <button
            type="button"
            onClick={onRefresh}
            title="Refresh Audit Logs"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <ArrowsClockwise size={14} weight="bold" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center">
          <CircleNotch size={32} className="mx-auto animate-spin text-blue-700 dark:text-blue-400" />
        </div>
      ) : error ? (
        <ErrorState title="Failed to load audit logs" message={error} onRetry={onRefresh} />
      ) : auditLogs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
          <EmptyState
            title="No Audit Logs Found"
            description="No audit records match the current filter selection."
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/20 dark:text-slate-400">
                <tr>
                  <th scope="col" className="px-6 py-3.5">
                    Timestamp
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Action
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Actor
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Target Resource
                  </th>
                  <th scope="col" className="px-6 py-3.5">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((log) => (
                  <tr
                    key={log.$id}
                    className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-slate-500 dark:text-slate-400">
                      {formatTimestamp(log.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                          {log.actor_id.slice(-6)}
                        </span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          {log.actor_role}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                      {log.target_resource_type}:{log.target_resource_id.slice(-6)}
                    </td>
                    <td className="max-w-xs truncate px-6 py-4 font-mono text-[11px] text-slate-500 sm:max-w-sm dark:text-slate-400">
                      <button
                        type="button"
                        onClick={() => setSelectedAuditLog(log)}
                        className="text-left font-mono underline hover:text-blue-700 dark:hover:text-blue-400"
                      >
                        {log.details ? log.details.slice(0, 60) + '...' : '{}'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log Details Inspector Modal */}
      {selectedAuditLog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Audit Log Event Inspector
              </h3>
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Action:</span>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedAuditLog.action}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Timestamp:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.created_at}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="font-semibold text-slate-500">Actor:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.actor_id} ({selectedAuditLog.actor_role})
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Target Resource:</span>
                  <div className="font-mono text-slate-700 dark:text-slate-300">
                    {selectedAuditLog.target_resource_type}:{selectedAuditLog.target_resource_id}
                  </div>
                </div>
              </div>

              <div>
                <span className="font-semibold text-slate-500">Payload Details:</span>
                <pre className="mt-1 max-h-60 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-emerald-400">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedAuditLog.details), null, 2);
                    } catch {
                      return selectedAuditLog.details;
                    }
                  })()}
                </pre>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedAuditLog(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
