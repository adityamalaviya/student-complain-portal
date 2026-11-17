import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { INSTITUTIONAL_DEPARTMENTS, PHONE_NUMBER_REGEX, STUDENT_NAME_REGEX, extractAndMapEnrollment, isAcademicDepartment, readBooleanField, readStringField, resolveDepartment, resolveLegacyDepartmentCode, toDepartmentModel, } from '../departments.js';
function resolveUserRole(callerRole) {
    if (callerRole === 'principal') {
        return 'principal';
    }
    if (callerRole === 'department_admin') {
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
        ...(fields.department_id ? { department_id: fields.department_id } : {}),
        phone_number: fields.phone_number,
        role: fields.role,
        profile_status: fields.profile_status,
        name_locked: fields.name_locked,
        enrollment_locked: fields.enrollment_locked,
        phone_locked: fields.phone_locked,
        is_locked: isLocked,
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
        // 1. After authenticating caller, ALWAYS query department_admins:
        // - Query where user_id === caller.id AND is_active === true
        // - If not found: query where email === caller.email AND is_active === true
        const adminColIds = Array.from(new Set([config.departmentAdminsCollectionId, 'department_admins'].filter(Boolean)));
        let adminAssignment = null;
        for (const colId of adminColIds) {
            try {
                let userResult;
                try {
                    userResult = await databases.listDocuments(config.databaseId, colId, [
                        Query.equal('user_id', caller.id),
                        Query.equal('is_active', true),
                        Query.limit(1),
                    ]);
                }
                catch {
                    userResult = await databases.listDocuments(config.databaseId, colId, [
                        Query.equal('user_id', caller.id),
                        Query.limit(20),
                    ]);
                    userResult = {
                        ...userResult,
                        documents: userResult.documents.filter((d) => readBooleanField(d, 'is_active') === true),
                    };
                    userResult.total = userResult.documents.length;
                }
                if (userResult.total > 0 && userResult.documents[0]) {
                    adminAssignment = userResult.documents[0];
                    break;
                }
                if (caller.email) {
                    const emailVariants = Array.from(new Set([caller.email, caller.email.trim().toLowerCase(), caller.email.trim()])).filter(Boolean);
                    for (const emailVal of emailVariants) {
                        let emailResult;
                        try {
                            emailResult = await databases.listDocuments(config.databaseId, colId, [
                                Query.equal('email', emailVal),
                                Query.equal('is_active', true),
                                Query.limit(1),
                            ]);
                        }
                        catch {
                            emailResult = await databases.listDocuments(config.databaseId, colId, [
                                Query.equal('email', emailVal),
                                Query.limit(20),
                            ]);
                            emailResult = {
                                ...emailResult,
                                documents: emailResult.documents.filter((d) => readBooleanField(d, 'is_active') === true),
                            };
                            emailResult.total = emailResult.documents.length;
                        }
                        if (emailResult.total > 0 && emailResult.documents[0]) {
                            adminAssignment = emailResult.documents[0];
                            break;
                        }
                    }
                    if (adminAssignment) {
                        break;
                    }
                }
            }
            catch (err) {
                log(`[profile] Notice: query on ${colId} failed: ${String(err)}`);
            }
        }
        if (!adminAssignment &&
            Array.isArray(caller.admin_assignments) &&
            caller.admin_assignments.length > 0) {
            const active = caller.admin_assignments.find((a) => a.is_active === true);
            if (active) {
                adminAssignment = active;
            }
        }
        const rawAssignmentDeptId = adminAssignment
            ? typeof adminAssignment.department_id === 'string' && adminAssignment.department_id.trim()
                ? adminAssignment.department_id.trim()
                : readStringField(adminAssignment, 'department_id').trim() || null
            : null;
        const resolvedDept = rawAssignmentDeptId ? resolveDepartment(rawAssignmentDeptId) : null;
        const assignmentDeptId = resolvedDept
            ? resolvedDept.id
            : rawAssignmentDeptId;
        const assignmentDeptName = adminAssignment
            ? typeof adminAssignment.department_name === 'string' && adminAssignment.department_name.trim()
                ? adminAssignment.department_name.trim()
                : readStringField(adminAssignment, 'department_name').trim() ||
                    (resolvedDept ? resolvedDept.name : null)
            : null;
        const assignmentAcademicDeptId = adminAssignment
            ? typeof adminAssignment.academic_department_id === 'string' &&
                adminAssignment.academic_department_id.trim()
                ? adminAssignment.academic_department_id.trim()
                : readStringField(adminAssignment, 'academic_department_id').trim() ||
                    (resolvedDept && resolvedDept.is_academic ? resolvedDept.id : null)
            : null;
        const assignmentMaintenanceDeptId = adminAssignment
            ? typeof adminAssignment.maintenance_department_id === 'string' &&
                adminAssignment.maintenance_department_id.trim()
                ? adminAssignment.maintenance_department_id.trim()
                : readStringField(adminAssignment, 'maintenance_department_id').trim() ||
                    (resolvedDept && resolvedDept.is_maintenance ? resolvedDept.id : null)
            : null;
        const assignment = {
            department_id: assignmentDeptId,
            department_name: assignmentDeptName,
            academic_department_id: assignmentAcademicDeptId,
            maintenance_department_id: assignmentMaintenanceDeptId,
            is_active: true,
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
        const isPrincipal = !adminAssignment &&
            caller.role === 'principal' &&
            (doc ? rawDocRole === 'principal' || readBooleanField(doc, 'is_principal') === true : true);
        const isCallerAdmin = Boolean(adminAssignment);
        const effectiveRole = isCallerAdmin
            ? 'department_admin'
            : isPrincipal
                ? 'principal'
                : 'student';
        // Logs for traceability:
        console.log('[get-profile] caller email:', caller.email);
        console.log('[get-profile] admin assignment found:', !!adminAssignment);
        console.log('[get-profile] effective role:', effectiveRole);
        // 3. If profile document exists:
        if (doc) {
            const isStaleAdminRole = effectiveRole === 'student' && rawDocRole === 'department_admin';
            const legacyLocked = readBooleanField(doc, 'is_locked');
            const rawNameLocked = readBooleanField(doc, 'name_locked') ?? Boolean(legacyLocked);
            const rawEnrollmentLocked = readBooleanField(doc, 'enrollment_locked') ?? Boolean(legacyLocked);
            const phoneNumber = readStringField(doc, 'phone_number').trim();
            const rawPhoneLocked = readBooleanField(doc, 'phone_locked') ??
                Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));
            const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
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
            const hasValidStudentOnboarding = Boolean(rawNameLocked &&
                rawEnrollmentLocked &&
                rawPhoneLocked &&
                enrollmentNo.length === 12 &&
                effectiveStudentDeptId &&
                PHONE_NUMBER_REGEX.test(phoneNumber));
            // Sync updated role / status back to database if needed
            if (isStaleAdminRole) {
                try {
                    await databases.updateDocument(config.databaseId, config.profilesCollectionId, doc.$id, {
                        role: 'student',
                        ...(!hasValidStudentOnboarding
                            ? {
                                name_locked: false,
                                enrollment_locked: false,
                                phone_locked: false,
                                profile_status: 'incomplete',
                            }
                            : {}),
                        updated_at: new Date().toISOString(),
                    });
                    log(`[profile] Downgraded stale department_admin role on profile ${doc.$id} to student`);
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
                : isStaleAdminRole && !hasValidStudentOnboarding
                    ? false
                    : rawNameLocked;
            const enrollmentLocked = isCallerAdmin || isPrincipal
                ? true
                : isStaleAdminRole && !hasValidStudentOnboarding
                    ? false
                    : rawEnrollmentLocked;
            const phoneLocked = isCallerAdmin || isPrincipal
                ? true
                : isStaleAdminRole && !hasValidStudentOnboarding
                    ? false
                    : rawPhoneLocked;
            // is_onboarded: true for admin / principal, check fields for student
            const isOnboarded = isCallerAdmin || isPrincipal ? true : hasValidStudentOnboarding;
            const rawStatus = readStringField(doc, 'profile_status');
            const profileStatus = isCallerAdmin || isPrincipal
                ? rawStatus === 'pending_verification' || rawStatus === 'rejected'
                    ? rawStatus
                    : 'complete'
                : isStaleAdminRole && !hasValidStudentOnboarding
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
            const newPrincipalProfileData = {
                $id: caller.id,
                user_id: caller.id,
                auth_user_id: caller.id,
                email: caller.email,
                name: caller.name,
                role: 'principal',
                is_active: true,
                is_locked: true,
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                created_at: new Date().toISOString(),
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
                        created_at: newPrincipalProfileData.created_at,
                        updated_at: newPrincipalProfileData.created_at,
                    }),
                    is_onboarded: true,
                },
            }, 200);
        }
        if (effectiveRole === 'department_admin') {
            const newProfileData = {
                $id: caller.id,
                user_id: caller.id,
                auth_user_id: caller.id,
                email: caller.email,
                role: 'department_admin',
                department_id: assignment.department_id,
                department_name: assignment.department_name,
                academic_department_id: assignment.academic_department_id,
                maintenance_department_id: assignment.maintenance_department_id,
                is_active: true,
                is_locked: true,
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                created_at: new Date().toISOString(),
            };
            console.log('[get-profile] creating admin profile for:', caller.id);
            let adminProfile = null;
            try {
                adminProfile = await databases.createDocument(config.databaseId, config.profilesCollectionId, caller.id, newProfileData);
                console.log('[get-profile] admin profile created successfully');
            }
            catch (createErr) {
                log(`[profile] Notice: admin profile creation failed: ${String(createErr)}`);
                let createdOnRetry = false;
                try {
                    const { $id: _omittedId, ...dataWithoutId } = newProfileData;
                    adminProfile = await databases.createDocument(config.databaseId, config.profilesCollectionId, caller.id, dataWithoutId);
                    createdOnRetry = true;
                    console.log('[get-profile] admin profile created successfully');
                }
                catch {
                    // creation failed or document already exists
                }
                if (!createdOnRetry) {
                    try {
                        if (typeof databases.getDocument === 'function') {
                            adminProfile = await databases.getDocument(config.databaseId, config.profilesCollectionId, caller.id);
                        }
                        else {
                            const fetchRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
                            if (fetchRes.total > 0 && fetchRes.documents[0]) {
                                adminProfile = fetchRes.documents[0];
                            }
                        }
                    }
                    catch (fetchErr) {
                        log(`[profile] Notice: getDocument failed, falling back to listDocuments: ${String(fetchErr)}`);
                        try {
                            const fetchRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', caller.id), Query.limit(1)]);
                            if (fetchRes.total > 0 && fetchRes.documents[0]) {
                                adminProfile = fetchRes.documents[0];
                            }
                        }
                        catch {
                            // ignore fallback fetch error
                        }
                    }
                }
            }
            const returnedProfile = {
                ...(typeof adminProfile === 'object' && adminProfile !== null ? adminProfile : newProfileData),
                $id: adminProfile?.$id || caller.id,
                role: 'department_admin',
            };
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
            const isStaleAdminStub = readStringField(existingDoc, 'role') === 'department_admin' &&
                !readStringField(existingDoc, 'enrollment_no').trim() &&
                !readStringField(existingDoc, 'phone_number').trim();
            const alreadyLocked = Boolean(readBooleanField(existingDoc, 'name_locked')) ||
                Boolean(readBooleanField(existingDoc, 'enrollment_locked')) ||
                Boolean(readBooleanField(existingDoc, 'phone_locked')) ||
                Boolean(readBooleanField(existingDoc, 'is_locked')) ||
                readStringField(existingDoc, 'profile_status') === 'complete';
            if (!isStaleAdminStub && alreadyLocked) {
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
                    if (!resolved) {
                        continue;
                    }
                    const isAcademic = readBooleanField(doc, 'is_academic');
                    const isMaintenance = readBooleanField(doc, 'is_maintenance');
                    const isActive = readBooleanField(doc, 'is_active');
                    dbById.set(resolved.id, {
                        $id: resolved.id,
                        name: readStringField(doc, 'name') || resolved.name,
                        is_academic: isAcademic ?? resolved.is_academic,
                        is_maintenance: isMaintenance ?? resolved.is_maintenance,
                        is_active: isActive ?? resolved.is_active,
                    });
                }
                const merged = canonicalDepartments.map((dept) => dbById.get(dept.$id) ?? dept);
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
