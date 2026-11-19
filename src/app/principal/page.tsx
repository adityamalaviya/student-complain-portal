'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  CircleNotch,
  SignOut,
  ShieldCheck,
  Users,
  Scroll,
} from '@phosphor-icons/react';
import { useAuth } from '@/lib/hooks';
import {
  apiGetPrincipalDashboard,
  apiListAdminAssignments,
  apiRevokeAdmin,
  apiGetAuditHistory,
} from '@/lib/api';
import type {
  PrincipalDashboardData,
  DepartmentAdminAssignment,
  AuditLog,
} from '@/types';
import {
  PrincipalGrievanceOverviewTab,
  PrincipalAdminAssignmentsTab,
  PrincipalAuditTrailTab,
  AssignAdminModal,
  IssueWarningModal,
} from '@/components';

export default function PrincipalDashboardPage(): React.ReactElement {
  const router = useRouter();
  const { user, profile, loading, isPrincipal, signOutUser } = useAuth();

  // Tab Navigation State
  const [activeTab, setActiveTab] = useState<'overview' | 'admins' | 'audit'>('overview');

  // Overview Tab State
  const [dashboardData, setDashboardData] = useState<PrincipalDashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Warning Modal State
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false);
  const [selectedComplaintForWarning, setSelectedComplaintForWarning] = useState<{
    id: string;
    title: string;
    departmentName: string;
    daysDelayed: number;
  } | null>(null);

  // Admin Assignments State
  const [adminAssignments, setAdminAssignments] = useState<DepartmentAdminAssignment[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState<boolean>(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

  // Auth Guard
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/sign-in');
      } else if (!isPrincipal) {
        router.push('/dashboard');
      }
    }
  }, [loading, user, isPrincipal, router]);

  // Fetch Dashboard Metrics & Delayed Grievances
  const fetchDashboardData = useCallback(async (): Promise<void> => {
    setIsLoadingDashboard(true);
    setFetchError(null);
    try {
      const res = await apiGetPrincipalDashboard();
      if (res.success && res.data) {
        setDashboardData(res.data);
      } else {
        setFetchError(res.error || 'Unable to load institutional oversight data.');
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Network error loading dashboard.');
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  // Fetch Admin Assignments
  const fetchAdminAssignments = useCallback(async (): Promise<void> => {
    setIsLoadingAdmins(true);
    setAdminsError(null);
    try {
      const res = await apiListAdminAssignments();
      if (res.success && res.data) {
        setAdminAssignments(res.data.assignments || []);
      } else {
        setAdminsError(res.error || 'Failed to load administrator assignments.');
      }
    } catch (err) {
      setAdminsError(err instanceof Error ? err.message : 'Network error loading admin assignments.');
    } finally {
      setIsLoadingAdmins(false);
    }
  }, []);

  // Fetch System Audit Logs
  const fetchAuditLogs = useCallback(async (): Promise<void> => {
    setIsLoadingAudit(true);
    setAuditError(null);
    try {
      const res = await apiGetAuditHistory({
        limit: 100,
        action: auditActionFilter === 'all' ? undefined : auditActionFilter,
      });
      if (res.success && res.data) {
        setAuditLogs(res.data.audit_logs || []);
      } else {
        setAuditError(res.error || 'Failed to load audit history.');
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : 'Network error loading audit history.');
    } finally {
      setIsLoadingAudit(false);
    }
  }, [auditActionFilter]);

  // Initial Data Fetch
  useEffect(() => {
    if (user && isPrincipal) {
      fetchDashboardData();
    }
  }, [user, isPrincipal, fetchDashboardData]);

  // Tab Change Data Fetch
  useEffect(() => {
    if (activeTab === 'admins') {
      fetchAdminAssignments();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAdminAssignments, fetchAuditLogs]);

  // Revoke Handler for Tab
  const handleRevokeAssignment = async (
    assignmentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiRevokeAdmin(assignmentId);
      if (res.success) {
        await fetchAdminAssignments();
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to revoke administrator.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error revoking administrator.',
      };
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  if (!user || !isPrincipal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <CircleNotch size={32} className="animate-spin text-blue-700 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 transition-colors dark:bg-slate-950 dark:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-12">
          {/* Logo / Branding */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-white shadow-xs">
              <ShieldCheck size={24} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                  CampusVoice
                </span>
                <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-blue-800 uppercase dark:bg-blue-950 dark:text-blue-300">
                  Principal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Institutional Governance &amp; Compliance
              </p>
            </div>
          </div>

          {/* User & Sign Out */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 border-r border-slate-200 pr-3 sm:pr-4 dark:border-slate-800">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-mono text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                PRN
              </div>
              <span className="hidden text-xs font-semibold text-slate-800 sm:inline dark:text-slate-200">
                {profile?.name || 'Principal'}
              </span>
            </div>

            <button
              type="button"
              onClick={signOutUser}
              title="Sign Out"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-red-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-red-400"
            >
              <SignOut size={15} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-12">
        {/* Page Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Institutional Governance
            </h1>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
              Cross-departmental monitoring, administrative warning directives, and system audit log verification.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-8 flex border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'overview'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck size={18} weight={activeTab === 'overview' ? 'bold' : 'regular'} />
            <span>Grievance Oversight</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('admins')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'admins'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users size={18} weight={activeTab === 'admins' ? 'bold' : 'regular'} />
            <span>Admin Assignments</span>
            {adminAssignments.length > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {adminAssignments.filter((a) => a.is_active).length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition sm:text-sm ${
              activeTab === 'audit'
                ? 'border-blue-700 text-blue-700 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Scroll size={18} weight={activeTab === 'audit' ? 'bold' : 'regular'} />
            <span>Audit Trail</span>
          </button>
        </div>

        {/* Tab 1: Grievance Oversight */}
        {activeTab === 'overview' && (
          <PrincipalGrievanceOverviewTab
            dashboardData={dashboardData}
            isLoading={isLoadingDashboard}
            error={fetchError}
            departmentFilter={departmentFilter}
            onDepartmentFilterChange={setDepartmentFilter}
            onRetry={fetchDashboardData}
            onIssueWarning={(complaint) => {
              setSelectedComplaintForWarning(complaint);
              setWarningModalOpen(true);
            }}
          />
        )}

        {/* Tab 2: Admin Assignments */}
        {activeTab === 'admins' && (
          <PrincipalAdminAssignmentsTab
            assignments={adminAssignments}
            isLoading={isLoadingAdmins}
            error={adminsError}
            onRefresh={fetchAdminAssignments}
            onOpenAssignModal={() => setIsAssignModalOpen(true)}
            onRevoke={handleRevokeAssignment}
          />
        )}

        {/* Tab 3: System Audit Trail */}
        {activeTab === 'audit' && (
          <PrincipalAuditTrailTab
            auditLogs={auditLogs}
            isLoading={isLoadingAudit}
            error={auditError}
            actionFilter={auditActionFilter}
            onActionFilterChange={setAuditActionFilter}
            onRefresh={fetchAuditLogs}
          />
        )}
      </main>

      {/* Assign Administrator Modal */}
      <AssignAdminModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={fetchAdminAssignments}
      />

      {/* Issue Warning Modal */}
      {selectedComplaintForWarning && (
        <IssueWarningModal
          isOpen={warningModalOpen}
          complaintId={selectedComplaintForWarning.id}
          complaintTitle={selectedComplaintForWarning.title}
          departmentName={selectedComplaintForWarning.departmentName}
          daysDelayed={selectedComplaintForWarning.daysDelayed}
          onClose={() => {
            setWarningModalOpen(false);
            setSelectedComplaintForWarning(null);
          }}
          onSuccess={fetchDashboardData}
        />
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        CampusVoice Institutional Governance Portal • Office of the Principal
      </footer>
    </div>
  );
}
