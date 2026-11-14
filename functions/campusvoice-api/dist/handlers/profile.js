import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { INSTITUTIONAL_DEPARTMENTS, PHONE_NUMBER_REGEX, STUDENT_NAME_REGEX, extractAndMapEnrollment, isAcademicDepartment, readBooleanField, readStringField, resolveDepartment, toDepartmentModel, } from '../departments.js';
function resolveUserRole(rawRole, callerRole) {
    if (callerRole === 'principal' || rawRole === 'principal') {
        return 'principal';
    }
    if (callerRole === 'department_admin' || rawRole === 'department_admin') {
        return 'department_admin';
    }
    return 'student';
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
        phone_number: fields.phone_number,
        role: fields.role,
        profile_status: fields.profile_status,
        name_locked: fields.name_locked,
        enrollment_locked: fields.enrollment_locked,
        phone_locked: fields.phone_locked,
        is_locked: isLocked,
        ...(fields.department_code ? { department_code: fields.department_code } : {}),
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
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;
    try {
        const listResult = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
        if (listResult.total > 0 && listResult.documents[0]) {
            const doc = listResult.documents[0];
            const effectiveRole = resolveUserRole(readStringField(doc, 'role'), caller.role);
            const isCallerAdmin = effectiveRole === 'department_admin';
            const rawStudentDeptId = readStringField(doc, 'student_department_id');
            const rawLegacyDeptCode = readStringField(doc, 'department_code');
            const resolvedStudentDept = resolveDepartment(rawStudentDeptId || rawLegacyDeptCode);
            const callerDept = caller.department_code ? resolveDepartment(caller.department_code) : null;
            const effectiveStudentDeptId = effectiveRole === 'student' ? (resolvedStudentDept?.id ?? null) : null;
            const effectiveDeptCode = isCallerAdmin
                ? (callerDept?.code ?? caller.department_code ?? undefined)
                : (resolvedStudentDept?.code ?? (rawLegacyDeptCode || undefined));
            const effectiveDeptName = isCallerAdmin
                ? (callerDept?.name ?? caller.department_name ?? '')
                : (resolvedStudentDept?.name ?? readStringField(doc, 'department_name'));
            const legacyLocked = readBooleanField(doc, 'is_locked');
            const nameLocked = readBooleanField(doc, 'name_locked') ?? Boolean(legacyLocked);
            const enrollmentLocked = readBooleanField(doc, 'enrollment_locked') ?? Boolean(legacyLocked);
            const phoneNumber = readStringField(doc, 'phone_number').trim();
            const phoneLocked = readBooleanField(doc, 'phone_locked') ??
                Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));
            const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
            const hasValidStudentOnboarding = Boolean(nameLocked &&
                enrollmentLocked &&
                phoneLocked &&
                enrollmentNo.length === 12 &&
                effectiveStudentDeptId &&
                PHONE_NUMBER_REGEX.test(phoneNumber));
            const isOnboarded = effectiveRole === 'department_admin' || effectiveRole === 'principal'
                ? true
                : hasValidStudentOnboarding;
            const rawStatus = readStringField(doc, 'profile_status');
            const profileStatus = rawStatus === 'pending_verification' ||
                rawStatus === 'rejected' ||
                rawStatus === 'complete' ||
                rawStatus === 'incomplete'
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
                phone_number: phoneNumber,
                role: effectiveRole,
                profile_status: profileStatus,
                name_locked: nameLocked,
                enrollment_locked: enrollmentLocked,
                phone_locked: phoneLocked,
                department_code: effectiveDeptCode,
                department_name: effectiveDeptName,
                created_at: readStringField(doc, 'created_at') || doc.$createdAt,
                updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
            });
            if (isCallerAdmin && readStringField(doc, 'role') !== 'department_admin') {
                try {
                    await databases.updateDocument(config.databaseId, config.profilesCollectionId, doc.$id, {
                        role: 'department_admin',
                        updated_at: new Date().toISOString(),
                    });
                    log(`[profile] Synchronized existing document ${doc.$id} to department_admin`);
                }
                catch (syncErr) {
                    log(`[profile] Notice: Could not sync admin role to existing doc: ${String(syncErr)}`);
                }
            }
            return res.json({
                success: true,
                data: {
                    profile,
                    is_onboarded: isOnboarded,
                },
            }, 200);
        }
        if (caller.role === 'department_admin' && caller.department_code) {
            log(`[profile] Auto-provisioning admin profile for ${caller.email}`);
            const now = new Date().toISOString();
            const dept = resolveDepartment(caller.department_code);
            const dbAdminPayload = {
                user_id: caller.id,
                auth_user_id: caller.id,
                email: caller.email,
                name: caller.name || 'Department Administrator',
                display_name: caller.name || 'Department Administrator',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'department_admin',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                created_at: now,
                updated_at: now,
            };
            try {
                const createdDoc = await databases.createDocument(config.databaseId, config.profilesCollectionId, ID.unique(), dbAdminPayload, []);
                const adminProfile = buildProfileResponse(createdDoc.$id, {
                    ...dbAdminPayload,
                    department_code: dept?.code ?? caller.department_code ?? undefined,
                    department_name: dept?.name ?? caller.department_name ?? '',
                });
                return res.json({
                    success: true,
                    data: {
                        profile: adminProfile,
                        is_onboarded: true,
                    },
                }, 200);
            }
            catch (adminCreateErr) {
                log(`[profile] Could not auto-create admin doc in DB, returning computed admin profile: ${String(adminCreateErr)}`);
                const computedProfile = buildProfileResponse(undefined, {
                    ...dbAdminPayload,
                    department_code: dept?.code ?? caller.department_code ?? undefined,
                    department_name: dept?.name ?? caller.department_name ?? '',
                });
                return res.json({
                    success: true,
                    data: {
                        profile: computedProfile,
                        is_onboarded: true,
                    },
                }, 200);
            }
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
            const alreadyLocked = Boolean(readBooleanField(existingDoc, 'name_locked')) ||
                Boolean(readBooleanField(existingDoc, 'enrollment_locked')) ||
                Boolean(readBooleanField(existingDoc, 'phone_locked')) ||
                Boolean(readBooleanField(existingDoc, 'is_locked')) ||
                readStringField(existingDoc, 'profile_status') === 'complete';
            if (alreadyLocked) {
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
            department_code: enrollmentResult.code || undefined,
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
                    const resolved = resolveDepartment(readStringField(doc, 'code') || doc.$id || readStringField(doc, 'name'));
                    if (!resolved) {
                        continue;
                    }
                    const isAcademic = readBooleanField(doc, 'is_academic');
                    const isMaintenance = readBooleanField(doc, 'is_maintenance');
                    const isActive = readBooleanField(doc, 'is_active');
                    dbById.set(resolved.id, {
                        $id: resolved.id,
                        code: resolved.code,
                        name: readStringField(doc, 'name') || resolved.name,
                        is_academic: isAcademic ?? resolved.is_academic,
                        is_maintenance: isMaintenance ?? resolved.is_maintenance,
                        is_active: isActive ?? resolved.is_active,
                    });
                }
                const merged = canonicalDepartments.map((dept) => dept.$id ? dbById.get(dept.$id) ?? dept : dept);
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
