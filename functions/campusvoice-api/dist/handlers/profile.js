import { ID, Query } from 'node-appwrite';
import { resolveActiveAdminAssignmentsFromDocs } from '../auth.js';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { INSTITUTIONAL_DEPARTMENTS, PHONE_NUMBER_REGEX, STUDENT_NAME_REGEX, extractAndMapEnrollment, getCanonicalDepartmentCode, isAcademicDepartment, readBooleanField, readStringField, resolveDepartment, resolveLegacyDepartmentCode, toDepartmentModel, } from '../departments.js';
import { hasCompleteStudentProfileFields, isIncompleteLockedProfileStub, readProfileLockSummary, } from '../stateMachines.js';
function isDocumentLike(value) {
    return typeof value === 'object' && value !== null && typeof value.$id === 'string';
}
function buildProfileResponse(docId, fields) {
    const isLocked = fields.name_locked && fields.enrollment_locked && fields.phone_locked;
    return {
        ...(docId ? { $id: docId } : {}),
        user_id: fields.user_id,
        auth_user_id: fields.auth_user_id,
        email: fields.email,
        name: fields.name,
        display_name: fields.display_name,
        enrollment_no: fields.enrollment_no,
        student_department_id: fields.student_department_id,
        ...(fields.department_id ? { department_id: fields.department_id } : {}),
        phone_number: fields.phone_number,
        role: fields.role,
        profile_status: fields.profile_status,
        name_locked: fields.name_locked,
        enrollment_locked: fields.enrollment_locked,
        phone_locked: fields.phone_locked,
        is_locked: isLocked,
        ...(fields.is_onboarded !== undefined ? { is_onboarded: fields.is_onboarded } : {}),
        ...(fields.admin_assignments && fields.admin_assignments.length > 0
            ? { admin_assignments: fields.admin_assignments }
            : {}),
        ...(fields.department_name ? { department_name: fields.department_name } : {}),
        created_at: fields.created_at,
        updated_at: fields.updated_at,
    };
}
/**
 * Fetches the authenticated caller's profile and onboarding completion status.
 */
export async function handleGetProfile(context, caller, deps) {
    const { res, log, error } = context;
    try {
        const config = getAppwriteConfig();
        const databases = deps?.databases ?? getServerClient().databases;
        // 1. After authenticating caller, ALWAYS collect ALL active department_admins
        // matching either user_id or email so inactive user_id rows never shadow new email grants.
        const adminColIds = Array.from(new Set([config.departmentAdminsCollectionId, 'department_admins'].filter(Boolean)));
        const matchedCandidateMap = new Map();
        for (const colId of adminColIds) {
            try {
                try {
                    const userResult = await databases.listDocuments(config.databaseId, colId, [
                        Query.equal('user_id', caller.id),
                        Query.equal('is_active', true),
                        Query.limit(50),
                    ]);
                    for (const d of userResult.documents) {
                        matchedCandidateMap.set(d.$id, d);
                    }
                }
                catch {
                    const userResult = await databases.listDocuments(config.databaseId, colId, [
                        Query.equal('user_id', caller.id),
                        Query.limit(50),
                    ]);
                    for (const d of userResult.documents) {
                        if (readBooleanField(d, 'is_active') === true) {
                            matchedCandidateMap.set(d.$id, d);
                        }
                    }
                }
                if (caller.email) {
                    const emailVariants = Array.from(new Set([caller.email, caller.email.trim().toLowerCase(), caller.email.trim()])).filter(Boolean);
                    for (const emailVal of emailVariants) {
                        try {
                            const emailResult = await databases.listDocuments(config.databaseId, colId, [
                                Query.equal('email', emailVal),
                                Query.equal('is_active', true),
                                Query.limit(50),
                            ]);
                            for (const d of emailResult.documents) {
                                matchedCandidateMap.set(d.$id, d);
                            }
                        }
                        catch {
                            const emailResult = await databases.listDocuments(config.databaseId, colId, [
                                Query.equal('email', emailVal),
                                Query.limit(50),
                            ]);
                            for (const d of emailResult.documents) {
                                if (readBooleanField(d, 'is_active') === true) {
                                    matchedCandidateMap.set(d.$id, d);
                                }
                            }
                        }
                    }
                }
                if (matchedCandidateMap.size > 0) {
                    break;
                }
            }
            catch (err) {
                log(`[profile] Notice: query on ${colId} failed: ${String(err)}`);
            }
        }
        const candidateAdminDocs = Array.from(matchedCandidateMap.values());
        const { assignments: dbResolvedAssignments } = resolveActiveAdminAssignmentsFromDocs(candidateAdminDocs, caller.id, caller.email);
        const resolvedAssignments = dbResolvedAssignments.length > 0
            ? dbResolvedAssignments
            : candidateAdminDocs.length === 0 && Array.isArray(caller.admin_assignments)
                ? caller.admin_assignments.filter((a) => a.is_active === true)
                : [];
        const primaryAssignment = resolvedAssignments.find((a) => a.scope === 'maintenance') ||
            resolvedAssignments[0] ||
            null;
        const resolvedDept = primaryAssignment
            ? resolveDepartment(primaryAssignment.department_id)
            : null;
        const assignment = {
            department_id: resolvedDept
                ? resolvedDept.id
                : (primaryAssignment?.department_id ?? null),
            department_name: resolvedDept ? resolvedDept.name : null,
        };
        const listResult = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
        const doc = listResult.total > 0 && listResult.documents[0] ? listResult.documents[0] : null;
        const rawDocRole = doc ? readStringField(doc, 'role') : '';
        // Reject Principal/Student role mismatches (spoofing detection)
        if ((caller.role === 'principal' && doc && rawDocRole !== 'principal') ||
            (caller.role === 'student' && doc && rawDocRole === 'principal')) {
            return res.json({
                success: false,
                error: 'Forbidden: Unauthorized role.',
                code: 'FORBIDDEN',
            }, 403);
        }
        const isCallerAdmin = resolvedAssignments.length > 0;
        const isPrincipal = !isCallerAdmin &&
            caller.role === 'principal' &&
            (doc ? rawDocRole === 'principal' || readBooleanField(doc, 'is_principal') === true : true);
        const effectiveRole = isCallerAdmin
            ? 'department_admin'
            : isPrincipal
                ? 'principal'
                : 'student';
        // 3. If profile document exists:
        if (doc) {
            const locks = readProfileLockSummary(doc);
            const isStaleAdminRole = effectiveRole === 'student' && rawDocRole === 'department_admin';
            const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
            const phoneNumber = readStringField(doc, 'phone_number').trim();
            const rawStudentDeptId = readStringField(doc, 'student_department_id');
            const rawLegacyDeptCode = readStringField(doc, 'department_code');
            const resolvedStudentDept = resolveDepartment(rawStudentDeptId) ||
                (!rawStudentDeptId && enrollmentNo.length === 12
                    ? resolveLegacyDepartmentCode(rawLegacyDeptCode)
                    : null);
            const callerDept = caller.department_id ? resolveDepartment(caller.department_id) : null;
            const effectiveStudentDeptId = effectiveRole === 'student' &&
                resolvedStudentDept &&
                resolvedStudentDept.is_academic &&
                resolvedStudentDept.is_active
                ? resolvedStudentDept.id
                : null;
            const rawDocDeptId = readStringField(doc, 'department_id');
            const resolvedStoredDept = resolveDepartment(rawDocDeptId) || resolveDepartment(rawStudentDeptId);
            const effectiveDeptId = isCallerAdmin
                ? (assignment.department_id ?? callerDept?.id ?? caller.department_id ?? resolvedStoredDept?.id ?? (rawDocDeptId ? rawDocDeptId : null))
                : isPrincipal
                    ? null
                    : effectiveStudentDeptId;
            const effectiveDeptName = isCallerAdmin
                ? (assignment.department_name || callerDept?.name || caller.department_name || resolvedStoredDept?.name || readStringField(doc, 'department_name') || '')
                : isPrincipal
                    ? ''
                    : effectiveStudentDeptId && resolvedStudentDept
                        ? resolvedStudentDept.name
                        : '';
            const hasValidStudentOnboarding = hasCompleteStudentProfileFields(doc);
            const isIncompleteLockedStub = effectiveRole === 'student' &&
                !hasValidStudentOnboarding &&
                isIncompleteLockedProfileStub(doc);
            const needsStudentUnlock = isStaleAdminRole || isIncompleteLockedStub;
            // Sync updated role / lock state back to database if needed
            if (needsStudentUnlock) {
                try {
                    await databases.updateDocument(config.databaseId, config.profilesCollectionId, doc.$id, {
                        ...(isStaleAdminRole ? { role: 'student' } : {}),
                        ...(!hasValidStudentOnboarding
                            ? {
                                name_locked: false,
                                enrollment_locked: false,
                                phone_locked: false,
                                ...(readBooleanField(doc, 'is_locked') !== undefined
                                    ? { is_locked: false }
                                    : {}),
                                profile_status: 'incomplete',
                            }
                            : {}),
                        updated_at: new Date().toISOString(),
                    });
                    log(`[profile] Synced role/lock reset on profile ${doc.$id} to student`);
                }
                catch (syncErr) {
                    log(`[profile] Notice: Could not sync stale admin downgrade to profile doc: ${String(syncErr)}`);
                }
            }
            else if (rawDocRole !== effectiveRole) {
                try {
                    await databases.updateDocument(config.databaseId, config.profilesCollectionId, doc.$id, {
                        role: effectiveRole,
                        updated_at: new Date().toISOString(),
                    });
                    log(`[profile] Updated profile ${doc.$id} role to ${effectiveRole}`);
                }
                catch (syncErr) {
                    log(`[profile] Notice: Could not sync effectiveRole to profile doc: ${String(syncErr)}`);
                }
            }
            const nameLocked = isCallerAdmin || isPrincipal
                ? true
                : needsStudentUnlock && !hasValidStudentOnboarding
                    ? false
                    : locks.nameLocked;
            const enrollmentLocked = isCallerAdmin || isPrincipal
                ? true
                : needsStudentUnlock && !hasValidStudentOnboarding
                    ? false
                    : locks.enrollmentLocked;
            const phoneLocked = isCallerAdmin || isPrincipal
                ? true
                : needsStudentUnlock && !hasValidStudentOnboarding
                    ? false
                    : locks.phoneLocked;
            // is_onboarded: true for admin / principal, check fields + status for student
            const isOnboarded = isCallerAdmin || isPrincipal ? true : hasValidStudentOnboarding;
            const rawStatus = readStringField(doc, 'profile_status');
            const profileStatus = isCallerAdmin || isPrincipal
                ? rawStatus === 'pending_verification' || rawStatus === 'rejected'
                    ? rawStatus
                    : 'complete'
                : needsStudentUnlock && !hasValidStudentOnboarding
                    ? 'incomplete'
                    : rawStatus === 'pending_verification' || rawStatus === 'rejected'
                        ? rawStatus
                        : isOnboarded
                            ? 'complete'
                            : 'incomplete';
            const profile = buildProfileResponse(doc.$id, {
                user_id: readStringField(doc, 'user_id') || readStringField(doc, 'auth_user_id') || caller.id,
                auth_user_id: readStringField(doc, 'auth_user_id') || caller.id,
                email: readStringField(doc, 'email') || caller.email,
                name: readStringField(doc, 'name') || readStringField(doc, 'display_name') || caller.name,
                display_name: readStringField(doc, 'display_name') || readStringField(doc, 'name') || caller.name,
                enrollment_no: enrollmentNo,
                student_department_id: effectiveStudentDeptId,
                department_id: effectiveDeptId,
                phone_number: phoneNumber,
                role: effectiveRole,
                profile_status: profileStatus,
                name_locked: nameLocked,
                enrollment_locked: enrollmentLocked,
                phone_locked: phoneLocked,
                is_onboarded: isOnboarded,
                admin_assignments: isCallerAdmin ? resolvedAssignments : undefined,
                department_name: effectiveDeptName,
                created_at: readStringField(doc, 'created_at') || doc.$createdAt,
                updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
            });
            return res.json({
                success: true,
                data: {
                    profile,
                    is_onboarded: isOnboarded,
                },
            }, 200);
        }
        // 4. If NO profile document exists:
        // - For principal: create profile document with role: 'principal' and is_onboarded: true
        // - For admin: create profile document with role: 'department_admin' and is_onboarded: true
        // - For student: return { profile: null, is_onboarded: false } so frontend redirects to onboarding
        if (effectiveRole === 'principal') {
            const now = new Date().toISOString();
            const newPrincipalProfileData = {
                user_id: caller.id,
                auth_user_id: caller.id,
                email: caller.email,
                name: caller.name,
                display_name: caller.name,
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                created_at: now,
                updated_at: now,
            };
            try {
                await databases.createDocument(config.databaseId, config.profilesCollectionId, caller.id, newPrincipalProfileData);
            }
            catch (createErr) {
                log(`[profile] Notice: principal profile creation skipped: ${String(createErr)}`);
            }
            return res.json({
                success: true,
                data: {
                    profile: buildProfileResponse(caller.id, {
                        user_id: caller.id,
                        auth_user_id: caller.id,
                        email: caller.email,
                        name: caller.name,
                        display_name: caller.name,
                        enrollment_no: '',
                        student_department_id: null,
                        phone_number: '',
                        role: 'principal',
                        profile_status: 'complete',
                        name_locked: true,
                        enrollment_locked: true,
                        phone_locked: true,
                        is_onboarded: true,
                        created_at: now,
                        updated_at: now,
                    }),
                    is_onboarded: true,
                },
            }, 200);
        }
        if (effectiveRole === 'department_admin') {
            const now = new Date().toISOString();
            const newProfileData = {
                user_id: caller.id,
                auth_user_id: caller.id,
                email: caller.email,
                name: caller.name,
                display_name: caller.name,
                role: 'department_admin',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                created_at: now,
                updated_at: now,
            };
            let adminProfileDoc = null;
            try {
                adminProfileDoc = await databases.createDocument(config.databaseId, config.profilesCollectionId, caller.id, newProfileData);
            }
            catch (createErr) {
                log(`[profile] Notice: admin profile creation failed: ${String(createErr)}`);
                try {
                    if (typeof databases.getDocument === 'function') {
                        adminProfileDoc = await databases.getDocument(config.databaseId, config.profilesCollectionId, caller.id);
                    }
                    else {
                        const fetchRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
                        if (fetchRes.total > 0 && fetchRes.documents[0]) {
                            adminProfileDoc = fetchRes.documents[0];
                        }
                    }
                }
                catch (fetchErr) {
                    log(`[profile] Notice: getDocument failed, falling back to listDocuments: ${String(fetchErr)}`);
                    try {
                        const fetchRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
                        if (fetchRes.total > 0 && fetchRes.documents[0]) {
                            adminProfileDoc = fetchRes.documents[0];
                        }
                    }
                    catch {
                        // ignore fallback fetch error
                    }
                }
            }
            const callerDept = caller.department_id ? resolveDepartment(caller.department_id) : null;
            const effectiveDeptId = assignment.department_id ?? callerDept?.id ?? caller.department_id ?? null;
            const effectiveDeptName = assignment.department_name || callerDept?.name || caller.department_name || '';
            const savedDoc = isDocumentLike(adminProfileDoc) ? adminProfileDoc : null;
            const returnedProfile = buildProfileResponse(savedDoc?.$id || caller.id, {
                user_id: (savedDoc && readStringField(savedDoc, 'user_id')) || caller.id,
                auth_user_id: (savedDoc && readStringField(savedDoc, 'auth_user_id')) || caller.id,
                email: (savedDoc && readStringField(savedDoc, 'email')) || caller.email,
                name: (savedDoc && (readStringField(savedDoc, 'name') || readStringField(savedDoc, 'display_name'))) ||
                    caller.name,
                display_name: (savedDoc && (readStringField(savedDoc, 'display_name') || readStringField(savedDoc, 'name'))) ||
                    caller.name,
                enrollment_no: '',
                student_department_id: null,
                department_id: effectiveDeptId,
                phone_number: '',
                role: 'department_admin',
                profile_status: 'complete',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                is_onboarded: true,
                admin_assignments: resolvedAssignments,
                department_name: effectiveDeptName,
                created_at: (savedDoc && (readStringField(savedDoc, 'created_at') || savedDoc.$createdAt)) || now,
                updated_at: (savedDoc && (readStringField(savedDoc, 'updated_at') || savedDoc.$updatedAt)) || now,
            });
            return res.json({
                success: true,
                data: {
                    profile: returnedProfile,
                    is_onboarded: true,
                },
            }, 200);
        }
        return res.json({
            success: true,
            data: {
                profile: null,
                is_onboarded: false,
            },
        }, 200);
    }
    catch (err) {
        error(`[profile] get-profile query error: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Unable to retrieve user profile.',
            code: 'PROFILE_FETCH_FAILED',
        }, 500);
    }
}
/**
 * Completes first-time student onboarding: validates name, enrollment [7:9] mapping,
 * and 10-digit Indian mobile number, derives student_department_id server-side,
 * and permanently locks all three fields.
 */
export async function handleCompleteOnboarding(context, caller, payload, deps) {
    const { res, log, error } = context;
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    if (caller.role === 'department_admin' || caller.role === 'principal') {
        return res.json({
            success: false,
            error: 'Administrative accounts do not require student profile onboarding.',
            code: 'ADMIN_ONBOARDING_NOT_REQUIRED',
        }, 400);
    }
    // 1. Validate student name
    const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (rawName.length < 2 || rawName.length > 100 || !STUDENT_NAME_REGEX.test(rawName)) {
        return res.json({
            success: false,
            error: 'Student name must be between 2 and 100 valid characters.',
            code: 'INVALID_NAME',
        }, 400);
    }
    // 2. Validate enrollment number and derive academic department via slice [7:9]
    const rawEnrollment = typeof payload.enrollment_no === 'string' ? payload.enrollment_no.trim() : '';
    if (!/^\d{12}$/.test(rawEnrollment)) {
        return res.json({
            success: false,
            error: 'Enrollment number must be exactly 12 numeric digits.',
            code: 'INVALID_ENROLLMENT_FORMAT',
        }, 400);
    }
    const enrollmentResult = extractAndMapEnrollment(rawEnrollment);
    if (!enrollmentResult.isValid ||
        !enrollmentResult.departmentId ||
        !isAcademicDepartment(enrollmentResult.departmentId)) {
        return res.json({
            success: false,
            error: enrollmentResult.error ||
                'Unmapped enrollment department code. Department mappings must be confirmed before registration.',
            code: 'INVALID_DEPARTMENT_CODE',
        }, 400);
    }
    // 3. Validate 10-digit phone number starting with 6, 7, 8, or 9
    const rawPhone = typeof payload.phone_number === 'string' ? payload.phone_number.trim() : '';
    if (!rawPhone) {
        return res.json({
            success: false,
            error: 'Phone number is required.',
            code: 'MISSING_PHONE_NUMBER',
        }, 400);
    }
    if (!PHONE_NUMBER_REGEX.test(rawPhone)) {
        return res.json({
            success: false,
            error: 'Phone number must be exactly 10 digits and begin with 6, 7, 8, or 9.',
            code: 'INVALID_PHONE_FORMAT',
        }, 400);
    }
    try {
        // 4. Enforce profile immutability lock
        const existingUserProfiles = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
        const existingDoc = existingUserProfiles.total > 0 ? existingUserProfiles.documents[0] : undefined;
        if (existingDoc) {
            const isStaleStub = isIncompleteLockedProfileStub(existingDoc);
            const locks = readProfileLockSummary(existingDoc);
            const alreadyLocked = locks.anyLocked || readStringField(existingDoc, 'profile_status') === 'complete';
            if (!isStaleStub && alreadyLocked) {
                return res.json({
                    success: false,
                    error: 'Your profile is already locked. Name and enrollment number cannot be changed, and phone changes require academic Department Admin approval.',
                    code: 'PROFILE_ALREADY_LOCKED',
                }, 403);
            }
        }
        // 5. Ensure enrollment number is unique across student accounts
        const existingEnrollment = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('enrollment_no', rawEnrollment), Query.limit(1)]);
        if (existingEnrollment.total > 0 &&
            existingEnrollment.documents[0] &&
            readStringField(existingEnrollment.documents[0], 'user_id') !== caller.id) {
            return res.json({
                success: false,
                error: 'This enrollment number is already registered to another student account.',
                code: 'ENROLLMENT_ALREADY_REGISTERED',
            }, 409);
        }
        // 6. Save locked profile document using Day 1/2 schema fields & empty ACL ([])
        const now = new Date().toISOString();
        const dbProfileData = {
            user_id: caller.id,
            auth_user_id: caller.id,
            email: caller.email,
            name: rawName,
            display_name: rawName,
            enrollment_no: rawEnrollment,
            student_department_id: enrollmentResult.departmentId,
            phone_number: rawPhone,
            role: 'student',
            name_locked: true,
            enrollment_locked: true,
            phone_locked: true,
            ...(existingDoc && readBooleanField(existingDoc, 'is_locked') !== undefined
                ? { is_locked: true }
                : {}),
            profile_status: 'complete',
            created_at: existingDoc ? readStringField(existingDoc, 'created_at') || now : now,
            updated_at: now,
        };
        const savedDoc = existingDoc
            ? await databases.updateDocument(config.databaseId, config.profilesCollectionId, existingDoc.$id, dbProfileData)
            : await databases.createDocument(config.databaseId, config.profilesCollectionId, ID.unique(), dbProfileData, []);
        log(`[profile] Successfully onboarded student ${caller.id} for department ${enrollmentResult.departmentId} (code ${enrollmentResult.code})`);
        const profile = buildProfileResponse(savedDoc.$id, {
            ...dbProfileData,
            is_onboarded: true,
            department_id: enrollmentResult.departmentId,
            department_name: enrollmentResult.departmentName || undefined,
        });
        return res.json({
            success: true,
            data: {
                profile,
            },
        }, 200);
    }
    catch (createErr) {
        error(`[profile] Failed to save profile for ${caller.id}: ${String(createErr)}`);
        return res.json({
            success: false,
            error: 'Failed to create student profile. Please try again.',
            code: 'PROFILE_CREATION_FAILED',
        }, 500);
    }
}
/**
 * Lists all 6 active institutional departments with academic and maintenance flags.
 * Queries the database when configured and reconciles against the authoritative 6-department registry.
 */
export async function handleListDepartments(context, deps) {
    const { res, log } = context;
    const config = getAppwriteConfig();
    const canonicalDepartments = INSTITUTIONAL_DEPARTMENTS.map(toDepartmentModel);
    if (deps?.databases || config.apiKey) {
        try {
            const databases = deps?.databases ?? getServerClient().databases;
            const result = await databases.listDocuments(config.databaseId, config.departmentsCollectionId, [Query.limit(50)]);
            if (result.total > 0) {
                const dbById = new Map();
                for (const doc of result.documents) {
                    const resolved = resolveDepartment(doc.$id);
                    const isAcademic = readBooleanField(doc, 'is_academic') ?? resolved?.is_academic ?? false;
                    const isMaintenance = readBooleanField(doc, 'is_maintenance') ?? resolved?.is_maintenance ?? false;
                    const isActive = readBooleanField(doc, 'is_active') ?? resolved?.is_active ?? true;
                    const name = readStringField(doc, 'name') || resolved?.name || doc.$id;
                    const rawCode = readStringField(doc, 'code') || resolved?.code || '';
                    dbById.set(doc.$id, {
                        $id: doc.$id,
                        name,
                        ...(rawCode ? { code: rawCode } : {}),
                        is_academic: isAcademic,
                        is_maintenance: isMaintenance,
                        is_active: isActive,
                    });
                }
                const merged = [];
                const seenCodes = new Set();
                const seenNames = new Set();
                for (const canDept of canonicalDepartments) {
                    const canonicalCode = getCanonicalDepartmentCode(canDept.$id);
                    if (dbById.has(canDept.$id)) {
                        const docDept = dbById.get(canDept.$id);
                        if (docDept.is_active) {
                            const code = docDept.code || canonicalCode || '';
                            const resolvedDept = {
                                ...docDept,
                                ...(code ? { code } : {}),
                            };
                            merged.push(resolvedDept);
                            if (code)
                                seenCodes.add(code.toUpperCase());
                            seenNames.add(resolvedDept.name.toLowerCase().trim());
                        }
                        dbById.delete(canDept.$id);
                    }
                    else {
                        const resolvedDept = {
                            ...canDept,
                            ...(canonicalCode ? { code: canonicalCode } : {}),
                        };
                        merged.push(resolvedDept);
                        if (canonicalCode)
                            seenCodes.add(canonicalCode.toUpperCase());
                        seenNames.add(resolvedDept.name.toLowerCase().trim());
                    }
                }
                for (const customDept of dbById.values()) {
                    if (!customDept.is_active)
                        continue;
                    // Exclude legacy unmigrated documents ('06', '07', '09', '19', 'water', 'sanitation')
                    if (['06', '07', '09', '19', 'water', 'sanitation', 'dept_water', 'dept_sanit'].includes(customDept.$id.toLowerCase())) {
                        continue;
                    }
                    // Exclude if code duplicates a canonical department
                    if (customDept.code && seenCodes.has(customDept.code.toUpperCase())) {
                        continue;
                    }
                    // Exclude if normalized name duplicates a canonical department (e.g. "Civil Department" duplicates "Civil")
                    const normalizedName = customDept.name.toLowerCase().trim();
                    const isDuplicateName = Array.from(seenNames).some((name) => normalizedName === name || normalizedName === `${name} department` || name === `${normalizedName} department`);
                    if (isDuplicateName) {
                        continue;
                    }
                    merged.push(customDept);
                    if (customDept.code)
                        seenCodes.add(customDept.code.toUpperCase());
                    seenNames.add(normalizedName);
                }
                return res.json({
                    success: true,
                    data: {
                        departments: merged,
                    },
                }, 200);
            }
        }
        catch (dbErr) {
            log(`[departments] Falling back to canonical department registry: ${String(dbErr)}`);
        }
    }
    return res.json({
        success: true,
        data: {
            departments: canonicalDepartments,
        },
    }, 200);
}
