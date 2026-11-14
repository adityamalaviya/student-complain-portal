import { ID, Query, type Models } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import {
  calculateComplaintDelay,
  INSTITUTIONAL_DEPARTMENTS,
  normalizeComplaintStatus,
  readBooleanField,
  readNumberField,
  readStringField,
  resolveDepartment,
  type DatabaseClientLike,
} from '../departments.js';
import type {
  AppwriteContext,
  AuthenticatedCaller,
  Complaint,
  ComplaintWarning,
  DepartmentId,
  PrincipalMetrics,
} from '../types.js';
import { appendAuditLog } from './audit.js';

export interface PrincipalHandlerDeps {
  databases?: DatabaseClientLike;
}

function toComplaintModel(doc: Models.Document): Complaint {
  return {
    $id: doc.$id,
    student_user_id: readStringField(doc, 'student_user_id'),
    student_name: readStringField(doc, 'student_name'),
    student_enrollment_no: readStringField(doc, 'student_enrollment_no'),
    student_phone_number: readStringField(doc, 'student_phone_number') || undefined,
    student_department_id: readStringField(doc, 'student_department_id'),
    maintenance_department_id: readStringField(doc, 'maintenance_department_id'),
    title: readStringField(doc, 'title'),
    location: readStringField(doc, 'location'),
    description: readStringField(doc, 'description'),
    priority: (readStringField(doc, 'priority') || 'medium') as Complaint['priority'],
    status: (normalizeComplaintStatus(readStringField(doc, 'status')) || 'Pending') as Complaint['status'],
    support_count: readNumberField(doc, 'support_count') ?? 1,
    last_meaningful_update_at: readStringField(doc, 'last_meaningful_update_at') || undefined,
    attachment_file_id: readStringField(doc, 'attachment_file_id') || undefined,
    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
  };
}

function toWarningModel(doc: Models.Document): ComplaintWarning {
  return {
    $id: doc.$id,
    complaint_id: readStringField(doc, 'complaint_id'),
    issued_by_principal_id: readStringField(doc, 'issued_by_principal_id'),
    warning_reason: readStringField(doc, 'warning_reason'),
    days_delayed: readNumberField(doc, 'days_delayed') ?? 0,
    admin_response: readStringField(doc, 'admin_response') || undefined,
    responded_at: readStringField(doc, 'responded_at') || undefined,
    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
  };
}

// ----------------------------------------------------
// 1. Get Principal Dashboard Foundation (All 6 Departments)
// ----------------------------------------------------
export async function handleGetPrincipalDashboard(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  deps?: PrincipalHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  if (caller.role !== 'principal') {
    return res.json(
      {
        success: false,
        error: 'Only the Principal can access the institutional governance dashboard.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  try {
    // 1. Query complaints across all departments (up to 500)
    const complaintsResult = await databases.listDocuments(
      config.databaseId,
      config.complaintsCollectionId,
      [Query.orderDesc('created_at'), Query.limit(500)]
    );

    // 2. Query all warnings
    let allWarnings: Models.Document[] = [];
    try {
      const warningsResult = await databases.listDocuments(
        config.databaseId,
        config.warningsCollectionId,
        [Query.orderDesc('created_at'), Query.limit(500)]
      );
      allWarnings = warningsResult.documents;
    } catch {
      allWarnings = [];
    }

    // Index warnings by complaint_id
    const warningsByComplaint = new Map<string, ComplaintWarning[]>();
    for (const wDoc of allWarnings) {
      const model = toWarningModel(wDoc);
      const list = warningsByComplaint.get(model.complaint_id) || [];
      list.push(model);
      warningsByComplaint.set(model.complaint_id, list);
    }

    // 3. Compute Metrics & Breakdown for all 6 Canonical Departments
    const breakdown: PrincipalMetrics['department_breakdown'] = {};
    for (const dept of INSTITUTIONAL_DEPARTMENTS) {
      breakdown[dept.id] = {
        total: 0,
        pending: 0,
        in_progress: 0,
        resolved: 0,
        delayed: 0,
      };
    }

    let totalPending = 0;
    let totalInProgress = 0;
    let totalResolved = 0;
    let totalDelayed = 0;

    const delayedComplaintsList: Array<{
      complaint: Complaint;
      days_delayed: number;
      warning_count: number;
      warnings: ComplaintWarning[];
      is_warning_eligible: boolean;
    }> = [];

    const now = new Date();

    for (const doc of complaintsResult.documents) {
      const complaint = toComplaintModel(doc);
      const status = complaint.status;
      const deptId = complaint.maintenance_department_id as DepartmentId;

      if (!breakdown[deptId]) {
        breakdown[deptId] = { total: 0, pending: 0, in_progress: 0, resolved: 0, delayed: 0 };
      }

      breakdown[deptId].total += 1;

      if (status === 'Pending') {
        totalPending += 1;
        breakdown[deptId].pending += 1;
      } else if (status === 'In Progress') {
        totalInProgress += 1;
        breakdown[deptId].in_progress += 1;
      } else if (status === 'Resolved') {
        totalResolved += 1;
        breakdown[deptId].resolved += 1;
      }

      // Check 5-day delay eligibility
      const delayInfo = calculateComplaintDelay(complaint, now);
      if (delayInfo.is_delayed) {
        totalDelayed += 1;
        breakdown[deptId].delayed += 1;

        const complaintId = complaint.$id || doc.$id;
        const complaintWarnings = complaintId ? warningsByComplaint.get(complaintId) || [] : [];
        delayedComplaintsList.push({
          complaint,
          days_delayed: delayInfo.days_delayed,
          warning_count: complaintWarnings.length,
          warnings: complaintWarnings,
          is_warning_eligible: status !== 'Resolved',
        });
      }
    }

    const metrics: PrincipalMetrics = {
      total_complaints: complaintsResult.total,
      total_pending: totalPending,
      total_in_progress: totalInProgress,
      total_resolved: totalResolved,
      total_delayed: totalDelayed,
      total_warnings_issued: allWarnings.length,
      department_breakdown: breakdown,
    };

    return res.json(
      {
        success: true,
        data: {
          metrics,
          delayed_complaints: delayedComplaintsList,
          recent_complaints: complaintsResult.documents.slice(0, 50).map(toComplaintModel),
          recent_warnings: allWarnings.slice(0, 50).map(toWarningModel),
        },
      },
      200
    );
  } catch (err) {
    error(`[principal] Error loading principal dashboard: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to load Principal dashboard metrics.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 2. Issue Manual Warning on Delayed Unresolved Complaint
// ----------------------------------------------------
export async function handleIssueWarning(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: PrincipalHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  if (caller.role !== 'principal') {
    return res.json(
      {
        success: false,
        error: 'Only the Principal can issue warnings on delayed complaints.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const warningReason = typeof data.warning_reason === 'string' ? data.warning_reason.trim() : '';

  if (!complaintId) {
    return res.json(
      {
        success: false,
        error: 'Complaint ID is required.',
        code: 'INVALID_COMPLAINT_ID',
      },
      400
    );
  }

  if (warningReason.length < 10 || warningReason.length > 2000) {
    return res.json(
      {
        success: false,
        error: 'Warning reason must be between 10 and 2000 characters.',
        code: 'INVALID_WARNING_REASON',
      },
      400
    );
  }

  try {
    const doc = await databases.getDocument(
      config.databaseId,
      config.complaintsCollectionId,
      complaintId
    );

    const complaint = toComplaintModel(doc);

    // Rule: Principal cannot warn on resolved complaints
    if (complaint.status === 'Resolved') {
      return res.json(
        {
          success: false,
          error: 'Principal cannot issue warnings on resolved complaints.',
          code: 'CANNOT_WARN_RESOLVED',
        },
        400
      );
    }

    // Rule: Pending/In Progress must exceed 5 days
    const delayInfo = calculateComplaintDelay(complaint);
    if (!delayInfo.is_delayed) {
      return res.json(
        {
          success: false,
          error: `Complaint is not eligible for a warning. Elapsed time since last milestone has not exceeded 5 days (currently ${delayInfo.days_delayed} days).`,
          code: 'NOT_DELAY_ELIGIBLE',
        },
        400
      );
    }

    const now = new Date().toISOString();
    const docId = `cw_${ID.unique().slice(0, 32)}`;

    const newWarning = await databases.createDocument(
      config.databaseId,
      config.warningsCollectionId,
      docId,
      {
        complaint_id: complaint.$id,
        issued_by_principal_id: caller.id,
        warning_reason: warningReason,
        days_delayed: delayInfo.days_delayed,
        admin_response: '',
        responded_at: '',
        created_at: now,
      },
      [] // Strictly empty permissions ($permissions = [])
    );

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'issue_warning',
        actor_id: caller.id,
        actor_role: 'principal',
        target_resource_id: newWarning.$id,
        target_resource_type: 'complaint_warning',
        details: {
          complaint_id: complaint.$id,
          maintenance_department_id: complaint.maintenance_department_id,
          days_delayed: delayInfo.days_delayed,
          warning_reason: warningReason,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          warning: toWarningModel(newWarning),
        },
      },
      201
    );
  } catch (err) {
    error(`[principal] Error issuing warning for complaint ${complaintId}: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to issue warning.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 3. Admin Responds to Principal Warning
// ----------------------------------------------------
export async function handleRespondToWarning(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: PrincipalHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  const warningId = typeof data.warning_id === 'string' ? data.warning_id.trim() : '';
  const adminResponse = typeof data.admin_response === 'string' ? data.admin_response.trim() : '';

  if (!warningId) {
    return res.json(
      {
        success: false,
        error: 'Warning ID is required.',
        code: 'INVALID_WARNING_ID',
      },
      400
    );
  }

  if (adminResponse.length < 10 || adminResponse.length > 2000) {
    return res.json(
      {
        success: false,
        error: 'Admin response must be between 10 and 2000 characters.',
        code: 'INVALID_ADMIN_RESPONSE',
      },
      400
    );
  }

  try {
    const warningDoc = await databases.getDocument(
      config.databaseId,
      config.warningsCollectionId,
      warningId
    );

    const complaintId = readStringField(warningDoc, 'complaint_id');
    const complaintDoc = await databases.getDocument(
      config.databaseId,
      config.complaintsCollectionId,
      complaintId
    );

    const maintenanceDeptId = readStringField(complaintDoc, 'maintenance_department_id');

    // Canonical Authorization Check:
    // Only the Maintenance Admin assigned to this department (or Principal) can respond.
    const isPrincipal = caller.role === 'principal';
    let isAuthorizedAdmin = false;

    if (!isPrincipal && caller.role === 'department_admin') {
      const maintenanceAssignments = (caller.admin_assignments || []).filter(
        (a) => a.is_active && a.scope === 'maintenance' && a.department_id === maintenanceDeptId
      );
      isAuthorizedAdmin = maintenanceAssignments.length > 0;
    }

    if (!isPrincipal && !isAuthorizedAdmin) {
      return res.json(
        {
          success: false,
          error: 'Only the assigned Maintenance Department Administrator can respond to this warning.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const now = new Date().toISOString();
    const updatedDoc = await databases.updateDocument(
      config.databaseId,
      config.warningsCollectionId,
      warningId,
      {
        admin_response: adminResponse,
        responded_at: now,
      }
    );

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'respond_to_warning',
        actor_id: caller.id,
        actor_role: caller.role,
        target_resource_id: warningId,
        target_resource_type: 'complaint_warning',
        details: {
          complaint_id: complaintId,
          maintenance_department_id: maintenanceDeptId,
          admin_response: adminResponse,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          warning: toWarningModel(updatedDoc),
        },
      },
      200
    );
  } catch (err) {
    error(`[principal] Error responding to warning ${warningId}: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to submit response to warning.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}
