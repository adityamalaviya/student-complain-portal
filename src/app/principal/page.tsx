'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  CircleNotch,
  SignOut,
  ShieldCheck,
  Users,
  Scroll,
} from '@phosphor-icons/react';
import { useAuth, useAuthGuard } from '@/lib/hooks';
import {
  apiGetPrincipalDashboard,
  apiListAdminAssignments,
  apiRevokeAdmin,
  apiGetAuditHistory,
  apiListDepartments,
  apiDeleteDepartment,
} from '@/lib/api';
import type {
  PrincipalDashboardData,
  DepartmentAdminAssignment,
  AuditLog,
  Department,
} from '@/types';
import {
  PrincipalGrievanceOverviewTab,
  PrincipalAdminAssignmentsTab,
  PrincipalAuditTrailTab,
  CreateEditDepartmentModal,
  IssueWarningModal,
} from '@/components';

export default function PrincipalDashboardPage(): React.ReactElement {
  const { user, profile, loading, isPrincipal, signOutUser } = useAuth();
  useAuthGuard('principal');

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

  // Admin Assignments & Departments State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState<boolean>(false);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);

  const [adminAssignments, setAdminAssignments] = useState<DepartmentAdminAssignment[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState<boolean>(false);
  const [adminsError, setAdminsError] = useState<string | null>(null);

  // Department Modal State
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState<boolean>(false);
  const [departmentModalMode, setDepartmentModalMode] = useState<'create' | 'edit'>('create');
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [selectedDeptAdminEmail, setSelectedDeptAdminEmail] = useState<string>('');
  const [selectedDeptScopes, setSelectedDeptScopes] = useState<
    { maintenance: boolean; academic: boolean } | undefined
  >(undefined);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');

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

  // Fetch Departments
  const fetchDepartments = useCallback(async (): Promise<void> => {
    setIsLoadingDepartments(true);
    setDepartmentsError(null);
    try {
      const res = await apiListDepartments();
      if (res.success && res.data) {
        setDepartments(res.data.departments || []);
      } else {
        setDepartmentsError(res.error || 'Failed to load departments.');
      }
    } catch (err) {
      setDepartmentsError(err instanceof Error ? err.message : 'Network error loading departments.');
    } finally {
      setIsLoadingDepartments(false);
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
      fetchDepartments();
    }
  }, [user, isPrincipal, fetchDashboardData, fetchDepartments]);

  // Tab Change Data Fetch
  useEffect(() => {
    if (activeTab === 'admins') {
      fetchDepartments();
      fetchAdminAssignments();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab, fetchDepartments, fetchAdminAssignments, fetchAuditLogs]);

  // Department Modal Handlers
  const handleOpenCreateDepartment = (): void => {
    setDepartmentModalMode('create');
    setSelectedDepartment(null);
    setSelectedDeptAdminEmail('');
    setSelectedDeptScopes(undefined);
    setIsDepartmentModalOpen(true);
  };

  const handleOpenEditDepartment = (dept: Department): void => {
    setDepartmentModalMode('edit');
    setSelectedDepartment(dept);
    const activeForDept = adminAssignments.filter(
      (a) => a.department_id === dept.$id && a.is_active
    );
    const primaryAdmin = activeForDept[0]?.email || '';
    const hasAcademic =
      activeForDept.some((a) => a.scope === 'academic') || (dept.is_academic ?? false);
    const hasMaintenance =
      activeForDept.some((a) => a.scope === 'maintenance') || (dept.is_maintenance ?? true);
    setSelectedDeptAdminEmail(primaryAdmin);
    setSelectedDeptScopes({ maintenance: hasMaintenance, academic: hasAcademic });
    setIsDepartmentModalOpen(true);
  };

  const handleDeleteDepartment = async (
    departmentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await apiDeleteDepartment(departmentId);
      if (res.success) {
        await Promise.all([fetchDepartments(), fetchAdminAssignments()]);
        return { success: true };
      }
      return { success: false, error: res.error || 'Failed to delete department.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error deleting department.',
      };
    }
  };

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
            departments={departments}
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

        {/* Tab 2: Admin Assignments & Departments */}
        {activeTab === 'admins' && (
          <PrincipalAdminAssignmentsTab
            departments={departments}
            assignments={adminAssignments}
            isLoading={isLoadingDepartments || isLoadingAdmins}
            error={departmentsError || adminsError}
            onRefresh={() => {
              fetchDepartments();
              fetchAdminAssignments();
            }}
            onOpenCreateModal={handleOpenCreateDepartment}
            onOpenEditModal={handleOpenEditDepartment}
            onDeleteDepartment={handleDeleteDepartment}
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

      {/* Create / Edit Department Modal */}
      <CreateEditDepartmentModal
        isOpen={isDepartmentModalOpen}
        mode={departmentModalMode}
        department={selectedDepartment}
        initialAdminEmail={selectedDeptAdminEmail}
        initialScopes={selectedDeptScopes}
        onClose={() => setIsDepartmentModalOpen(false)}
        onSuccess={() => {
          fetchDepartments();
          fetchAdminAssignments();
        }}
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
