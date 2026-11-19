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
  isAcademicDepartment,
  isMaintenanceDepartment,
  type DatabaseClientLike,
} from '../departments.js';
import { isDelayed } from './complaints.js';
import type {
  AdminScope,
  AppwriteContext,
  AuditLog,
  AuthenticatedCaller,
  Complaint,
  ComplaintWarning,
  DepartmentAdminAssignment,
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

function toAdminAssignmentModel(doc: Models.Document): DepartmentAdminAssignment {
  return {
    $id: doc.$id,
    user_id: readStringField(doc, 'user_id'),
    email: readStringField(doc, 'email'),
    department_id: readStringField(doc, 'department_id'),
    scope: (readStringField(doc, 'scope') || 'maintenance') as AdminScope,
    is_active: readBooleanField(doc, 'is_active') ?? true,
    assigned_by: readStringField(doc, 'assigned_by'),
    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
  };
}

function toAuditLogModel(doc: Models.Document): AuditLog {
  return {
    $id: doc.$id,
    action: readStringField(doc, 'action'),
    actor_id: readStringField(doc, 'actor_id'),
    actor_role: (readStringField(doc, 'actor_role') || 'system') as AuditLog['actor_role'],
    target_resource_id: readStringField(doc, 'target_resource_id'),
    target_resource_type: readStringField(doc, 'target_resource_type'),
    details: readStringField(doc, 'details'),
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
      [Query.orderDesc('$createdAt'), Query.limit(500)]
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

      // Check 5-day delay eligibility using authoritative isDelayed
      const isComplaintDelayed = isDelayed({
        status: complaint.status,
        created_at: complaint.created_at || (doc.$createdAt as string) || '',
        last_meaningful_update_at:
          complaint.last_meaningful_update_at ||
          complaint.created_at ||
          (doc.$createdAt as string) ||
          '',
      });
      if (isComplaintDelayed) {
        totalDelayed += 1;
        breakdown[deptId].delayed += 1;

        const complaintId = complaint.$id || doc.$id;
        const delayInfo = calculateComplaintDelay(complaint, now);
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

// ----------------------------------------------------
// 4. List Department Admin Assignments (Principal Only)
// ----------------------------------------------------
export async function handleListAdminAssignments(
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
        error: 'Only the Principal can view administrator assignments.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  try {
    const result = await databases.listDocuments(
      config.databaseId,
      config.departmentAdminsCollectionId,
      [Query.orderDesc('created_at'), Query.limit(100)]
    );

    return res.json(
      {
        success: true,
        data: {
          assignments: result.documents.map(toAdminAssignmentModel),
          total: result.total,
        },
      },
      200
    );
  } catch (err) {
    error(`[principal] Error listing admin assignments: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to list administrator assignments.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 5. Assign Department Administrator (Principal Only)
// ----------------------------------------------------
export async function handleAssignAdmin(
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
        error: 'Only the Principal can assign department administrators.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const departmentId = typeof data.department_id === 'string' ? data.department_id.trim() : '';
  const scope = data.scope === 'academic' || data.scope === 'maintenance' ? data.scope : null;
  const targetUserId = typeof data.user_id === 'string' ? data.user_id.trim() : '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json(
      {
        success: false,
        error: 'A valid email address is required.',
        code: 'INVALID_EMAIL',
      },
      400
    );
  }

  const resolvedDept = resolveDepartment(departmentId);
  if (!resolvedDept) {
    return res.json(
      {
        success: false,
        error: 'Invalid department ID. Must be one of the six canonical institutional departments.',
        code: 'INVALID_DEPARTMENT',
      },
      400
    );
  }

  if (!scope) {
    return res.json(
      {
        success: false,
        error: "Scope must be either 'academic' or 'maintenance'.",
        code: 'INVALID_SCOPE',
      },
      400
    );
  }

  // Canonical Invariant: Water and Sanitation are maintenance-only and cannot have academic administrators
  if (scope === 'academic' && !resolvedDept.is_academic) {
    return res.json(
      {
        success: false,
        error: `Department '${resolvedDept.name}' (${resolvedDept.id}) is maintenance-only and cannot be assigned academic scope.`,
        code: 'INVALID_DEPARTMENT_SCOPE',
      },
      400
    );
  }

  try {
    // Guard against duplicate active assignments
    try {
      const existingActive = await databases.listDocuments(
        config.databaseId,
        config.departmentAdminsCollectionId,
        [
          Query.equal('email', email),
          Query.equal('department_id', resolvedDept.id),
          Query.equal('scope', scope),
          Query.equal('is_active', true),
          Query.limit(1),
        ]
      );
      if (existingActive.documents.length > 0) {
        return res.json(
          {
            success: false,
            error: `An active administrator assignment already exists for ${email} in department '${resolvedDept.name}' with scope '${scope}'.`,
            code: 'ASSIGNMENT_ALREADY_EXISTS',
          },
          409
        );
      }
    } catch {
      // Non-fatal if collection or index query throws
    }

    const now = new Date().toISOString();
    const docId = `da_${ID.unique().slice(0, 32)}`;

    // Try finding user_id from profiles if not explicitly supplied
    let effectiveUserId = targetUserId;
    if (!effectiveUserId) {
      try {
        const userProfiles = await databases.listDocuments(
          config.databaseId,
          config.profilesCollectionId,
          [Query.equal('email', email), Query.limit(1)]
        );
        if (userProfiles.documents.length > 0) {
          effectiveUserId = userProfiles.documents[0].$id;
        }
      } catch {
        // non-fatal, fallback to empty string
      }
    }

    const newAssignment = await databases.createDocument(
      config.databaseId,
      config.departmentAdminsCollectionId,
      docId,
      {
        user_id: effectiveUserId,
        email,
        department_id: resolvedDept.id,
        scope,
        is_active: true,
        assigned_by: caller.id,
        created_at: now,
      },
      [] // Strictly empty permissions ($permissions = [])
    );

    // Update user profile role to department_admin if profile exists
    if (effectiveUserId) {
      try {
        await databases.updateDocument(
          config.databaseId,
          config.profilesCollectionId,
          effectiveUserId,
          {
            role: 'department_admin',
          }
        );
      } catch {
        // Profile update is non-fatal if user has not yet signed up or logged in
      }
    }

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'assign_department_admin',
        actor_id: caller.id,
        actor_role: 'principal',
        target_resource_id: newAssignment.$id,
        target_resource_type: 'department_admin',
        details: {
          user_id: effectiveUserId,
          email,
          department_id: resolvedDept.id,
          scope,
          assigned_by: caller.id,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          assignment: toAdminAssignmentModel(newAssignment),
        },
      },
      201
    );
  } catch (err) {
    error(`[principal] Error assigning department admin: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to assign department administrator.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 6. Revoke Department Administrator (Principal Only)
// ----------------------------------------------------
export async function handleRevokeAdmin(
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
        error: 'Only the Principal can revoke administrator assignments.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const assignmentId = typeof data.assignment_id === 'string' ? data.assignment_id.trim() : '';
  if (!assignmentId) {
    return res.json(
      {
        success: false,
        error: 'Assignment ID is required.',
        code: 'INVALID_ASSIGNMENT_ID',
      },
      400
    );
  }

  try {
    const doc = await databases.getDocument(
      config.databaseId,
      config.departmentAdminsCollectionId,
      assignmentId
    );

    const updatedDoc = await databases.updateDocument(
      config.databaseId,
      config.departmentAdminsCollectionId,
      assignmentId,
      {
        is_active: false,
      }
    );

    const targetUserId = readStringField(doc, 'user_id');
    const targetEmail = readStringField(doc, 'email');

    // Check if target user has any remaining active admin assignments
    if (targetUserId) {
      try {
        const remaining = await databases.listDocuments(
          config.databaseId,
          config.departmentAdminsCollectionId,
          [Query.equal('user_id', targetUserId), Query.equal('is_active', true), Query.limit(10)]
        );

        const activeRemaining = remaining.documents.filter(
          (d) => d.$id !== assignmentId && (readBooleanField(d, 'is_active') ?? true)
        );

        if (activeRemaining.length === 0) {
          // Revert profile role to student
          await databases.updateDocument(
            config.databaseId,
            config.profilesCollectionId,
            targetUserId,
            {
              role: 'student',
            }
          );
        }
      } catch {
        // non-fatal
      }
    }

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'revoke_department_admin',
        actor_id: caller.id,
        actor_role: 'principal',
        target_resource_id: assignmentId,
        target_resource_type: 'department_admin',
        details: {
          assignment_id: assignmentId,
          user_id: targetUserId,
          email: targetEmail,
          revoked_by: caller.id,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          assignment: toAdminAssignmentModel(updatedDoc),
        },
      },
      200
    );
  } catch (err) {
    error(`[principal] Error revoking admin assignment ${assignmentId}: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to revoke department administrator assignment.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 7. Get System Audit History (Principal Only)
// ----------------------------------------------------
export async function handleGetAuditHistory(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown> = {},
  deps?: PrincipalHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  if (caller.role !== 'principal') {
    return res.json(
      {
        success: false,
        error: 'Only the Principal can inspect system audit logs.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  try {
    const rawLimit = Number(data.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 50;

    const queries = [Query.orderDesc('created_at'), Query.limit(limit)];

    if (typeof data.action === 'string' && data.action.trim()) {
      queries.push(Query.equal('action', data.action.trim()));
    }
    if (typeof data.actor_id === 'string' && data.actor_id.trim()) {
      queries.push(Query.equal('actor_id', data.actor_id.trim()));
    }
    if (typeof data.target_resource_id === 'string' && data.target_resource_id.trim()) {
      queries.push(Query.equal('target_resource_id', data.target_resource_id.trim()));
    }

    const result = await databases.listDocuments(
      config.databaseId,
      config.auditLogsCollectionId,
      queries
    );

    return res.json(
      {
        success: true,
        data: {
          audit_logs: result.documents.map(toAuditLogModel),
          total: result.total,
        },
      },
      200
    );
  } catch (err) {
    error(`[principal] Error loading audit history: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to retrieve audit logs.',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
}
