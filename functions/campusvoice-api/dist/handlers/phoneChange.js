import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient, withTransientRetry } from '../db.js';
import { PHONE_NUMBER_REGEX, readBooleanField, readStringField, resolveDepartment, resolveLegacyDepartmentCode, } from '../departments.js';
import { appendAuditLog } from './audit.js';
/**
 * Fetches caller profile from the profiles collection.
 */
async function getCallerProfile(databases, userId, databaseId, profilesCollectionId) {
    const res = await withTransientRetry(() => databases.listDocuments(databaseId, profilesCollectionId, [
        Query.equal('user_id', userId),
        Query.limit(1),
    ]));
    if (res.total === 0 || !res.documents[0]) {
        return null;
    }
    const doc = res.documents[0];
    const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
    const rawDeptId = readStringField(doc, 'student_department_id');
    const rawLegacyDeptCode = readStringField(doc, 'department_code');
    const resolvedDept = resolveDepartment(rawDeptId) ||
        (!rawDeptId && enrollmentNo.length === 12 ? resolveLegacyDepartmentCode(rawLegacyDeptCode) : null);
    return {
        $id: doc.$id,
        user_id: readStringField(doc, 'user_id') || userId,
        auth_user_id: readStringField(doc, 'auth_user_id') || userId,
        email: readStringField(doc, 'email'),
        name: readStringField(doc, 'name'),
        enrollment_no: readStringField(doc, 'enrollment_no'),
        student_department_id: resolvedDept && resolvedDept.is_academic ? resolvedDept.id : null,
        phone_number: readStringField(doc, 'phone_number'),
        role: readStringField(doc, 'role') || 'student',
        profile_status: 'complete',
        name_locked: Boolean(readBooleanField(doc, 'name_locked')),
        enrollment_locked: Boolean(readBooleanField(doc, 'enrollment_locked')),
        phone_locked: Boolean(readBooleanField(doc, 'phone_locked')),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
        updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
    };
}
function toPhoneChangeModel(doc) {
    const reqAt = readStringField(doc, 'requested_at') ||
        readStringField(doc, 'created_at') ||
        doc.$createdAt;
    return {
        $id: doc.$id,
        student_user_id: readStringField(doc, 'student_user_id'),
        academic_department_id: readStringField(doc, 'academic_department_id'),
        old_phone_number: readStringField(doc, 'old_phone_number'),
        requested_phone_number: readStringField(doc, 'requested_phone_number') || undefined,
        reason: readStringField(doc, 'reason'),
        status: (readStringField(doc, 'status') || 'pending'),
        reviewed_by: readStringField(doc, 'reviewed_by') || undefined,
        decision_reason: readStringField(doc, 'decision_reason') || undefined,
        permission_consumed: Boolean(readBooleanField(doc, 'permission_consumed')),
        requested_at: reqAt,
        created_at: reqAt,
        updated_at: readStringField(doc, 'reviewed_at') ||
            readStringField(doc, 'completed_at') ||
            readStringField(doc, 'updated_at') ||
            doc.$updatedAt,
    };
}
function extractTimestampSchemaMismatch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    const unknownMatch = /Unknown attribute[:\s]*["']?(created_at|requested_at|updated_at|reviewed_at|completed_at)["']?/i.exec(msg);
    if (unknownMatch?.[1]) {
        return { type: 'unknown', field: unknownMatch[1] };
    }
    const missingMatch = /Missing required attribute[:\s]*["']?(created_at|requested_at|updated_at|reviewed_at|completed_at)["']?/i.exec(msg);
    if (missingMatch?.[1]) {
        return { type: 'missing', field: missingMatch[1] };
    }
    return null;
}
async function executeWithTimestampCompat(operation, initialPayload, now) {
    const candidate = { ...initialPayload };
    const triedAdjustments = new Set();
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            return await operation(candidate);
        }
        catch (err) {
            const mismatch = extractTimestampSchemaMismatch(err);
            if (!mismatch) {
                throw err;
            }
            const adjustmentKey = `${mismatch.type}:${mismatch.field}`;
            if (triedAdjustments.has(adjustmentKey)) {
                throw err;
            }
            triedAdjustments.add(adjustmentKey);
            if (mismatch.type === 'unknown' && mismatch.field in candidate) {
                delete candidate[mismatch.field];
                continue;
            }
            if (mismatch.type === 'missing' && !(mismatch.field in candidate)) {
                candidate[mismatch.field] = now;
                continue;
            }
            throw err;
        }
    }
    return operation(candidate);
}
async function createPhoneChangeDocCompat(databases, databaseId, collectionId, docId, payload, now) {
    return executeWithTimestampCompat((candidate) => databases.createDocument(databaseId, collectionId, docId, candidate, []), {
        ...payload,
        requested_at: now,
        created_at: now,
    }, now);
}
async function updatePhoneChangeDocCompat(databases, databaseId, collectionId, docId, payload, now) {
    return executeWithTimestampCompat((candidate) => databases.updateDocument(databaseId, collectionId, docId, candidate), payload, now);
}
// ----------------------------------------------------
// 1. Student Requests Phone Change
// ----------------------------------------------------
export async function handleRequestPhoneChange(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'student') {
        return res.json({
            success: false,
            error: 'Only students can submit phone change requests.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
    if (!profile || !profile.phone_number) {
        return res.json({
            success: false,
            error: 'Student profile must be complete with an existing phone number before requesting a change.',
            code: 'PROFILE_INCOMPLETE',
        }, 400);
    }
    if (!profile.student_department_id) {
        return res.json({
            success: false,
            error: 'Student must have an assigned academic department to route phone change requests.',
            code: 'ACADEMIC_DEPARTMENT_REQUIRED',
        }, 400);
    }
    const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
    if (reason.length < 10 || reason.length > 1000) {
        return res.json({
            success: false,
            error: 'Reason must be between 10 and 1000 characters.',
            code: 'INVALID_REASON',
        }, 400);
    }
    let requestedPhone;
    if (data.requested_phone_number !== undefined && data.requested_phone_number !== null) {
        const rawReqPhone = String(data.requested_phone_number).trim();
        if (rawReqPhone.length > 0) {
            if (!PHONE_NUMBER_REGEX.test(rawReqPhone)) {
                return res.json({
                    success: false,
                    error: 'Requested phone number must be exactly 10 digits starting with 6, 7, 8, or 9.',
                    code: 'INVALID_PHONE_NUMBER',
                }, 400);
            }
            if (rawReqPhone === profile.phone_number) {
                return res.json({
                    success: false,
                    error: 'Requested phone number cannot be the same as your current phone number.',
                    code: 'SAME_PHONE_NUMBER',
                }, 400);
            }
            requestedPhone = rawReqPhone;
        }
    }
    // Check for existing pending or unconsumed approved requests
    try {
        const existingRequests = await withTransientRetry(() => databases.listDocuments(config.databaseId, config.phoneChangeRequestsCollectionId, [
            Query.equal('student_user_id', caller.id),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
        ]));
        const hasActiveRequest = existingRequests.documents.some((d) => {
            const status = readStringField(d, 'status');
            const consumed = readBooleanField(d, 'permission_consumed');
            return status === 'pending' || (status === 'approved' && consumed !== true);
        });
        if (hasActiveRequest) {
            return res.json({
                success: false,
                error: 'You already have an active phone change request pending review or awaiting completion.',
                code: 'ACTIVE_REQUEST_EXISTS',
            }, 409);
        }
        const now = new Date().toISOString();
        const docId = `pcr_${ID.unique().slice(0, 32)}`;
        const newDoc = await createPhoneChangeDocCompat(databases, config.databaseId, config.phoneChangeRequestsCollectionId, docId, {
            student_user_id: caller.id,
            academic_department_id: profile.student_department_id,
            old_phone_number: profile.phone_number,
            requested_phone_number: requestedPhone || '',
            reason,
            status: 'pending',
            reviewed_by: '',
            decision_reason: '',
            permission_consumed: false,
        }, now);
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'request_phone_change',
            actor_id: caller.id,
            actor_role: 'student',
            target_resource_id: newDoc.$id,
            target_resource_type: 'phone_change_request',
            details: {
                academic_department_id: profile.student_department_id,
                requested_phone_provided: Boolean(requestedPhone),
            },
        }, log);
        return res.json({
            success: true,
            data: {
                request: toPhoneChangeModel(newDoc),
            },
        }, 201);
    }
    catch (err) {
        error(`[phone-change] Error creating request for ${caller.id}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to submit phone change request.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 2. Academic Admin Reviews Phone Change (Approve / Reject)
// ----------------------------------------------------
export async function handleReviewPhoneChange(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const requestId = typeof data.request_id === 'string' ? data.request_id.trim() : '';
    const decision = typeof data.decision === 'string' ? data.decision.trim().toLowerCase() : '';
    const decisionReason = typeof data.decision_reason === 'string' ? data.decision_reason.trim() : '';
    if (!requestId) {
        return res.json({
            success: false,
            error: 'Request ID is required.',
            code: 'INVALID_REQUEST_ID',
        }, 400);
    }
    if (decision !== 'approved' && decision !== 'rejected') {
        return res.json({
            success: false,
            error: "Decision must be either 'approved' or 'rejected'.",
            code: 'INVALID_DECISION',
        }, 400);
    }
    if (decision === 'rejected' && decisionReason.length < 5) {
        return res.json({
            success: false,
            error: 'A decision reason of at least 5 characters is required when rejecting a request.',
            code: 'REASON_REQUIRED',
        }, 400);
    }
    if (decisionReason.length > 1000) {
        return res.json({
            success: false,
            error: 'Decision reason cannot exceed 1000 characters.',
            code: 'INVALID_REASON',
        }, 400);
    }
    try {
        const doc = await databases.getDocument(config.databaseId, config.phoneChangeRequestsCollectionId, requestId);
        const currentStatus = readStringField(doc, 'status');
        if (currentStatus !== 'pending') {
            return res.json({
                success: false,
                error: `Phone change request has already been ${currentStatus}.`,
                code: 'REQUEST_ALREADY_REVIEWED',
            }, 400);
        }
        const academicDeptId = readStringField(doc, 'academic_department_id');
        // Canonical Authorization Check:
        // Only the student's academic Department Admin (or Principal) can review.
        // Water and Sanitation admins are maintenance-only and cannot review phone changes.
        const isPrincipal = caller.role === 'principal';
        let isAuthorizedAcademicAdmin = false;
        if (!isPrincipal && caller.role === 'department_admin') {
            const academicAssignments = (caller.admin_assignments || []).filter((a) => a.is_active && a.scope === 'academic' && a.department_id === academicDeptId);
            isAuthorizedAcademicAdmin = academicAssignments.length > 0;
        }
        if (!isPrincipal && !isAuthorizedAcademicAdmin) {
            return res.json({
                success: false,
                error: 'Only the academic Department Administrator for this student can review phone change requests.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const now = new Date().toISOString();
        const updatedDoc = await updatePhoneChangeDocCompat(databases, config.databaseId, config.phoneChangeRequestsCollectionId, requestId, {
            status: decision,
            reviewed_by: caller.id,
            decision_reason: decisionReason || (decision === 'approved' ? 'Approved by Academic Admin' : 'Rejected'),
            reviewed_at: now,
            updated_at: now,
        }, now);
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'review_phone_change',
            actor_id: caller.id,
            actor_role: caller.role,
            target_resource_id: requestId,
            target_resource_type: 'phone_change_request',
            details: {
                decision,
                decision_reason: decisionReason,
                student_user_id: readStringField(doc, 'student_user_id'),
                academic_department_id: academicDeptId,
            },
        }, log);
        return res.json({
            success: true,
            data: {
                request: toPhoneChangeModel(updatedDoc),
            },
        }, 200);
    }
    catch (err) {
        error(`[phone-change] Error reviewing request ${requestId}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to review phone change request.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 3. Student Completes Phone Change (Failure-Safe Consumption)
// ----------------------------------------------------
export async function handleCompletePhoneChange(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role !== 'student') {
        return res.json({
            success: false,
            error: 'Only students can complete phone change updates.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const requestId = typeof data.request_id === 'string' ? data.request_id.trim() : '';
    const newPhoneNumber = typeof data.new_phone_number === 'string' ? data.new_phone_number.trim() : '';
    if (!requestId) {
        return res.json({
            success: false,
            error: 'Request ID is required.',
            code: 'INVALID_REQUEST_ID',
        }, 400);
    }
    if (!PHONE_NUMBER_REGEX.test(newPhoneNumber)) {
        return res.json({
            success: false,
            error: 'New phone number must be exactly 10 digits starting with 6, 7, 8, or 9.',
            code: 'INVALID_PHONE_NUMBER',
        }, 400);
    }
    try {
        const doc = await databases.getDocument(config.databaseId, config.phoneChangeRequestsCollectionId, requestId);
        // Verify ownership
        const requestStudentId = readStringField(doc, 'student_user_id');
        if (requestStudentId !== caller.id) {
            // Return generic 404 to prevent IDOR discovery
            return res.json({
                success: false,
                error: 'Phone change request not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const currentStatus = readStringField(doc, 'status');
        const permissionConsumed = readBooleanField(doc, 'permission_consumed');
        if (currentStatus !== 'approved' || permissionConsumed === true) {
            return res.json({
                success: false,
                error: 'No active one-time phone change permission found for this request.',
                code: 'PERMISSION_NOT_AVAILABLE',
            }, 403);
        }
        const oldPhoneNumber = readStringField(doc, 'old_phone_number');
        if (newPhoneNumber === oldPhoneNumber) {
            return res.json({
                success: false,
                error: 'New phone number cannot be identical to the current phone number.',
                code: 'SAME_PHONE_NUMBER',
            }, 400);
        }
        // Locate the student profile document
        const profileRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
        if (profileRes.total === 0 || !profileRes.documents[0]) {
            return res.json({
                success: false,
                error: 'Student profile document not found.',
                code: 'PROFILE_NOT_FOUND',
            }, 404);
        }
        const profileDoc = profileRes.documents[0];
        const currentProfilePhone = readStringField(profileDoc, 'phone_number').trim();
        if (oldPhoneNumber.trim() && currentProfilePhone !== oldPhoneNumber.trim()) {
            return res.json({
                success: false,
                error: 'Your phone number was already updated by another request or session. Refresh to view your latest status.',
                code: 'PERMISSION_NOT_AVAILABLE',
            }, 409);
        }
        const now = new Date().toISOString();
        // FAILURE-SAFE EXECUTION:
        // Step 1: Update student profile with new phone number.
        // If this step fails, permission is NOT consumed and old number remains active in profile!
        try {
            await databases.updateDocument(config.databaseId, config.profilesCollectionId, profileDoc.$id, {
                phone_number: newPhoneNumber,
                phone_locked: true,
                updated_at: now,
            });
        }
        catch (profileSaveErr) {
            error(`[phone-change] Profile update failed for user ${caller.id}: ${String(profileSaveErr)}`);
            return res.json({
                success: false,
                error: 'Failed to update phone number in profile. Permission was not consumed; please retry.',
                code: 'PROFILE_SAVE_FAILED',
            }, 500);
        }
        // Step 2: Now that profile save succeeded, mark permission as consumed and status completed
        try {
            await updatePhoneChangeDocCompat(databases, config.databaseId, config.phoneChangeRequestsCollectionId, requestId, {
                status: 'completed',
                permission_consumed: true,
                completed_at: now,
                updated_at: now,
            }, now);
        }
        catch (reqUpdateErr) {
            error(`[phone-change] Failed to mark request as consumed, attempting profile rollback: ${String(reqUpdateErr)}`);
            // Compensation / Rollback: revert the profile update so state does not become dirty
            try {
                await databases.updateDocument(config.databaseId, config.profilesCollectionId, profileDoc.$id, {
                    phone_number: oldPhoneNumber,
                    phone_locked: true,
                    updated_at: now,
                });
            }
            catch (rollbackErr) {
                error(`[phone-change] CRITICAL: Profile rollback also failed: ${String(rollbackErr)}`);
            }
            return res.json({
                success: false,
                error: 'Failed to finalize phone change request. Profile change was rolled back; please retry.',
                code: 'REQUEST_COMPLETION_FAILED',
            }, 500);
        }
        // Step 3: Append audit log
        await appendAuditLog(databases, config.databaseId, config.auditLogsCollectionId, {
            action: 'complete_phone_change',
            actor_id: caller.id,
            actor_role: 'student',
            target_resource_id: requestId,
            target_resource_type: 'phone_change_request',
            details: {
                request_id: requestId,
                old_phone_number: oldPhoneNumber,
                new_phone_masked: `${newPhoneNumber.slice(0, 3)}****${newPhoneNumber.slice(7)}`,
            },
        }, log);
        return res.json({
            success: true,
            data: {
                message: 'Phone number updated successfully.',
                phone_number: newPhoneNumber,
            },
        }, 200);
    }
    catch (err) {
        error(`[phone-change] Error completing request ${requestId}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to complete phone change.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 4. List Phone Change Requests (Scoped by Role)
// ----------------------------------------------------
export async function handleListPhoneChangeRequests(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    try {
        const queries = [Query.orderDesc('$createdAt'), Query.limit(100)];
        if (caller.role === 'student') {
            // Students only see their own requests
            queries.push(Query.equal('student_user_id', caller.id));
        }
        else if (caller.role === 'department_admin') {
            // Department Admins only see requests for their academic department scope
            const academicAssignments = (caller.admin_assignments || []).filter((a) => a.is_active && a.scope === 'academic');
            if (academicAssignments.length === 0) {
                return res.json({
                    success: false,
                    error: 'Maintenance-only administrators do not have access to phone change requests.',
                    code: 'FORBIDDEN',
                }, 403);
            }
            const assignedDeptIds = academicAssignments.map((a) => a.department_id);
            queries.push(Query.equal('academic_department_id', assignedDeptIds));
            if (typeof data.status === 'string' && data.status.trim().length > 0) {
                queries.push(Query.equal('status', data.status.trim().toLowerCase()));
            }
        }
        else if (caller.role === 'principal') {
            // Principal can view all requests across academic departments
            if (typeof data.academic_department_id === 'string' && data.academic_department_id.trim().length > 0) {
                queries.push(Query.equal('academic_department_id', data.academic_department_id.trim()));
            }
            if (typeof data.status === 'string' && data.status.trim().length > 0) {
                queries.push(Query.equal('status', data.status.trim().toLowerCase()));
            }
        }
        else {
            return res.json({
                success: false,
                error: 'Unauthorized to view phone change requests.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const result = await withTransientRetry(() => databases.listDocuments(config.databaseId, config.phoneChangeRequestsCollectionId, queries));
        const requests = result.documents.map(toPhoneChangeModel);
        return res.json({
            success: true,
            data: {
                requests,
                total: result.total,
            },
        }, 200);
    }
    catch (err) {
        error(`[phone-change] Error listing requests for ${caller.id}: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to retrieve phone change requests.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
}
