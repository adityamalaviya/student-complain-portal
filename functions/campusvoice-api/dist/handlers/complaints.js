import crypto from 'crypto';
import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { PHONE_NUMBER_REGEX, isAcademicDepartment, normalizeComplaintStatus, readBooleanField, readNumberField, readStringField, resolveDepartment, } from '../departments.js';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
]);
const MIME_TO_EXTENSIONS = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
};
const ATTACHMENT_FILE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;
const USER_PERMISSION_REGEX = /^(?:read|write|update|delete)\("user:([^"]+)"\)$/;
function hasExclusiveUserOwnership(permissions, userId) {
    if (!Array.isArray(permissions) || permissions.length === 0) {
        return false;
    }
    return permissions.every((perm) => {
        const match = USER_PERMISSION_REGEX.exec(perm.trim());
        return Boolean(match && match[1] === userId);
    });
}
function matchesAttachmentMagicBytes(bytes, mimeType) {
    if (mimeType === 'application/pdf') {
        return (bytes.length >= 5 &&
            bytes[0] === 0x25 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x44 &&
            bytes[3] === 0x46 &&
            bytes[4] === 0x2d);
    }
    if (mimeType === 'image/png') {
        return (bytes.length >= 8 &&
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47 &&
            bytes[4] === 0x0d &&
            bytes[5] === 0x0a &&
            bytes[6] === 0x1a &&
            bytes[7] === 0x0a);
    }
    if (mimeType === 'image/jpeg') {
        return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    }
    return false;
}
async function validateAttachmentForComplaint(databases, storage, config, callerId, attachmentFileId) {
    if (!ATTACHMENT_FILE_ID_REGEX.test(attachmentFileId)) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INVALID_ATTACHMENT',
            error: 'Invalid attachment file identifier.',
        };
    }
    let fileMeta;
    try {
        fileMeta = await storage.getFile(config.storageBucketId, attachmentFileId);
    }
    catch {
        return {
            valid: false,
            statusCode: 400,
            code: 'ATTACHMENT_NOT_FOUND',
            error: 'Referenced attachment file does not exist in storage.',
        };
    }
    if (fileMeta.bucketId && fileMeta.bucketId !== config.storageBucketId) {
        return {
            valid: false,
            statusCode: 400,
            code: 'ATTACHMENT_NOT_FOUND',
            error: 'Referenced attachment file is not in the institutional bucket.',
        };
    }
    if (typeof fileMeta.chunksTotal === 'number' &&
        fileMeta.chunksTotal > 0 &&
        fileMeta.chunksUploaded !== fileMeta.chunksTotal) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INCOMPLETE_ATTACHMENT',
            error: 'Attachment upload is incomplete. Please re-upload the file.',
        };
    }
    try {
        const linkedComplaints = await databases.listDocuments(config.databaseId, config.complaintsCollectionId, [Query.equal('attachment_file_id', attachmentFileId), Query.limit(1)]);
        if (linkedComplaints.total > 0) {
            return {
                valid: false,
                statusCode: 409,
                code: 'ATTACHMENT_ALREADY_LINKED',
                error: 'This attachment is already linked to an existing complaint.',
            };
        }
    }
    catch {
        // Fallback to file permissions ownership lock when idx_cmpl_attachment is absent
    }
    if (!hasExclusiveUserOwnership(fileMeta.$permissions, callerId)) {
        return {
            valid: false,
            statusCode: 403,
            code: 'ATTACHMENT_OWNERSHIP_DENIED',
            error: 'Attachment must be privately uploaded and owned solely by the submitting student.',
        };
    }
    if (typeof fileMeta.sizeOriginal !== 'number' || fileMeta.sizeOriginal <= 0) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INVALID_ATTACHMENT',
            error: 'Attachment file cannot be empty.',
        };
    }
    if (fileMeta.sizeOriginal > MAX_ATTACHMENT_BYTES) {
        return {
            valid: false,
            statusCode: 400,
            code: 'ATTACHMENT_TOO_LARGE',
            error: 'Attachment exceeds the strict 5 MB maximum file size.',
        };
    }
    const normalizedMime = (fileMeta.mimeType || '').trim().toLowerCase();
    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMime)) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INVALID_ATTACHMENT_TYPE',
            error: 'Only PDF, JPG, JPEG, and PNG attachments are permitted.',
        };
    }
    if (fileMeta.name && fileMeta.name.includes('.')) {
        const ext = fileMeta.name.split('.').pop()?.trim().toLowerCase() || '';
        const allowedExts = MIME_TO_EXTENSIONS[normalizedMime] || [];
        if (!allowedExts.includes(ext)) {
            return {
                valid: false,
                statusCode: 400,
                code: 'INVALID_ATTACHMENT_TYPE',
                error: 'Attachment file extension does not match its content type.',
            };
        }
    }
    let rawBuffer;
    try {
        rawBuffer = await storage.getFileDownload(config.storageBucketId, attachmentFileId);
    }
    catch {
        return {
            valid: false,
            statusCode: 400,
            code: 'ATTACHMENT_NOT_FOUND',
            error: 'Unable to inspect attachment file content.',
        };
    }
    const bytes = new Uint8Array(rawBuffer);
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
        return {
            valid: false,
            statusCode: 400,
            code: 'ATTACHMENT_TOO_LARGE',
            error: 'Attachment exceeds the strict 5 MB maximum file size.',
        };
    }
    if (bytes.byteLength <= 0 || bytes.byteLength !== fileMeta.sizeOriginal) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INVALID_ATTACHMENT',
            error: 'Attachment file size verification failed.',
        };
    }
    if (!matchesAttachmentMagicBytes(bytes, normalizedMime)) {
        return {
            valid: false,
            statusCode: 400,
            code: 'INVALID_ATTACHMENT_CONTENT',
            error: 'Attachment file content does not match a valid PDF, JPG, JPEG, or PNG file.',
        };
    }
    return {
        valid: true,
        originalPermissions: [...(fileMeta.$permissions || [])],
    };
}
function resolveProfileRole(rawRole) {
    if (rawRole === 'principal' || rawRole === 'department_admin') {
        return rawRole;
    }
    return 'student';
}
function mapDocToComplaint(doc) {
    const rawStudentDept = readStringField(doc, 'student_department_id') || readStringField(doc, 'department_code');
    const rawMaintDept = readStringField(doc, 'maintenance_department_id') || readStringField(doc, 'department_code');
    const resolvedStudentDept = resolveDepartment(rawStudentDept);
    const resolvedMaintDept = resolveDepartment(rawMaintDept);
    const rawPriority = readStringField(doc, 'priority');
    const priority = rawPriority === 'low' || rawPriority === 'high' ? rawPriority : 'medium';
    const status = normalizeComplaintStatus(doc['status']) ?? 'Pending';
    const rawSupportCount = readNumberField(doc, 'support_count');
    const supportCount = typeof rawSupportCount === 'number' && rawSupportCount >= 1 ? rawSupportCount : 1;
    const attachmentFileId = readStringField(doc, 'attachment_file_id').trim() || undefined;
    const lastMeaningfulUpdate = readStringField(doc, 'last_meaningful_update_at').trim() ||
        readStringField(doc, 'created_at').trim() ||
        doc.$createdAt;
    return {
        $id: doc.$id,
        student_user_id: readStringField(doc, 'student_user_id'),
        student_name: readStringField(doc, 'student_name'),
        student_enrollment_no: readStringField(doc, 'student_enrollment_no'),
        student_department_id: resolvedStudentDept?.id ?? rawStudentDept,
        maintenance_department_id: resolvedMaintDept?.id ?? rawMaintDept,
        title: readStringField(doc, 'title'),
        location: readStringField(doc, 'location'),
        description: readStringField(doc, 'description'),
        priority,
        status,
        support_count: supportCount,
        last_meaningful_update_at: lastMeaningfulUpdate,
        ...(attachmentFileId ? { attachment_file_id: attachmentFileId } : {}),
        ...(resolvedMaintDept
            ? {
                department_code: resolvedMaintDept.code,
                department_name: resolvedMaintDept.name,
            }
            : {}),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
        updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
    };
}
/**
 * Projects a complaint document based on caller authorization tier.
 * Peer students receive a strictly redacted projection with zero creator PII or attachment references.
 */
function projectComplaint(complaint, options) {
    const base = {
        ...(complaint.$id ? { $id: complaint.$id } : {}),
        student_department_id: complaint.student_department_id,
        maintenance_department_id: complaint.maintenance_department_id,
        title: complaint.title,
        location: complaint.location,
        description: complaint.description,
        priority: complaint.priority,
        status: complaint.status,
        support_count: complaint.support_count,
        ...(complaint.last_meaningful_update_at
            ? { last_meaningful_update_at: complaint.last_meaningful_update_at }
            : {}),
        ...(complaint.department_code ? { department_code: complaint.department_code } : {}),
        ...(complaint.department_name ? { department_name: complaint.department_name } : {}),
        is_own_complaint: options.isOwnComplaint,
        created_at: complaint.created_at,
        updated_at: complaint.updated_at,
    };
    if (!options.includePrivateDetails) {
        return base;
    }
    return {
        ...base,
        ...(complaint.student_user_id ? { student_user_id: complaint.student_user_id } : {}),
        ...(complaint.student_name ? { student_name: complaint.student_name } : {}),
        ...(complaint.student_enrollment_no ? { student_enrollment_no: complaint.student_enrollment_no } : {}),
        ...(options.studentPhoneNumber ? { student_phone_number: options.studentPhoneNumber } : {}),
        ...(complaint.attachment_file_id ? { attachment_file_id: complaint.attachment_file_id } : {}),
    };
}
/**
 * Resolves active maintenance department IDs authorized for a Department Admin caller.
 * Supports DB-backed department_admins records (with scope='maintenance') and legacy department_code fallback.
 */
async function resolveAuthorizedMaintenanceDeptIds(databases, config, caller) {
    if (caller.role !== 'department_admin') {
        return [];
    }
    if (Array.isArray(caller.admin_assignments)) {
        const ids = new Set();
        for (const assignment of caller.admin_assignments) {
            if (assignment.is_active && assignment.scope === 'maintenance') {
                const dept = resolveDepartment(assignment.department_id);
                if (dept && dept.is_maintenance && dept.is_active) {
                    ids.add(dept.id);
                }
            }
        }
        return [...ids];
    }
    try {
        const adminRes = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('user_id', caller.id), Query.limit(20)]);
        if (adminRes.total > 0) {
            const ids = new Set();
            for (const doc of adminRes.documents) {
                const isActive = readBooleanField(doc, 'is_active') ?? true;
                const scope = readStringField(doc, 'scope');
                const rawDeptId = readStringField(doc, 'department_id');
                const dept = resolveDepartment(rawDeptId);
                if (isActive && scope === 'maintenance' && dept && dept.is_maintenance && dept.is_active) {
                    ids.add(dept.id);
                }
            }
            return [...ids];
        }
    }
    catch {
        // department_admins collection may not exist in legacy mock or pre-migration DB
    }
    const fallbackDept = caller.department_code ? resolveDepartment(caller.department_code) : null;
    if (fallbackDept && fallbackDept.is_maintenance && fallbackDept.is_active) {
        return [fallbackDept.id];
    }
    return [];
}
/**
 * Looks up the creator's verified phone number for authorized viewers (Creator, concerned Maintenance Admin, Principal).
 */
async function getCreatorPhoneNumber(databases, config, studentUserId) {
    if (!studentUserId) {
        return undefined;
    }
    try {
        const profileRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', studentUserId), Query.limit(1)]);
        const profileDoc = profileRes.documents[0];
        if (!profileDoc) {
            return undefined;
        }
        const phone = readStringField(profileDoc, 'phone_number').trim();
        return phone || undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Fetches caller profile from the profiles collection.
 */
async function getCallerProfile(databases, userId, databaseId, profilesCollectionId) {
    const res = await databases.listDocuments(databaseId, profilesCollectionId, [
        Query.equal('user_id', userId),
        Query.limit(1),
    ]);
    if (res.total === 0 || !res.documents[0]) {
        return null;
    }
    const doc = res.documents[0];
    const role = resolveProfileRole(readStringField(doc, 'role'));
    const rawDeptId = readStringField(doc, 'student_department_id') || readStringField(doc, 'department_code');
    const resolvedDept = resolveDepartment(rawDeptId);
    const legacyLocked = readBooleanField(doc, 'is_locked');
    const nameLocked = readBooleanField(doc, 'name_locked') ?? Boolean(legacyLocked);
    const enrollmentLocked = readBooleanField(doc, 'enrollment_locked') ?? Boolean(legacyLocked);
    const phoneNumber = readStringField(doc, 'phone_number').trim();
    const phoneLocked = readBooleanField(doc, 'phone_locked') ??
        Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));
    return {
        $id: doc.$id,
        user_id: readStringField(doc, 'user_id') || userId,
        auth_user_id: readStringField(doc, 'auth_user_id') || userId,
        email: readStringField(doc, 'email'),
        name: readStringField(doc, 'name'),
        enrollment_no: readStringField(doc, 'enrollment_no').trim(),
        student_department_id: role === 'student' ? (resolvedDept?.id ?? null) : null,
        phone_number: phoneNumber,
        role,
        name_locked: nameLocked,
        enrollment_locked: enrollmentLocked,
        phone_locked: phoneLocked,
        is_locked: nameLocked && enrollmentLocked && phoneLocked,
        ...(resolvedDept
            ? {
                department_code: resolvedDept.code,
                department_name: resolvedDept.name,
            }
            : {}),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
        updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
    };
}
// ----------------------------------------------------
// 1. Create Complaint
// ----------------------------------------------------
/**
 * Creates an academic-department-scoped complaint routed to one of the 6 maintenance departments.
 * Derives creator identity and student_department_id strictly server-side, sets Pending status
 * and base-1 support count, and rejects obsolete public complaint requests.
 */
export async function handleCreateComplaint(context, caller, data, deps) {
    const { res, log, error } = context;
    const config = getAppwriteConfig();
    const serverClients = deps?.databases && deps?.storage ? null : getServerClient();
    const databases = deps?.databases ?? serverClients.databases;
    const storage = deps?.storage ?? serverClients.storage;
    try {
        // 1. Fetch caller's verified profile
        const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
        if (caller.role !== 'student' || (profile && profile.role !== 'student')) {
            return res.json({
                success: false,
                error: 'Only students with a completed profile can file complaints.',
                code: 'FORBIDDEN',
            }, 403);
        }
        if (!profile ||
            !profile.name_locked ||
            !profile.enrollment_locked ||
            !profile.phone_locked ||
            !profile.enrollment_no ||
            !profile.phone_number ||
            !PHONE_NUMBER_REGEX.test(profile.phone_number) ||
            !profile.student_department_id ||
            !isAcademicDepartment(profile.student_department_id)) {
            return res.json({
                success: false,
                error: 'Student profile must be complete and verified before raising complaints.',
                code: 'PROFILE_INCOMPLETE',
            }, 400);
        }
        // 2. Reject obsolete public complaint functionality
        if (data.issue_type === 'public') {
            return res.json({
                success: false,
                error: 'Public complaint functionality has been removed. Complaints are scoped to your academic department and routed to a maintenance department.',
                code: 'PUBLIC_COMPLAINTS_REMOVED',
            }, 400);
        }
        // 3. Validate maintenance department selection against active 6 maintenance departments
        const rawMaintDeptId = typeof data.maintenance_department_id === 'string'
            ? data.maintenance_department_id.trim()
            : '';
        const maintenanceDept = resolveDepartment(rawMaintDeptId);
        if (!maintenanceDept || !maintenanceDept.is_maintenance || !maintenanceDept.is_active) {
            return res.json({
                success: false,
                error: 'Please select a valid active maintenance department.',
                code: 'INVALID_MAINTENANCE_DEPARTMENT',
            }, 400);
        }
        // 4. Validate complaint fields
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        const location = typeof data.location === 'string' ? data.location.trim() : '';
        const description = typeof data.description === 'string' ? data.description.trim() : '';
        const rawPriority = typeof data.priority === 'string' ? data.priority.trim() : '';
        const attachmentFileId = typeof data.attachment_file_id === 'string' && data.attachment_file_id.trim().length > 0
            ? data.attachment_file_id.trim()
            : undefined;
        if (title.length < 5 || title.length > 150) {
            return res.json({
                success: false,
                error: 'Complaint title must be between 5 and 150 characters.',
                code: 'INVALID_TITLE',
            }, 400);
        }
        if (location.length < 3 || location.length > 100) {
            return res.json({
                success: false,
                error: 'Location must be between 3 and 100 characters.',
                code: 'INVALID_LOCATION',
            }, 400);
        }
        if (description.length < 10 || description.length > 2000) {
            return res.json({
                success: false,
                error: 'Description must be between 10 and 2000 characters.',
                code: 'INVALID_DESCRIPTION',
            }, 400);
        }
        if (rawPriority !== 'low' && rawPriority !== 'medium' && rawPriority !== 'high') {
            return res.json({
                success: false,
                error: "Priority must be 'low', 'medium', or 'high'.",
                code: 'INVALID_PRIORITY',
            }, 400);
        }
        const priority = rawPriority;
        // 4b. Server-side validation & private lockdown of optional attachment
        let lockedAttachmentPermissions;
        if (attachmentFileId) {
            const attachmentCheck = await validateAttachmentForComplaint(databases, storage, config, caller.id, attachmentFileId);
            if (!attachmentCheck.valid) {
                return res.json({
                    success: false,
                    error: attachmentCheck.error || 'Invalid attachment.',
                    code: attachmentCheck.code || 'INVALID_ATTACHMENT',
                }, attachmentCheck.statusCode || 400);
            }
            lockedAttachmentPermissions = attachmentCheck.originalPermissions;
            await storage.updateFile(config.storageBucketId, attachmentFileId, undefined, []);
        }
        // 5. Construct document with server-derived student identity and separated jurisdictions
        const now = new Date().toISOString();
        const complaintData = {
            student_user_id: profile.user_id,
            student_name: profile.name,
            student_enrollment_no: profile.enrollment_no,
            student_department_id: profile.student_department_id,
            maintenance_department_id: maintenanceDept.id,
            title,
            location,
            description,
            priority,
            status: 'Pending',
            support_count: 1,
            last_meaningful_update_at: now,
            ...(attachmentFileId ? { attachment_file_id: attachmentFileId } : {}),
            created_at: now,
            updated_at: now,
        };
        let doc;
        try {
            doc = await databases.createDocument(config.databaseId, config.complaintsCollectionId, ID.unique(), complaintData, []);
        }
        catch (createErr) {
            if (attachmentFileId && lockedAttachmentPermissions) {
                try {
                    await storage.updateFile(config.storageBucketId, attachmentFileId, undefined, lockedAttachmentPermissions);
                }
                catch {
                    // Best-effort restore of uncommitted attachment permissions
                }
            }
            throw createErr;
        }
        log(`[complaints] Created complaint ${doc.$id} by student ${profile.user_id} (academic=${profile.student_department_id}, maintenance=${maintenanceDept.id})`);
        const createdComplaint = projectComplaint({
            $id: doc.$id,
            ...complaintData,
            department_code: maintenanceDept.code,
            department_name: maintenanceDept.name,
        }, {
            includePrivateDetails: true,
            isOwnComplaint: true,
            studentPhoneNumber: profile.phone_number,
        });
        return res.json({
            success: true,
            data: {
                complaint: createdComplaint,
            },
        }, 201);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error creating complaint: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to record complaint due to database error.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 2. List Complaints (Academic Department Scoped)
// ----------------------------------------------------
export async function handleListComplaints(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    try {
        if (data.feed_type === 'public') {
            return res.json({
                success: false,
                error: 'Public complaint feed has been removed.',
                code: 'PUBLIC_COMPLAINTS_REMOVED',
            }, 400);
        }
        if (caller.role !== 'student') {
            return res.json({
                success: false,
                error: 'Only students can view the academic department feed.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
        if (!profile || !profile.student_department_id || !isAcademicDepartment(profile.student_department_id)) {
            return res.json({
                success: false,
                error: 'Caller profile or academic department not found.',
                code: 'PROFILE_NOT_FOUND',
            }, 401);
        }
        const normalizedStatus = normalizeComplaintStatus(data.status);
        const search = typeof data.search === 'string' ? data.search.trim().toLowerCase() : '';
        const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
        const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;
        const complaintsDocuments = [];
        let offset = 0;
        let totalDocuments = 0;
        do {
            const queries = [
                Query.equal('student_department_id', profile.student_department_id),
                Query.orderDesc('$createdAt'),
                Query.limit(100),
                Query.offset(offset),
            ];
            if (normalizedStatus) {
                queries.push(Query.equal('status', normalizedStatus));
            }
            const result = await databases.listDocuments(config.databaseId, config.complaintsCollectionId, queries);
            complaintsDocuments.push(...result.documents);
            totalDocuments = result.total;
            offset += result.documents.length;
            if (result.documents.length === 0)
                break;
        } while (complaintsDocuments.length < totalDocuments);
        // shortcut: local search scans the scoped result set; add indexed search when volume requires it.
        let complaints = complaintsDocuments
            .map((doc) => mapDocToComplaint(doc))
            .filter((c) => c.student_department_id === profile.student_department_id);
        if (search.length > 0) {
            complaints = complaints.filter((c) => c.title.toLowerCase().includes(search) ||
                c.location.toLowerCase().includes(search) ||
                c.description.toLowerCase().includes(search));
        }
        const total = complaints.length;
        const startIndex = (page - 1) * limit;
        const paginatedComplaints = complaints.slice(startIndex, startIndex + limit).map((c) => {
            const isCreator = c.student_user_id === caller.id;
            return projectComplaint(c, {
                includePrivateDetails: isCreator,
                isOwnComplaint: isCreator,
                ...(isCreator && profile.phone_number ? { studentPhoneNumber: profile.phone_number } : {}),
            });
        });
        return res.json({
            success: true,
            data: {
                complaints: paginatedComplaints,
                total,
                page,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error listing complaints: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve complaints.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 3. Get Complaint & Oracle Elimination
// ----------------------------------------------------
export async function handleGetComplaint(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'MISSING_COMPLAINT_ID',
        }, 400);
    }
    try {
        const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
        if (!profile && caller.role === 'student') {
            return res.json({
                success: false,
                error: 'Caller profile not found.',
                code: 'UNAUTHORIZED',
            }, 401);
        }
        let doc;
        try {
            doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const complaint = mapDocToComplaint(doc);
        let includePrivateDetails = false;
        let isOwnComplaint = false;
        if (caller.role === 'student') {
            const callerDept = profile?.student_department_id;
            isOwnComplaint = complaint.student_user_id === caller.id;
            const isSameAcademicDept = Boolean(callerDept && callerDept === complaint.student_department_id);
            if (!isOwnComplaint && !isSameAcademicDept) {
                return res.json({
                    success: false,
                    error: 'Complaint not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
            includePrivateDetails = isOwnComplaint;
        }
        else if (caller.role === 'department_admin') {
            const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
            if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
                return res.json({
                    success: false,
                    error: 'Complaint not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
            includePrivateDetails = true;
        }
        else if (caller.role === 'principal' && profile?.role !== 'student') {
            includePrivateDetails = true;
        }
        else {
            return res.json({
                success: false,
                error: 'Forbidden: Unauthorized role.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const creatorPhone = includePrivateDetails
            ? isOwnComplaint && profile?.phone_number
                ? profile.phone_number
                : await getCreatorPhoneNumber(databases, config, complaint.student_user_id)
            : undefined;
        const projectedComplaint = projectComplaint(complaint, {
            includePrivateDetails,
            isOwnComplaint,
            studentPhoneNumber: creatorPhone,
        });
        let hasSupported = false;
        const supportDocId = crypto
            .createHash('sha256')
            .update(`${complaintId}:${caller.id}`)
            .digest('hex')
            .slice(0, 32);
        try {
            const supportDoc = await databases.getDocument(config.databaseId, config.supportsCollectionId, supportDocId);
            const supportStatus = readStringField(supportDoc, 'status');
            hasSupported = supportStatus === '' || supportStatus === 'active';
        }
        catch {
            hasSupported = false;
        }
        return res.json({
            success: true,
            data: {
                complaint: projectedComplaint,
                has_supported: hasSupported,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error retrieving complaint ${complaintId}: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve complaint.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 4. Support Complaint
// ----------------------------------------------------
export async function handleSupportComplaint(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'INVALID_COMPLAINT_ID',
        }, 400);
    }
    try {
        const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
        if (!profile ||
            !profile.name_locked ||
            !profile.enrollment_locked ||
            !profile.enrollment_no ||
            !profile.student_department_id) {
            return res.json({
                success: false,
                error: 'Student profile must be complete and verified before supporting complaints.',
                code: 'PROFILE_INCOMPLETE',
            }, 400);
        }
        if (profile.role !== 'student') {
            return res.json({
                success: false,
                error: 'Only students are eligible to support complaints.',
                code: 'FORBIDDEN',
            }, 403);
        }
        let doc;
        try {
            doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const complaint = mapDocToComplaint(doc);
        if (complaint.student_user_id === caller.id) {
            return res.json({
                success: false,
                error: 'Students cannot support their own complaints.',
                code: 'CANNOT_SUPPORT_OWN_COMPLAINT',
            }, 400);
        }
        if (profile.student_department_id !== complaint.student_department_id) {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const supportDocId = crypto
            .createHash('sha256')
            .update(`${complaintId}:${caller.id}`)
            .digest('hex')
            .slice(0, 32);
        const now = new Date().toISOString();
        try {
            await databases.createDocument(config.databaseId, config.supportsCollectionId, supportDocId, {
                complaint_id: complaintId,
                user_id: caller.id,
                status: 'active',
                created_at: now,
            }, []);
        }
        catch (insertErr) {
            const errObj = insertErr;
            if (errObj?.code === 409 || errObj?.message?.includes('already exists')) {
                return res.json({
                    success: false,
                    error: 'You have already supported this complaint.',
                    code: 'ALREADY_SUPPORTED',
                }, 409);
            }
            throw insertErr;
        }
        let newCount;
        try {
            const activeSupports = await databases.listDocuments(config.databaseId, config.supportsCollectionId, [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(100)]);
            newCount = 1 + activeSupports.total;
            await databases.updateDocument(config.databaseId, config.complaintsCollectionId, complaintId, { support_count: newCount });
        }
        catch (updateErr) {
            if (databases.deleteDocument) {
                await databases.deleteDocument(config.databaseId, config.supportsCollectionId, supportDocId).catch(() => undefined);
            }
            throw updateErr;
        }
        log(`[complaints] User ${caller.id} supported complaint ${complaintId} (new count: ${newCount})`);
        return res.json({
            success: true,
            data: {
                support_count: newCount,
                has_supported: true,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error supporting complaint ${complaintId}: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to support complaint.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 5. Get Support State
// ----------------------------------------------------
export async function handleGetSupportState(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'INVALID_COMPLAINT_ID',
        }, 400);
    }
    try {
        let doc;
        try {
            doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const complaint = mapDocToComplaint(doc);
        if (caller.role === 'student') {
            const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
            const isCreator = complaint.student_user_id === caller.id;
            if (!isCreator &&
                (!profile?.student_department_id ||
                    profile.student_department_id !== complaint.student_department_id)) {
                return res.json({
                    success: false,
                    error: 'Complaint not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
        }
        else if (caller.role === 'department_admin') {
            const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
            if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
                return res.json({
                    success: false,
                    error: 'Complaint not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
        }
        else if (caller.role !== 'principal') {
            return res.json({
                success: false,
                error: 'Forbidden: Unauthorized role.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const supportDocId = crypto
            .createHash('sha256')
            .update(`${complaintId}:${caller.id}`)
            .digest('hex')
            .slice(0, 32);
        let hasSupported = false;
        try {
            const supportDoc = await databases.getDocument(config.databaseId, config.supportsCollectionId, supportDocId);
            const supportStatus = readStringField(supportDoc, 'status');
            hasSupported = supportStatus === '' || supportStatus === 'active';
        }
        catch {
            hasSupported = false;
        }
        return res.json({
            success: true,
            data: {
                support_count: complaint.support_count,
                has_supported: hasSupported,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error checking support state for ${complaintId}: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve support state.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 6. Get Admin Dashboard (Maintenance Scoped)
// ----------------------------------------------------
export async function handleGetAdminDashboard(context, caller, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
    const primaryDeptId = authorizedMaintDeptIds[0];
    const adminDept = primaryDeptId ? resolveDepartment(primaryDeptId) : null;
    if (caller.role !== 'department_admin' || authorizedMaintDeptIds.length === 0 || !adminDept) {
        return res.json({
            success: false,
            error: 'Forbidden: Department administrator privileges required.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const maintDeptFilter = authorizedMaintDeptIds.length === 1 ? authorizedMaintDeptIds[0] : authorizedMaintDeptIds;
    try {
        const [pendingRes, inProgRes, resolvedRes] = await Promise.all([
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', maintDeptFilter),
                Query.equal('status', 'Pending'),
                Query.limit(1),
            ]),
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', maintDeptFilter),
                Query.equal('status', 'In Progress'),
                Query.limit(1),
            ]),
            databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
                Query.equal('maintenance_department_id', maintDeptFilter),
                Query.equal('status', 'Resolved'),
                Query.limit(1),
            ]),
        ]);
        const metrics = {
            total_open: pendingRes.total,
            total_in_progress: inProgRes.total,
            total_resolved: resolvedRes.total,
            department_id: adminDept.id,
            department_code: adminDept.code,
        };
        return res.json({
            success: true,
            data: {
                metrics,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[admin] Error fetching admin dashboard metrics: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve admin dashboard metrics.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 7. List Admin Complaints (Maintenance Scoped)
// ----------------------------------------------------
export async function handleListAdminComplaints(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
    if (caller.role !== 'department_admin' || authorizedMaintDeptIds.length === 0) {
        return res.json({
            success: false,
            error: 'Forbidden: Department administrator privileges required.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const maintDeptFilter = authorizedMaintDeptIds.length === 1 ? authorizedMaintDeptIds[0] : authorizedMaintDeptIds;
    try {
        const normalizedStatus = normalizeComplaintStatus(data.status);
        const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
        const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;
        const queries = [
            Query.equal('maintenance_department_id', maintDeptFilter),
            ...(normalizedStatus ? [Query.equal('status', normalizedStatus)] : []),
            Query.orderDesc('$createdAt'),
            Query.limit(limit * 2),
        ];
        const result = await databases.listDocuments(config.databaseId, config.complaintsCollectionId, queries);
        const allComplaints = result.documents
            .map((doc) => mapDocToComplaint(doc))
            .filter((c) => authorizedMaintDeptIds.includes(c.maintenance_department_id));
        const total = allComplaints.length;
        const startIndex = (page - 1) * limit;
        const paginatedComplaints = allComplaints.slice(startIndex, startIndex + limit);
        return res.json({
            success: true,
            data: {
                complaints: paginatedComplaints,
                total,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[admin] Error listing admin complaints: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve admin complaints queue.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 8. Update Admin Complaint (Maintenance Scoped)
// ----------------------------------------------------
export async function handleUpdateAdminComplaint(context, caller, data, deps) {
    const { res, error, log } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
    if (caller.role !== 'department_admin' || authorizedMaintDeptIds.length === 0) {
        return res.json({
            success: false,
            error: 'Forbidden: Department administrator privileges required.',
            code: 'FORBIDDEN',
        }, 403);
    }
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    const normalizedStatus = normalizeComplaintStatus(data.status);
    const officialResponse = typeof data.official_response === 'string' ? data.official_response.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'INVALID_ID',
        }, 400);
    }
    if (normalizedStatus !== 'In Progress' && normalizedStatus !== 'Resolved') {
        return res.json({
            success: false,
            error: "Status must be updated to 'In Progress' or 'Resolved'.",
            code: 'INVALID_STATUS',
        }, 400);
    }
    if (officialResponse.length < 5 || officialResponse.length > 1000) {
        return res.json({
            success: false,
            error: 'Official response must be between 5 and 1000 characters.',
            code: 'INVALID_RESPONSE',
        }, 400);
    }
    try {
        let doc;
        try {
            doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const existing = mapDocToComplaint(doc);
        if (!authorizedMaintDeptIds.includes(existing.maintenance_department_id)) {
            return res.json({
                success: false,
                error: 'Complaint not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const now = new Date().toISOString();
        const updatedDoc = await databases.updateDocument(config.databaseId, config.complaintsCollectionId, complaintId, {
            status: normalizedStatus,
            last_meaningful_update_at: now,
            updated_at: now,
        });
        log(`[admin] Admin ${caller.id} updated complaint ${complaintId} to ${normalizedStatus}`);
        return res.json({
            success: true,
            data: {
                complaint: {
                    ...mapDocToComplaint(updatedDoc),
                    official_response: officialResponse,
                },
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[admin] Error updating complaint ${complaintId}: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to update complaint.',
            code: 'DATABASE_ERROR',
        }, 500);
    }
}
// ----------------------------------------------------
// 9. Get Private Complaint Attachment (Authorized Viewers Only)
// ----------------------------------------------------
export async function handleGetComplaintAttachment(context, caller, data, deps) {
    const { res, error } = context;
    const config = getAppwriteConfig();
    const serverClients = deps?.databases && deps?.storage ? null : getServerClient();
    const databases = deps?.databases ?? serverClients.databases;
    const storage = deps?.storage ?? serverClients.storage;
    const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
    const requestedFileId = typeof data.file_id === 'string' ? data.file_id.trim() : '';
    if (!complaintId) {
        return res.json({
            success: false,
            error: 'Complaint ID is required.',
            code: 'MISSING_COMPLAINT_ID',
        }, 400);
    }
    try {
        let doc;
        try {
            doc = await databases.getDocument(config.databaseId, config.complaintsCollectionId, complaintId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Attachment not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const complaint = mapDocToComplaint(doc);
        if (caller.role === 'student') {
            if (complaint.student_user_id !== caller.id) {
                return res.json({
                    success: false,
                    error: 'Attachment not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
        }
        else if (caller.role === 'department_admin') {
            const authorizedMaintDeptIds = await resolveAuthorizedMaintenanceDeptIds(databases, config, caller);
            if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
                return res.json({
                    success: false,
                    error: 'Attachment not found.',
                    code: 'NOT_FOUND',
                }, 404);
            }
        }
        else if (caller.role === 'principal') {
            const profile = await getCallerProfile(databases, caller.id, config.databaseId, config.profilesCollectionId);
            if (profile?.role === 'student') {
                return res.json({
                    success: false,
                    error: 'Forbidden: Unauthorized role.',
                    code: 'FORBIDDEN',
                }, 403);
            }
        }
        else {
            return res.json({
                success: false,
                error: 'Forbidden: Unauthorized role.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const linkedFileId = complaint.attachment_file_id;
        if (!linkedFileId || (requestedFileId && requestedFileId !== linkedFileId)) {
            return res.json({
                success: false,
                error: 'Attachment not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        let fileMeta;
        let rawBuffer;
        try {
            fileMeta = await storage.getFile(config.storageBucketId, linkedFileId);
            rawBuffer = await storage.getFileDownload(config.storageBucketId, linkedFileId);
        }
        catch {
            return res.json({
                success: false,
                error: 'Attachment not found.',
                code: 'NOT_FOUND',
            }, 404);
        }
        const normalizedMime = (fileMeta.mimeType || '').trim().toLowerCase();
        const bytes = new Uint8Array(rawBuffer);
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMime) ||
            bytes.byteLength <= 0 ||
            bytes.byteLength > MAX_ATTACHMENT_BYTES ||
            !matchesAttachmentMagicBytes(bytes, normalizedMime)) {
            return res.json({
                success: false,
                error: 'Attachment failed server content validation.',
                code: 'INVALID_ATTACHMENT_CONTENT',
            }, 400);
        }
        const attachment = {
            file_id: linkedFileId,
            file_name: fileMeta.name || 'attachment',
            mime_type: normalizedMime,
            size_bytes: bytes.byteLength,
            content_base64: Buffer.from(bytes).toString('base64'),
        };
        return res.json({
            success: true,
            data: {
                attachment,
            },
        }, 200);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        error(`[complaints] Error fetching private attachment for ${complaintId}: ${msg}`);
        return res.json({
            success: false,
            error: 'Failed to retrieve attachment.',
            code: 'STORAGE_ERROR',
        }, 500);
    }
}
