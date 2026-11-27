import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { calculateComplaintDelay, INSTITUTIONAL_DEPARTMENTS, isComplaintDelayed, normalizeComplaintStatus, readBooleanField, readNumberField, readStringField, resolveDepartment, } from '../departments.js';
import { getWarningState, hasCompleteStudentProfileFields, validateWarningResponse, } from '../stateMachines.js';
import { appendAuditLog } from './audit.js';
function toComplaintModel(doc) {
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
        priority: (readStringField(doc, 'priority') || 'medium'),
        status: (normalizeComplaintStatus(readStringField(doc, 'status')) || 'Pending'),
        support_count: readNumberField(doc, 'support_count') ?? 1,
        last_meaningful_update_at: readStringField(doc, 'last_meaningful_update_at') || undefined,
        attachment_file_id: readStringField(doc, 'attachment_file_id') || undefined,
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
        updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
    };
}
function toWarningModel(doc) {
    const adminResponse = readStringField(doc, 'admin_response') || undefined;
    const respondedAt = readStringField(doc, 'responded_at') || undefined;
    return {
        $id: doc.$id,
        complaint_id: readStringField(doc, 'complaint_id'),
        issued_by_principal_id: readStringField(doc, 'issued_by_principal_id'),
        warning_reason: readStringField(doc, 'warning_reason'),
        days_delayed: readNumberField(doc, 'days_delayed') ?? 0,
        admin_response: adminResponse,
        responded_at: respondedAt,
        state: getWarningState({
            admin_response: adminResponse,
            responded_at: respondedAt,
        }),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    };
}
function toAdminAssignmentModel(doc) {
    return {
        $id: doc.$id,
        user_id: readStringField(doc, 'user_id'),
        email: readStringField(doc, 'email'),
        department_id: readStringField(doc, 'department_id'),
        scope: (readStringField(doc, 'scope') || 'maintenance'),
        is_active: readBooleanField(doc, 'is_active') ?? true,
        assigned_by: readStringField(doc, 'assigned_by'),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    };
}
function toAuditLogModel(doc) {
    return {
        $id: doc.$id,
        action: readStringField(doc, 'action'),
        actor_id: readStringField(doc, 'actor_id'),
        actor_role: (readStringField(doc, 'actor_role') || 'system'),
        target_resource_id: readStringField(doc, 'target_resource_id'),
        target_resource_type: readStringField(doc, 'target_resource_type'),
        details: readStringField(doc, 'details'),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    };
}
// ----------------------------------------------------
// 1. Get Principal Dashboard Foundation (All 6 Departments)
// ----------------------------------------------------
export async function handleGetPrincipalDashboard(context, caller, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can access the institutional governance dashboard.',
            code: 'FORBIDDEN',
        }, 403);
    }
    try {
        // 0. Query active departments (canonical + custom), defaulting to canonical
        let activeDepartments = INSTITUTIONAL_DEPARTMENTS.map((dept) => ({
            id: dept.id,
            name: dept.name,
        }));
        try {
            const deptListRes = await databases.listDocuments(config.databaseId, config.departmentsCollectionId, [Query.limit(100)]);
            if (deptListRes.total > 0) {
                const dbById = new Map();
                for (const doc of deptListRes.documents) {
                    const isActive = readBooleanField(doc, 'is_active') ?? true;
                    const name = readStringField(doc, 'name') || doc.$id;
                    dbById.set(doc.$id, { id: doc.$id, name, isActive });
                }
                const merged = [];
                for (const can of INSTITUTIONAL_DEPARTMENTS) {
                    if (dbById.has(can.id)) {
                        const dbItem = dbById.get(can.id);
                        if (dbItem.isActive) {
                            merged.push({ id: can.id, name: dbItem.name || can.name });
                        }
                        dbById.delete(can.id);
                    }
                    else {
                        merged.push({ id: can.id, name: can.name });
                    }
                }
                for (const [id, custom] of dbById.entries()) {
                    if (custom.isActive) {
                        merged.push({ id, name: custom.name });
                    }
                }
                activeDepartments = merged;
            }
        }
        catch {
            // Fallback to canonical departments if collection query fails
        }
        const breakdown = {};
        for (const dept of activeDepartments) {
            breakdown[dept.id] = {
                total: 0,
                pending: 0,
                in_progress: 0,
                resolved: 0,
                delayed: 0,
            };
        }
        // 1. Parallel index-backed count queries per department and status (Query.limit(1) for scale)
        const countQueries = activeDepartments.flatMap((dept) => [
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', dept.id),
                Query.equal('status', 'Pending'),
                Query.limit(1),
            ]),
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', dept.id),
                Query.equal('status', 'In Progress'),
                Query.limit(1),
            ]),
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', dept.id),
                Query.equal('status', 'Resolved'),
                Query.limit(1),
            ]),
        ]);
        const now = new Date();
        const fiveDaysAgoIso = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
        // 2. Parallel queries for count, recent feed, warnings, and date-indexed delayed issues
        const [countResults, recentComplaintsRes, warningsResult, pendingDelayedRes, inProgressDelayedRes] = await Promise.all([
            Promise.all(countQueries),
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.orderDesc('$createdAt'),
                Query.limit(50),
            ]),
            databases
                .listDocuments(config.databaseId, config.warningsCollectionId, [
                Query.orderDesc('created_at'),
                Query.limit(100),
            ])
                .catch(() => ({ total: 0, documents: [] })),
            databases
                .listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('status', 'Pending'),
                Query.lessThan('last_meaningful_update_at', fiveDaysAgoIso),
                Query.limit(100),
            ])
                .catch(async () => {
                return await databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                    Query.equal('status', 'Pending'),
                    Query.limit(100),
                ]);
            }),
            databases
                .listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('status', 'In Progress'),
                Query.lessThan('last_meaningful_update_at', fiveDaysAgoIso),
                Query.limit(100),
            ])
                .catch(async () => {
                return await databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                    Query.equal('status', 'In Progress'),
                    Query.limit(100),
                ]);
            }),
        ]);
        // 3. Populate department counts and institutional metrics
        let totalPending = 0;
        let totalInProgress = 0;
        let totalResolved = 0;
        for (let i = 0; i < activeDepartments.length; i++) {
            const dept = activeDepartments[i];
            const pendingCount = countResults[i * 3]?.total ?? 0;
            const inProgCount = countResults[i * 3 + 1]?.total ?? 0;
            const resolvedCount = countResults[i * 3 + 2]?.total ?? 0;
            const deptTotal = pendingCount + inProgCount + resolvedCount;
            breakdown[dept.id] = {
                total: deptTotal,
                pending: pendingCount,
                in_progress: inProgCount,
                resolved: resolvedCount,
                delayed: 0,
            };
            totalPending += pendingCount;
            totalInProgress += inProgCount;
            totalResolved += resolvedCount;
        }
        const totalComplaints = totalPending + totalInProgress + totalResolved;
        const allWarnings = warningsResult.documents;
        // Index warnings by complaint_id
        const warningsByComplaint = new Map();
        for (const wDoc of allWarnings) {
            const model = toWarningModel(wDoc);
            const list = warningsByComplaint.get(model.complaint_id) || [];
            list.push(model);
            warningsByComplaint.set(model.complaint_id, list);
        }
        // 4. Identify 5-day overdue grievances among active unresolved complaints
        let totalDelayed = 0;
        const delayedComplaintsList = [];
        const seenComplaintIds = new Set();
        const unresolvedDocs = [...pendingDelayedRes.documents, ...inProgressDelayedRes.documents];
        for (const doc of unresolvedDocs) {
            const complaintId = doc.$id;
            if (seenComplaintIds.has(complaintId))
                continue;
            seenComplaintIds.add(complaintId);
            const complaint = toComplaintModel(doc);
            const deptId = complaint.maintenance_department_id;
            if (!breakdown[deptId]) {
                breakdown[deptId] = { total: 0, pending: 0, in_progress: 0, resolved: 0, delayed: 0 };
            }
            // Check 5-day delay eligibility against a single consistent reference timestamp
            const delayedForComplaint = isComplaintDelayed({
                status: complaint.status,
                created_at: complaint.created_at || doc.$createdAt || '',
                last_meaningful_update_at: complaint.last_meaningful_update_at ||
                    complaint.created_at ||
                    doc.$createdAt ||
                    '',
            }, now);
            if (delayedForComplaint) {
                totalDelayed += 1;
                breakdown[deptId].delayed += 1;
                const delayInfo = calculateComplaintDelay(complaint, now);
                const complaintWarnings = complaintId ? warningsByComplaint.get(complaintId) || [] : [];
                delayedComplaintsList.push({
                    complaint,
                    days_delayed: delayInfo.days_delayed,
                    warning_count: complaintWarnings.length,
                    warnings: complaintWarnings,
                    is_warning_eligible: complaint.status !== 'Resolved',
                });
            }
        }
        const metrics = {
            total_complaints: totalComplaints,
            total_pending: totalPending,
            total_in_progress: totalInProgress,
            total_resolved: totalResolved,
            total_delayed: totalDelayed,
            total_warnings_issued: warningsResult.total,
            department_breakdown: breakdown,
        };
        return res.json({
            success: true,
            data: {
                metrics,
                delayed_complaints: delayedComplaintsList,
                recent_complaints: recentComplaintsRes.documents.map(toComplaintModel),
                recent_warnings: allWarnings.slice(0, 50).map(toWarningModel),
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error loading principal dashboard: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to load Principal dashboard metrics.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 2. Issue Manual Warning on Delayed Unresolved Complaint
// ----------------------------------------------------
export async function handleIssueWarning(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can issue warnings on delayed complaints.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    const warningReason = typeof data.warning_reason === 'string' ? data.warning_reason.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'INVALID_COMPLAINT_ID',
        }, 400);
    }
    if (warningReason.length < 10 || warningReason.length > 2000) {
        return res.json({
            success: false,
            error: 'Warning reason must be between 10 and 2000 characters.',
            code: 'INVALID_WARNING_REASON',
        }, 400);
    }
    try {
        const doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        const complaint = toComplaintModel(doc);
        // Rule: Principal cannot warn on resolved complaints
        if (complaint.status === 'Resolved') {
            return res.json({
                success: false,
                error: 'Principal cannot issue warnings on resolved complaints.',
                code: 'CANNOT_WARN_RESOLVED',
            }, 400);
        }
        // Rule: Pending/In Progress must exceed 5 days
        const delayInfo = calculateComplaintDelay(complaint);
        if (!delayInfo.is_delayed) {
            return res.json({
                success: false,
                error: `Complaint is not eligible for a warning. Elapsed time since last milestone has not exceeded 5 days (currently ${delayInfo.days_delayed} days).`,
                code: 'NOT_DELAY_ELIGIBLE',
            }, 400);
        }
        const now = new Date().toISOString();
        const docId = `cw_${ID.unique().slice(0, 32)}`;
        const newWarning = await databases.createDocument(config.databaseId, config.warningsCollectionId, docId, {
            complaint_id: complaint.$id,
            issued_by_principal_id: caller.id,
            warning_reason: warningReason,
            days_delayed: delayInfo.days_delayed,
            admin_response: '',
            responded_at: '',
            created_at: now,
        }, [] // Strictly empty permissions ($permissions = [])
        );
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
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
        }, log);
        return res.json({
            success: true,
            data: {
                warning: toWarningModel(newWarning),
            },
        }, 201);
    }
    catch (err) {
        error(`[principal] Error issuing warning for complaint ${complaintId}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to issue warning.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 3. Admin Responds to Principal Warning
// ----------------------------------------------------
export async function handleRespondToWarning(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const warningId = typeof data.warning_id === 'string' ? data.warning_id.trim() : '';
    const adminResponse = typeof data.admin_response === 'string' ? data.admin_response.trim() : '';
    if (!warningId) {
        return res.json({
            success: false,
            error: 'Warning ID is required.',
            code: 'INVALID_WARNING_ID',
        }, 400);
    }
    if (adminResponse.length < 10 || adminResponse.length > 2000) {
        return res.json({
            success: false,
            error: 'Admin response must be between 10 and 2000 characters.',
            code: 'INVALID_ADMIN_RESPONSE',
        }, 400);
    }
    try {
        const warningDoc = await databases.getDocument(config.databaseId, config.warningsCollectionId, warningId);
        const complaintId = readStringField(warningDoc, 'complaint_id');
        const complaintDoc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        const maintenanceDeptId = readStringField(complaintDoc, 'maintenance_department_id');
        // Canonical Authorization Check:
        // Only the Maintenance Admin assigned to this department (or Principal) can respond.
        const isPrincipal = caller.role === 'principal';
        let isAuthorizedAdmin = false;
        if (!isPrincipal && caller.role === 'department_admin') {
            const maintenanceAssignments = (caller.admin_assignments || []).filter((a) => a.is_active && a.scope === 'maintenance' && a.department_id === maintenanceDeptId);
            isAuthorizedAdmin = maintenanceAssignments.length > 0;
        }
        if (!isPrincipal && !isAuthorizedAdmin) {
            return res.json({
                success: false,
                error: 'Only the assigned Maintenance Department Administrator can respond to this warning.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const warningCheck = validateWarningResponse(warningDoc);
        if (!warningCheck.allowed) {
            return res.json({
                success: false,
                error: warningCheck.error || 'A formal response has already been recorded for this warning.',
                code: warningCheck.code || 'WARNING_ALREADY_RESPONDED',
            }, 409);
        }
        const now = new Date().toISOString();
        const updatedDoc = await databases.updateDocument(config.databaseId, config.warningsCollectionId, warningId, {
            admin_response: adminResponse,
            responded_at: now,
        });
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
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
        }, log);
        return res.json({
            success: true,
            data: {
                warning: toWarningModel(updatedDoc),
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error responding to warning ${warningId}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to submit response to warning.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 4. List Department Admin Assignments (Principal Only)
// ----------------------------------------------------
export async function handleListAdminAssignments(context, caller, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can view administrator assignments.',
            code: 'FORBIDDEN',
        }, 403);
    }
    try {
        const result = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.orderDesc('created_at'), Query.limit(100)]);
        return res.json({
            success: true,
            data: {
                assignments: result.documents.map(toAdminAssignmentModel),
                total: result.total,
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error listing admin assignments: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to list administrator assignments.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 5. Assign Department Administrator (Principal Only)
// ----------------------------------------------------
export async function handleAssignAdmin(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can assign department administrators.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    const departmentId = typeof data.department_id === 'string' ? data.department_id.trim() : '';
    const scope = data.scope === 'academic' || data.scope === 'maintenance' ? data.scope : null;
    const targetUserId = typeof data.user_id === 'string' ? data.user_id.trim() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.json({
            success: false,
            error: 'A valid email address is required.',
            code: 'INVALID_EMAIL',
        }, 400);
    }
    let resolvedDept = resolveDepartment(departmentId);
    if (!resolvedDept) {
        try {
            const deptDoc = await databases.getDocument(config.databaseId, config.departmentsCollectionId, departmentId);
            if (deptDoc && readBooleanField(deptDoc, 'is_active') !== false) {
                resolvedDept = {
                    id: deptDoc.$id,
                    name: readStringField(deptDoc, 'name') || deptDoc.$id,
                    code: readStringField(deptDoc, 'code') || '',
                    is_academic: readBooleanField(deptDoc, 'is_academic') ?? false,
                    is_maintenance: readBooleanField(deptDoc, 'is_maintenance') ?? false,
                    is_active: true,
                };
            }
        }
        catch {
            // not in db
        }
    }
    if (!resolvedDept) {
        return res.json({
            success: false,
            error: 'Invalid department ID. Department not found or inactive.',
            code: 'INVALID_DEPARTMENT',
        }, 400);
    }
    if (!scope) {
        return res.json({
            success: false,
            error: "Scope must be either 'academic' or 'maintenance'.",
            code: 'INVALID_SCOPE',
        }, 400);
    }
    // Canonical Invariant: Water and Sanitation are maintenance-only and cannot have academic administrators
    if (scope === 'academic' && !resolvedDept.is_academic) {
        return res.json({
            success: false,
            error: `Department '${resolvedDept.name}' (${resolvedDept.id}) is maintenance-only and cannot be assigned academic scope.`,
            code: 'INVALID_DEPARTMENT_SCOPE',
        }, 400);
    }
    try {
        // Guard against duplicate active assignments using reliable single-attribute email query
        const existingForEmail = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('email', email), Query.limit(100)]);
        const duplicateActive = existingForEmail.documents.find((d) => readStringField(d, 'email').trim().toLowerCase() === email &&
            readStringField(d, 'department_id').trim() === resolvedDept.id &&
            readStringField(d, 'scope').trim() === scope &&
            readBooleanField(d, 'is_active') === true);
        if (duplicateActive) {
            return res.json({
                success: false,
                error: `An active administrator assignment already exists for ${email} in department '${resolvedDept.name}' with scope '${scope}'.`,
                code: 'ASSIGNMENT_ALREADY_EXISTS',
            }, 409);
        }
        const now = new Date().toISOString();
        const docId = `da_${ID.unique().slice(0, 32)}`;
        // Look up existing profile (by user_id if supplied, then by email) to prevent Principal collision & resolve real user_id
        let targetProfileDoc = null;
        try {
            if (targetUserId) {
                const byUser = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', targetUserId), Query.limit(1)]);
                targetProfileDoc = byUser.documents[0] ?? null;
            }
            if (!targetProfileDoc) {
                const byEmail = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('email', email), Query.limit(1)]);
                targetProfileDoc = byEmail.documents[0] ?? null;
            }
        }
        catch {
            // Non-fatal if profile has not been created yet
        }
        if (targetProfileDoc && readStringField(targetProfileDoc, 'role') === 'principal') {
            return res.json({
                success: false,
                error: 'Cannot assign department administrator role to the Principal account.',
                code: 'CANNOT_REASSIGN_PRINCIPAL',
            }, 409);
        }
        const effectiveUserId = targetUserId ||
            (targetProfileDoc ? readStringField(targetProfileDoc, 'user_id') || targetProfileDoc.$id : '');
        const newAssignment = await databases.createDocument(config.databaseId, config.departmentAdminsCollectionId, docId, {
            user_id: effectiveUserId,
            email,
            department_id: resolvedDept.id,
            scope,
            is_active: true,
            assigned_by: caller.id,
            created_at: now,
        }, [] // Strictly empty permissions ($permissions = [])
        );
        // Update user profile role to department_admin if profile exists
        const profileDocId = targetProfileDoc?.$id || effectiveUserId;
        if (profileDocId) {
            try {
                await databases.updateDocument(config.databaseId, config.profilesCollectionId, profileDocId, {
                    role: 'department_admin',
                    updated_at: now,
                });
            }
            catch {
                // Profile update is non-fatal if user has not yet signed up or logged in
            }
        }
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
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
        }, log);
        return res.json({
            success: true,
            data: {
                assignment: toAdminAssignmentModel(newAssignment),
            },
        }, 201);
    }
    catch (err) {
        error(`[principal] Error assigning department admin: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to assign department administrator.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 6. Revoke Department Administrator (Principal Only)
// ----------------------------------------------------
export async function handleRevokeAdmin(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can revoke administrator assignments.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const assignmentId = typeof data.assignment_id === 'string' ? data.assignment_id.trim() : '';
    if (!assignmentId) {
        return res.json({
            success: false,
            error: 'Assignment ID is required.',
            code: 'INVALID_ASSIGNMENT_ID',
        }, 400);
    }
    try {
        const doc = await databases.getDocument(config.databaseId, config.departmentAdminsCollectionId, assignmentId);
        if (readBooleanField(doc, 'is_active') === false) {
            return res.json({
                success: false,
                error: 'This administrator assignment has already been revoked.',
                code: 'ASSIGNMENT_ALREADY_REVOKED',
            }, 400);
        }
        const updatedDoc = await databases.updateDocument(config.databaseId, config.departmentAdminsCollectionId, assignmentId, {
            is_active: false,
        });
        const targetUserId = readStringField(doc, 'user_id').trim();
        const targetEmail = readStringField(doc, 'email').trim().toLowerCase();
        // Check if target user has any remaining active admin assignments across user_id & email
        if (targetUserId || targetEmail) {
            try {
                const remainingDocs = [];
                if (targetUserId) {
                    const byUser = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('user_id', targetUserId), Query.limit(50)]);
                    remainingDocs.push(...byUser.documents);
                }
                if (targetEmail) {
                    const byEmail = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('email', targetEmail), Query.limit(50)]);
                    remainingDocs.push(...byEmail.documents);
                }
                const activeRemaining = remainingDocs.filter((d) => d.$id !== assignmentId && readBooleanField(d, 'is_active') === true);
                if (activeRemaining.length === 0) {
                    let targetProfileDoc = null;
                    if (targetUserId) {
                        const byUser = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', targetUserId), Query.limit(1)]);
                        targetProfileDoc = byUser.documents[0] ?? null;
                    }
                    if (!targetProfileDoc && targetEmail) {
                        const byEmail = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('email', targetEmail), Query.limit(1)]);
                        targetProfileDoc = byEmail.documents[0] ?? null;
                    }
                    if (!targetProfileDoc && targetUserId) {
                        targetProfileDoc = await databases
                            .getDocument(config.databaseId, config.profilesCollectionId, targetUserId)
                            .catch(() => null);
                    }
                    if (targetProfileDoc && readStringField(targetProfileDoc, 'role') !== 'principal') {
                        const completeStudent = hasCompleteStudentProfileFields(targetProfileDoc);
                        await databases.updateDocument(config.databaseId, config.profilesCollectionId, targetProfileDoc.$id, {
                            role: 'student',
                            ...(!completeStudent
                                ? {
                                    name_locked: false,
                                    enrollment_locked: false,
                                    phone_locked: false,
                                    ...(readBooleanField(targetProfileDoc, 'is_locked') !== undefined
                                        ? { is_locked: false }
                                        : {}),
                                    profile_status: 'incomplete',
                                }
                                : {}),
                            updated_at: new Date().toISOString(),
                        });
                    }
                }
            }
            catch {
                // non-fatal
            }
        }
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
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
        }, log);
        return res.json({
            success: true,
            data: {
                assignment: toAdminAssignmentModel(updatedDoc),
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error revoking admin assignment ${assignmentId}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to revoke department administrator assignment.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 7. Get System Audit History (Principal Only)
// ----------------------------------------------------
export async function handleGetAuditHistory(context, caller, data = {}, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can inspect system audit logs.',
            code: 'FORBIDDEN',
        }, 403);
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
        const result = await databases.listDocuments(config.databaseId, config.auditLogsCollectionId, queries);
        return res.json({
            success: true,
            data: {
                audit_logs: result.documents.map(toAuditLogModel),
                total: result.total,
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error loading audit history: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to retrieve audit logs.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 8. Create Department (Principal Only)
// ----------------------------------------------------
export async function handleCreateDepartment(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can create departments.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : '';
    const adminEmail = typeof data.admin_email === 'string' ? data.admin_email.trim().toLowerCase() : '';
    const rawScopes = typeof data.scopes === 'object' && data.scopes !== null ? data.scopes : {};
    const isMaintenance = Boolean(rawScopes.maintenance);
    const isAcademic = Boolean(rawScopes.academic);
    if (!name || name.length < 2 || name.length > 100) {
        return res.json({
            success: false,
            error: 'Department name must be between 2 and 100 characters.',
            code: 'INVALID_NAME',
        }, 400);
    }
    if (!code || code.length < 2 || code.length > 10 || !/^[A-Z0-9_-]+$/.test(code)) {
        return res.json({
            success: false,
            error: 'Department code must be 2-10 alphanumeric characters (A-Z, 0-9, _, -).',
            code: 'INVALID_CODE',
        }, 400);
    }
    if (!adminEmail || !adminEmail.includes('@')) {
        return res.json({
            success: false,
            error: 'A valid administrator email address is required.',
            code: 'INVALID_ADMIN_EMAIL',
        }, 400);
    }
    if (!isMaintenance && !isAcademic) {
        return res.json({
            success: false,
            error: 'At least one administrative scope (Maintenance or Academic) must be selected.',
            code: 'INVALID_SCOPE',
        }, 400);
    }
    try {
        const existingWithCode = await databases.listDocuments(config.databaseId, config.departmentsCollectionId, [Query.equal('code', code), Query.limit(10)]);
        if (existingWithCode.total > 0 || existingWithCode.documents.length > 0) {
            return res.json({
                success: false,
                error: `A department with code '${code}' already exists.`,
                code: 'DEPARTMENT_CODE_EXISTS',
            }, 409);
        }
        const canonicalMatch = INSTITUTIONAL_DEPARTMENTS.find((d) => d.code?.toUpperCase() === code || d.id.toUpperCase() === `DEPT_${code}`);
        if (canonicalMatch && canonicalMatch.is_active) {
            return res.json({
                success: false,
                error: `A canonical department with code '${code}' (${canonicalMatch.name}) already exists.`,
                code: 'DEPARTMENT_CODE_EXISTS',
            }, 409);
        }
        let targetProfileDoc = null;
        try {
            const byEmail = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('email', adminEmail), Query.limit(1)]);
            targetProfileDoc = byEmail.documents[0] ?? null;
        }
        catch {
            // non-fatal
        }
        if (targetProfileDoc && readStringField(targetProfileDoc, 'role') === 'principal') {
            return res.json({
                success: false,
                error: 'Cannot assign department administrator role to the Principal account.',
                code: 'CANNOT_REASSIGN_PRINCIPAL',
            }, 409);
        }
        const deptDocId = `dept_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${ID.unique().slice(0, 8)}`;
        const now = new Date().toISOString();
        const createdDeptDoc = await databases.createDocument(config.databaseId, config.departmentsCollectionId, deptDocId, {
            name,
            code,
            is_academic: isAcademic,
            is_maintenance: isMaintenance,
            is_active: true,
        }, []);
        const effectiveUserId = targetProfileDoc ? readStringField(targetProfileDoc, 'user_id') || targetProfileDoc.$id : '';
        const createdAssignments = [];
        const scopesToAssign = [];
        if (isMaintenance)
            scopesToAssign.push('maintenance');
        if (isAcademic)
            scopesToAssign.push('academic');
        for (const scope of scopesToAssign) {
            const assignDocId = `da_${ID.unique().slice(0, 32)}`;
            const assignDoc = await databases.createDocument(config.databaseId, config.departmentAdminsCollectionId, assignDocId, {
                user_id: effectiveUserId,
                email: adminEmail,
                department_id: deptDocId,
                scope,
                is_active: true,
                assigned_by: caller.id,
                created_at: now,
            }, []);
            createdAssignments.push(toAdminAssignmentModel(assignDoc));
        }
        if (targetProfileDoc) {
            try {
                await databases.updateDocument(config.databaseId, config.profilesCollectionId, targetProfileDoc.$id, {
                    role: 'department_admin',
                    updated_at: now,
                });
            }
            catch {
                // non-fatal
            }
        }
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'create_department',
            actor_id: caller.id,
            actor_role: 'principal',
            target_resource_id: deptDocId,
            target_resource_type: 'department',
            details: {
                name,
                code,
                is_academic: isAcademic,
                is_maintenance: isMaintenance,
                admin_email: adminEmail,
                scopes: scopesToAssign,
            },
        }, log);
        return res.json({
            success: true,
            data: {
                department: {
                    $id: createdDeptDoc.$id,
                    name,
                    code,
                    is_academic: isAcademic,
                    is_maintenance: isMaintenance,
                    is_active: true,
                    created_at: now,
                },
                assignments: createdAssignments,
            },
        }, 201);
    }
    catch (err) {
        error(`[principal] Error creating department: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to create department.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 9. Update Department (Principal Only)
// ----------------------------------------------------
export async function handleUpdateDepartment(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can update departments.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const departmentId = typeof data.department_id === 'string' ? data.department_id.trim() : '';
    if (!departmentId) {
        return res.json({
            success: false,
            error: 'Department ID is required.',
            code: 'INVALID_DEPARTMENT_ID',
        }, 400);
    }
    const name = typeof data.name === 'string' ? data.name.trim() : undefined;
    const code = typeof data.code === 'string' ? data.code.trim().toUpperCase() : undefined;
    const adminEmail = typeof data.admin_email === 'string' ? data.admin_email.trim().toLowerCase() : undefined;
    const rawScopes = typeof data.scopes === 'object' && data.scopes !== null ? data.scopes : undefined;
    const isMaintenance = rawScopes !== undefined ? Boolean(rawScopes.maintenance) : undefined;
    const isAcademic = rawScopes !== undefined ? Boolean(rawScopes.academic) : undefined;
    if (name !== undefined && (name.length < 2 || name.length > 100)) {
        return res.json({
            success: false,
            error: 'Department name must be between 2 and 100 characters.',
            code: 'INVALID_NAME',
        }, 400);
    }
    if (code !== undefined && (code.length < 2 || code.length > 10 || !/^[A-Z0-9_-]+$/.test(code))) {
        return res.json({
            success: false,
            error: 'Department code must be 2-10 alphanumeric characters (A-Z, 0-9, _, -).',
            code: 'INVALID_CODE',
        }, 400);
    }
    if (adminEmail !== undefined && (!adminEmail || !adminEmail.includes('@'))) {
        return res.json({
            success: false,
            error: 'A valid administrator email address is required.',
            code: 'INVALID_ADMIN_EMAIL',
        }, 400);
    }
    if (rawScopes !== undefined && !isMaintenance && !isAcademic) {
        return res.json({
            success: false,
            error: 'At least one administrative scope (Maintenance or Academic) must be selected.',
            code: 'INVALID_SCOPE',
        }, 400);
    }
    if (isAcademic && (departmentId === 'dept_water' || departmentId === 'dept_sanit')) {
        return res.json({
            success: false,
            error: 'Water and Sanitation departments are maintenance-only and cannot be assigned academic scope.',
            code: 'INVALID_SCOPE',
        }, 400);
    }
    try {
        const canonical = resolveDepartment(departmentId);
        let existingDoc = null;
        try {
            existingDoc = await databases.getDocument(config.databaseId, config.departmentsCollectionId, departmentId);
        }
        catch {
            // Canonical fallback
        }
        if (!existingDoc && !canonical) {
            return res.json({
                success: false,
                error: 'Department not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        if (code) {
            const existingWithCode = await databases.listDocuments(config.databaseId, config.departmentsCollectionId, [Query.equal('code', code), Query.limit(10)]);
            const conflict = existingWithCode.documents.find((d) => d.$id !== departmentId);
            if (conflict) {
                return res.json({
                    success: false,
                    error: `Another department already uses code '${code}'.`,
                    code: 'DEPARTMENT_CODE_EXISTS',
                }, 409);
            }
        }
        const now = new Date().toISOString();
        const updatedName = name ?? (existingDoc ? readStringField(existingDoc, 'name') : canonical?.name ?? '');
        const updatedCode = code ?? (existingDoc ? readStringField(existingDoc, 'code') : canonical?.code ?? '');
        const updatedIsAcademic = isAcademic ?? (existingDoc ? (readBooleanField(existingDoc, 'is_academic') ?? canonical?.is_academic ?? false) : canonical?.is_academic ?? false);
        const updatedIsMaintenance = isMaintenance ?? (existingDoc ? (readBooleanField(existingDoc, 'is_maintenance') ?? canonical?.is_maintenance ?? true) : canonical?.is_maintenance ?? true);
        let savedDeptDoc;
        if (existingDoc) {
            savedDeptDoc = await databases.updateDocument(config.databaseId, config.departmentsCollectionId, departmentId, {
                name: updatedName,
                code: updatedCode,
                is_academic: updatedIsAcademic,
                is_maintenance: updatedIsMaintenance,
            });
        }
        else {
            savedDeptDoc = await databases.createDocument(config.databaseId, config.departmentsCollectionId, departmentId, {
                name: updatedName,
                code: updatedCode,
                is_academic: updatedIsAcademic,
                is_maintenance: updatedIsMaintenance,
                is_active: true,
            }, []);
        }
        const updatedAssignments = [];
        if (adminEmail !== undefined || rawScopes !== undefined) {
            const activeAssignmentsResult = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('department_id', departmentId), Query.equal('is_active', true), Query.limit(50)]);
            const targetEmail = adminEmail || (activeAssignmentsResult.documents[0] ? readStringField(activeAssignmentsResult.documents[0], 'email') : '');
            if (targetEmail) {
                let targetProfileDoc = null;
                try {
                    const byEmail = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('email', targetEmail), Query.limit(1)]);
                    targetProfileDoc = byEmail.documents[0] ?? null;
                }
                catch {
                    // non-fatal
                }
                if (targetProfileDoc && readStringField(targetProfileDoc, 'role') === 'principal') {
                    return res.json({
                        success: false,
                        error: 'Cannot assign department administrator role to the Principal account.',
                        code: 'CANNOT_REASSIGN_PRINCIPAL',
                    }, 409);
                }
                const effectiveUserId = targetProfileDoc ? readStringField(targetProfileDoc, 'user_id') || targetProfileDoc.$id : '';
                const desiredScopes = [];
                if (updatedIsMaintenance)
                    desiredScopes.push('maintenance');
                if (updatedIsAcademic)
                    desiredScopes.push('academic');
                for (const assignDoc of activeAssignmentsResult.documents) {
                    const docEmail = readStringField(assignDoc, 'email').trim().toLowerCase();
                    const docScope = readStringField(assignDoc, 'scope');
                    if (docEmail !== targetEmail || !desiredScopes.includes(docScope)) {
                        await databases.updateDocument(config.databaseId, config.departmentAdminsCollectionId, assignDoc.$id, { is_active: false });
                    }
                }
                for (const scope of desiredScopes) {
                    const alreadyExists = activeAssignmentsResult.documents.some((d) => readBooleanField(d, 'is_active') === true &&
                        readStringField(d, 'email').trim().toLowerCase() === targetEmail &&
                        readStringField(d, 'scope') === scope);
                    if (!alreadyExists) {
                        const assignDocId = `da_${ID.unique().slice(0, 32)}`;
                        const newDoc = await databases.createDocument(config.databaseId, config.departmentAdminsCollectionId, assignDocId, {
                            user_id: effectiveUserId,
                            email: targetEmail,
                            department_id: departmentId,
                            scope,
                            is_active: true,
                            assigned_by: caller.id,
                            created_at: now,
                        }, []);
                        updatedAssignments.push(toAdminAssignmentModel(newDoc));
                    }
                    else {
                        const match = activeAssignmentsResult.documents.find((d) => readBooleanField(d, 'is_active') === true &&
                            readStringField(d, 'email').trim().toLowerCase() === targetEmail &&
                            readStringField(d, 'scope') === scope);
                        updatedAssignments.push(toAdminAssignmentModel(match));
                    }
                }
                if (targetProfileDoc) {
                    try {
                        await databases.updateDocument(config.databaseId, config.profilesCollectionId, targetProfileDoc.$id, {
                            role: 'department_admin',
                            updated_at: now,
                        });
                    }
                    catch {
                        // non-fatal
                    }
                }
            }
        }
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'update_department',
            actor_id: caller.id,
            actor_role: 'principal',
            target_resource_id: departmentId,
            target_resource_type: 'department',
            details: {
                name: updatedName,
                code: updatedCode,
                is_academic: updatedIsAcademic,
                is_maintenance: updatedIsMaintenance,
                admin_email: adminEmail,
            },
        }, log);
        return res.json({
            success: true,
            data: {
                department: {
                    $id: savedDeptDoc.$id,
                    name: updatedName,
                    code: updatedCode,
                    is_academic: updatedIsAcademic,
                    is_maintenance: updatedIsMaintenance,
                    is_active: true,
                },
                assignments: updatedAssignments,
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error updating department: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to update department.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 10. Delete Department (Principal Only - Soft Delete)
// ----------------------------------------------------
export async function handleDeleteDepartment(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'principal') {
        return res.json({
            success: false,
            error: 'Only the Principal can delete departments.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const departmentId = typeof data.department_id === 'string' ? data.department_id.trim() : '';
    if (!departmentId) {
        return res.json({
            success: false,
            error: 'Department ID is required.',
            code: 'INVALID_DEPARTMENT_ID',
        }, 400);
    }
    try {
        let deptDoc = null;
        try {
            deptDoc = await databases.getDocument(config.databaseId, config.departmentsCollectionId, departmentId);
        }
        catch {
            // Check canonical
        }
        const canonical = resolveDepartment(departmentId);
        if (!deptDoc && !canonical) {
            return res.json({
                success: false,
                error: 'Department not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        if (deptDoc) {
            await databases.updateDocument(config.databaseId, config.departmentsCollectionId, departmentId, { is_active: false });
        }
        else if (canonical) {
            await databases.createDocument(config.databaseId, config.departmentsCollectionId, departmentId, {
                name: canonical.name,
                code: canonical.code || '',
                is_academic: canonical.is_academic,
                is_maintenance: canonical.is_maintenance,
                is_active: false,
            }, []);
        }
        const activeAssignments = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('department_id', departmentId), Query.equal('is_active', true), Query.limit(100)]);
        const revokedIds = [];
        for (const assignDoc of activeAssignments.documents) {
            await databases.updateDocument(config.databaseId, config.departmentAdminsCollectionId, assignDoc.$id, { is_active: false });
            revokedIds.push(assignDoc.$id);
        }
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'delete_department',
            actor_id: caller.id,
            actor_role: 'principal',
            target_resource_id: departmentId,
            target_resource_type: 'department',
            details: {
                department_id: departmentId,
                revoked_assignments_count: revokedIds.length,
            },
        }, log);
        return res.json({
            success: true,
            data: {
                department: {
                    $id: departmentId,
                    name: deptDoc ? readStringField(deptDoc, 'name') : canonical?.name || departmentId,
                    is_academic: false,
                    is_maintenance: false,
                    is_active: false,
                },
                revoked_assignment_ids: revokedIds,
            },
        }, 200);
    }
    catch (err) {
        error(`[principal] Error deleting department: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to delete department.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
