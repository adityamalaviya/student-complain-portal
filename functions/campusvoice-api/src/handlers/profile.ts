import { ID, Query, type Models } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import {
  INSTITUTIONAL_DEPARTMENTS,
  PHONE_NUMBER_REGEX,
  STUDENT_NAME_REGEX,
  extractAndMapEnrollment,
  isAcademicDepartment,
  readBooleanField,
  readStringField,
  resolveDepartment,
  resolveLegacyDepartmentCode,
  toDepartmentModel,
  type DatabaseClientLike,
} from '../departments.js';
import type {
  AcademicDepartmentId,
  AppwriteContext,
  AuthenticatedCaller,
  Department,
  DepartmentId,
  ProfileStatus,
  UserProfile,
  UserRole,
} from '../types.js';

export interface ProfileHandlerDeps {
  databases?: DatabaseClientLike;
}

function resolveUserRole(callerRole: UserRole): UserRole {
  if (callerRole === 'principal') {
    return 'principal';
  }
  if (callerRole === 'department_admin') {
    return 'department_admin';
  }
  return 'student';
}

function buildProfileResponse(
  docId: string | undefined,
  fields: {
    user_id: string;
    auth_user_id: string;
    email: string;
    name: string;
    display_name: string;
    enrollment_no: string;
    student_department_id: AcademicDepartmentId | null;
    department_id?: DepartmentId | null;
    phone_number: string;
    role: UserRole;
    profile_status: ProfileStatus;
    name_locked: boolean;
    enrollment_locked: boolean;
    phone_locked: boolean;
    department_name?: string;
    created_at: string;
    updated_at: string;
  }
): UserProfile {
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
export async function handleGetProfile(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  deps?: ProfileHandlerDeps
): Promise<unknown> {
  const { res, log, error } = context;
  try {
    const config = getAppwriteConfig();
    const databases = deps?.databases ?? getServerClient().databases;

    const listResult = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('user_id', caller.id), Query.limit(1)]
    );

    // 1. Check if user has an active assignment in department_admin_assignments (or equivalent collection)
    const adminColId = config.departmentAdminsCollectionId || '6af876910029effa1c9c';
    let hasActiveAdminAssignment = false;
    let adminAssignmentDeptId: DepartmentId | null = null;
    let adminAssignmentDeptName: string = '';

    try {
      const adminRes = await databases.listDocuments(
        config.databaseId,
        adminColId,
        [Query.equal('user_id', caller.id), Query.limit(100)]
      );

      let candidateDocs = adminRes.documents;
      if (candidateDocs.length === 0 && caller.email) {
        try {
          const emailRes = await databases.listDocuments(
            config.databaseId,
            adminColId,
            [Query.equal('email', caller.email.trim().toLowerCase()), Query.limit(100)]
          );
          if (emailRes.total > 0) {
            candidateDocs = emailRes.documents;
          }
        } catch {
          // ignore email query fallback error
        }
      }

      for (const aDoc of candidateDocs) {
        if (readBooleanField(aDoc, 'is_active') === true) {
          hasActiveAdminAssignment = true;
          const dept = resolveDepartment(readStringField(aDoc, 'department_id'));
          if (dept) {
            adminAssignmentDeptId = dept.id;
            adminAssignmentDeptName = dept.name;
          }
          break;
        }
      }
    } catch (adminErr) {
      log(`[profile] Notice: query on ${adminColId} failed: ${String(adminErr)}`);
      if (adminColId !== 'department_admin_assignments') {
        try {
          const fallbackRes = await databases.listDocuments(
            config.databaseId,
            'department_admin_assignments',
            [Query.equal('user_id', caller.id), Query.limit(100)]
          );
          for (const aDoc of fallbackRes.documents) {
            if (readBooleanField(aDoc, 'is_active') === true) {
              hasActiveAdminAssignment = true;
              const dept = resolveDepartment(readStringField(aDoc, 'department_id'));
              if (dept) {
                adminAssignmentDeptId = dept.id;
                adminAssignmentDeptName = dept.name;
              }
              break;
            }
          }
        } catch {
          // ignore fallback error
        }
      }
    }

    if (
      !hasActiveAdminAssignment &&
      Array.isArray(caller.admin_assignments) &&
      caller.admin_assignments.length > 0
    ) {
      const active = caller.admin_assignments.find((a) => a.is_active === true);
      if (active) {
        hasActiveAdminAssignment = true;
        const dept = resolveDepartment(active.department_id);
        if (dept) {
          adminAssignmentDeptId = dept.id;
          adminAssignmentDeptName = dept.name;
        }
      }
    }

    if (listResult.total > 0 && listResult.documents[0]) {
      const doc = listResult.documents[0];
      const storedProfile = doc;
      const rawDocRole = readStringField(doc, 'role');
      if (!storedProfile.role && rawDocRole) {
        (storedProfile as any).role = rawDocRole;
      }
      const storedRole = (storedProfile?.role || rawDocRole || undefined) as UserRole | undefined;

      if (caller.role === 'principal' && rawDocRole !== 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Role mismatch.',
            code: 'FORBIDDEN',
          },
          403
        );
      }

      // Check principal role via flag or record
      const isPrincipal =
        caller.role === 'principal' ||
        storedRole === 'principal' ||
        rawDocRole === 'principal' ||
        readBooleanField(doc, 'is_principal') === true;

      // 2 & 3. Derive role with strict preservation of stored admin roles:
      // effectiveRole = storedProfile.role || derivedRole
      // If stored profile document has role: 'department_admin' OR role: 'principal' — NEVER overwrite it with 'student'.
      // Only set role: 'student' if stored role is null, undefined, or already 'student'.
      let derivedRole: UserRole = resolveUserRole(caller.role);
      if (isPrincipal) {
        derivedRole = 'principal';
      } else if (hasActiveAdminAssignment || caller.role === 'department_admin') {
        derivedRole = 'department_admin';
      } else {
        derivedRole = 'student';
      }

      let effectiveRole: UserRole;
      if (storedProfile?.role === 'department_admin' || storedProfile?.role === 'principal') {
        effectiveRole = storedProfile.role;
      } else if (rawDocRole === 'department_admin' || rawDocRole === 'principal') {
        effectiveRole = rawDocRole as UserRole;
      } else if (derivedRole === 'department_admin' || derivedRole === 'principal') {
        effectiveRole = derivedRole;
      } else {
        // Only set role: 'student' if stored role is null, undefined, or already 'student'
        effectiveRole = 'student';
      }

      console.log('[get-profile] stored role:', storedProfile?.role);
      console.log('[get-profile] effective role:', effectiveRole);

      const isCallerAdmin = effectiveRole === 'department_admin';

      const legacyLocked = readBooleanField(doc, 'is_locked');
      const rawNameLocked = readBooleanField(doc, 'name_locked') ?? Boolean(legacyLocked);
      const rawEnrollmentLocked =
        readBooleanField(doc, 'enrollment_locked') ?? Boolean(legacyLocked);
      const phoneNumber = readStringField(doc, 'phone_number').trim();
      const rawPhoneLocked =
        readBooleanField(doc, 'phone_locked') ??
        Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));
      const enrollmentNo = readStringField(doc, 'enrollment_no').trim();

      const rawStudentDeptId = readStringField(doc, 'student_department_id');
      const rawLegacyDeptCode = readStringField(doc, 'department_code');
      const resolvedStudentDept =
        resolveDepartment(rawStudentDeptId) ||
        (!rawStudentDeptId && enrollmentNo.length === 12
          ? resolveLegacyDepartmentCode(rawLegacyDeptCode)
          : null);
      const callerDept = caller.department_id ? resolveDepartment(caller.department_id) : null;

      const effectiveStudentDeptId: AcademicDepartmentId | null =
        effectiveRole === 'student' &&
        resolvedStudentDept &&
        resolvedStudentDept.is_academic &&
        resolvedStudentDept.is_active
          ? (resolvedStudentDept.id as AcademicDepartmentId)
          : null;

      const rawDocDeptId = readStringField(doc, 'department_id');
      const resolvedStoredDept = resolveDepartment(rawDocDeptId) || resolveDepartment(rawStudentDeptId);
      const effectiveDeptId: DepartmentId | null = isCallerAdmin
        ? (adminAssignmentDeptId ?? callerDept?.id ?? caller.department_id ?? resolvedStoredDept?.id ?? (rawDocDeptId ? (rawDocDeptId as DepartmentId) : null))
        : effectiveStudentDeptId;
      const effectiveDeptName = isCallerAdmin
        ? (adminAssignmentDeptName || callerDept?.name || caller.department_name || resolvedStoredDept?.name || readStringField(doc, 'department_name') || '')
        : effectiveStudentDeptId && resolvedStudentDept
        ? resolvedStudentDept.name
        : '';

      const hasValidStudentOnboarding = Boolean(
        rawNameLocked &&
          rawEnrollmentLocked &&
          rawPhoneLocked &&
          enrollmentNo.length === 12 &&
          effectiveStudentDeptId &&
          PHONE_NUMBER_REGEX.test(phoneNumber)
      );

      const nameLocked = rawNameLocked;
      const enrollmentLocked = rawEnrollmentLocked;
      const phoneLocked = rawPhoneLocked;

      const isOnboarded =
        effectiveRole === 'department_admin' || effectiveRole === 'principal'
          ? true
          : hasValidStudentOnboarding;

      const rawStatus = readStringField(doc, 'profile_status');
      // Incomplete onboarding applies only to students, not admins.
      // If profile_status is 'incomplete', the code must NOT reset role to student.
      const profileStatus: ProfileStatus =
        effectiveRole === 'department_admin' || effectiveRole === 'principal'
          ? rawStatus === 'pending_verification' || rawStatus === 'rejected'
            ? rawStatus
            : 'complete'
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
        display_name:
          readStringField(doc, 'display_name') || readStringField(doc, 'name') || caller.name,
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

      if (isCallerAdmin && rawDocRole !== 'department_admin' && rawDocRole !== 'principal') {
        try {
          await databases.updateDocument(
            config.databaseId,
            config.profilesCollectionId,
            doc.$id,
            {
              role: 'department_admin',
              updated_at: new Date().toISOString(),
            }
          );
          log(`[profile] Synchronized existing document ${doc.$id} to department_admin`);
        } catch (syncErr) {
          log(`[profile] Notice: Could not sync admin role to existing doc: ${String(syncErr)}`);
        }
      }

      return res.json(
        {
          success: true,
          data: {
            profile,
            is_onboarded: isOnboarded,
          },
        },
        200
      );
    }

    if (caller.role === 'principal') {
      return res.json(
        {
          success: false,
          error: 'Forbidden: Principal profile is required.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    console.log('[get-profile] no profile document, checking department_admins for:', caller.id, caller.email);

    const adminColIds = Array.from(
      new Set(
        [config.departmentAdminsCollectionId, '6af876910029effa1c9c', 'department_admins'].filter(
          Boolean
        ) as string[]
      )
    );

    let activeAdminDoc: Models.Document | null = null;

    for (const colId of adminColIds) {
      try {
        // a) Query where user_id === caller.id AND is_active === true
        let userResult;
        try {
          userResult = await databases.listDocuments(config.databaseId, colId, [
            Query.equal('user_id', caller.id),
            Query.equal('is_active', true),
            Query.limit(1),
          ]);
        } catch {
          userResult = await databases.listDocuments(config.databaseId, colId, [
            Query.equal('user_id', caller.id),
            Query.limit(20),
          ]);
          userResult = {
            ...userResult,
            documents: userResult.documents.filter(
              (d) => readBooleanField(d, 'is_active') === true
            ),
          };
          userResult.total = userResult.documents.length;
        }

        if (userResult.total > 0 && userResult.documents[0]) {
          activeAdminDoc = userResult.documents[0];
          break;
        }

        // b) If no result: query where email === caller.email AND is_active === true
        if (caller.email) {
          const emailVariants = Array.from(
            new Set([caller.email, caller.email.trim().toLowerCase(), caller.email.trim()])
          ).filter(Boolean);

          for (const emailVal of emailVariants) {
            let emailResult;
            try {
              emailResult = await databases.listDocuments(config.databaseId, colId, [
                Query.equal('email', emailVal),
                Query.equal('is_active', true),
                Query.limit(1),
              ]);
            } catch {
              emailResult = await databases.listDocuments(config.databaseId, colId, [
                Query.equal('email', emailVal),
                Query.limit(20),
              ]);
              emailResult = {
                ...emailResult,
                documents: emailResult.documents.filter(
                  (d) => readBooleanField(d, 'is_active') === true
                ),
              };
              emailResult.total = emailResult.documents.length;
            }

            if (emailResult.total > 0 && emailResult.documents[0]) {
              activeAdminDoc = emailResult.documents[0];
              break;
            }
          }

          if (activeAdminDoc) {
            break;
          }
        }
      } catch (err) {
        log(`[profile] Notice: query on ${colId} failed: ${String(err)}`);
      }
    }

    if (activeAdminDoc) {
      const assignmentDeptId =
        typeof activeAdminDoc.department_id === 'string' && activeAdminDoc.department_id.trim()
          ? activeAdminDoc.department_id.trim()
          : readStringField(activeAdminDoc, 'department_id').trim() || null;

      const resolvedDept = assignmentDeptId ? resolveDepartment(assignmentDeptId) : null;

      const assignmentDeptName =
        typeof activeAdminDoc.department_name === 'string' && activeAdminDoc.department_name.trim()
          ? activeAdminDoc.department_name.trim()
          : readStringField(activeAdminDoc, 'department_name').trim() ||
            (resolvedDept ? resolvedDept.name : null);

      const assignmentAcademicDeptId =
        typeof activeAdminDoc.academic_department_id === 'string' &&
        activeAdminDoc.academic_department_id.trim()
          ? activeAdminDoc.academic_department_id.trim()
          : readStringField(activeAdminDoc, 'academic_department_id').trim() ||
            (resolvedDept && resolvedDept.is_academic ? resolvedDept.id : null);

      const assignmentMaintenanceDeptId =
        typeof activeAdminDoc.maintenance_department_id === 'string' &&
        activeAdminDoc.maintenance_department_id.trim()
          ? activeAdminDoc.maintenance_department_id.trim()
          : readStringField(activeAdminDoc, 'maintenance_department_id').trim() ||
            (resolvedDept && resolvedDept.is_maintenance ? resolvedDept.id : null);

      const assignment = {
        department_id: assignmentDeptId,
        department_name: assignmentDeptName,
        academic_department_id: assignmentAcademicDeptId,
        maintenance_department_id: assignmentMaintenanceDeptId,
        is_active: true,
      };

      const newProfileData = {
        $id: caller.id,
        user_id: caller.id,
        auth_user_id: caller.id,
        email: caller.email,
        role: 'department_admin' as const,
        department_id: assignment.department_id,
        department_name: assignment.department_name,
        academic_department_id: assignment.academic_department_id || assignment.department_id,
        maintenance_department_id: assignment.maintenance_department_id || assignment.department_id,
        is_active: true,
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
        is_locked: true,
        created_at: new Date().toISOString(),
      };

      console.log('[get-profile] creating admin profile for:', caller.id);

      let adminProfile: unknown = null;
      try {
        adminProfile = await databases.createDocument(
          config.databaseId,
          config.profilesCollectionId,
          caller.id,
          newProfileData
        );
        console.log('[get-profile] admin profile created successfully');
      } catch (createErr) {
        log(`[profile] Notice: admin profile creation failed: ${String(createErr)}`);
        let createdOnRetry = false;
        try {
          const { $id: _omittedId, ...dataWithoutId } = newProfileData;
          adminProfile = await databases.createDocument(
            config.databaseId,
            config.profilesCollectionId,
            caller.id,
            dataWithoutId
          );
          createdOnRetry = true;
          console.log('[get-profile] admin profile created successfully');
        } catch {
          // creation failed or document already exists
        }

        if (!createdOnRetry) {
          try {
            if (typeof (databases as any).getDocument === 'function') {
              adminProfile = await (databases as any).getDocument(
                config.databaseId,
                config.profilesCollectionId,
                caller.id
              );
            } else {
              const fetchRes = await databases.listDocuments(
                config.databaseId,
                config.profilesCollectionId,
                [Query.equal('user_id', caller.id), Query.limit(1)]
              );
              if (fetchRes.total > 0 && fetchRes.documents[0]) {
                adminProfile = fetchRes.documents[0];
              }
            }
          } catch (fetchErr) {
            log(`[profile] Notice: getDocument failed, falling back to listDocuments: ${String(fetchErr)}`);
            try {
              const fetchRes = await databases.listDocuments(
                config.databaseId,
                config.profilesCollectionId,
                [Query.equal('user_id', caller.id), Query.limit(1)]
              );
              if (fetchRes.total > 0 && fetchRes.documents[0]) {
                adminProfile = fetchRes.documents[0];
              }
            } catch {
              // ignore fallback fetch error
            }
          }
        }
      }

      const returnedProfile = {
        ...(typeof adminProfile === 'object' && adminProfile !== null ? adminProfile : newProfileData),
        $id: (adminProfile as any)?.$id || caller.id,
        role: 'department_admin',
      };

      return res.json(
        {
          success: true,
          data: {
            profile: returnedProfile,
            is_onboarded: true,
          },
        },
        200
      );
    }

    return res.json(
      {
        success: true,
        data: {
          profile: null,
          is_onboarded: false,
        },
      },
      200
    );
  } catch (err) {
    error(`[profile] get-profile query error: ${String(err)}`);
    return res.json(
      {
        success: false,
        error: 'Unable to retrieve user profile.',
        code: 'PROFILE_FETCH_FAILED',
      },
      500
    );
  }
}

/**
 * Completes first-time student onboarding: validates name, enrollment [7:9] mapping,
 * and 10-digit Indian mobile number, derives student_department_id server-side,
 * and permanently locks all three fields.
 */
export async function handleCompleteOnboarding(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  payload: Record<string, unknown>,
  deps?: ProfileHandlerDeps
): Promise<unknown> {
  const { res, log, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  if (caller.role === 'department_admin' || caller.role === 'principal') {
    return res.json(
      {
        success: false,
        error: 'Administrative accounts do not require student profile onboarding.',
        code: 'ADMIN_ONBOARDING_NOT_REQUIRED',
      },
      400
    );
  }

  // 1. Validate student name
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (rawName.length < 2 || rawName.length > 100 || !STUDENT_NAME_REGEX.test(rawName)) {
    return res.json(
      {
        success: false,
        error: 'Student name must be between 2 and 100 valid characters.',
        code: 'INVALID_NAME',
      },
      400
    );
  }

  // 2. Validate enrollment number and derive academic department via slice [7:9]
  const rawEnrollment =
    typeof payload.enrollment_no === 'string' ? payload.enrollment_no.trim() : '';
  if (!/^\d{12}$/.test(rawEnrollment)) {
    return res.json(
      {
        success: false,
        error: 'Enrollment number must be exactly 12 numeric digits.',
        code: 'INVALID_ENROLLMENT_FORMAT',
      },
      400
    );
  }

  const enrollmentResult = extractAndMapEnrollment(rawEnrollment);
  if (
    !enrollmentResult.isValid ||
    !enrollmentResult.departmentId ||
    !isAcademicDepartment(enrollmentResult.departmentId)
  ) {
    return res.json(
      {
        success: false,
        error:
          enrollmentResult.error ||
          'Unmapped enrollment department code. Department mappings must be confirmed before registration.',
        code: 'INVALID_DEPARTMENT_CODE',
      },
      400
    );
  }

  // 3. Validate 10-digit phone number starting with 6, 7, 8, or 9
  const rawPhone =
    typeof payload.phone_number === 'string' ? payload.phone_number.trim() : '';
  if (!rawPhone) {
    return res.json(
      {
        success: false,
        error: 'Phone number is required.',
        code: 'MISSING_PHONE_NUMBER',
      },
      400
    );
  }

  if (!PHONE_NUMBER_REGEX.test(rawPhone)) {
    return res.json(
      {
        success: false,
        error: 'Phone number must be exactly 10 digits and begin with 6, 7, 8, or 9.',
        code: 'INVALID_PHONE_FORMAT',
      },
      400
    );
  }

  try {
    // 4. Enforce profile immutability lock
    const existingUserProfiles = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('user_id', caller.id), Query.limit(1)]
    );

    const existingDoc =
      existingUserProfiles.total > 0 ? existingUserProfiles.documents[0] : undefined;

    if (existingDoc) {
      const isStaleAdminStub =
        readStringField(existingDoc, 'role') === 'department_admin' &&
        !readStringField(existingDoc, 'enrollment_no').trim() &&
        !readStringField(existingDoc, 'phone_number').trim();

      const alreadyLocked =
        Boolean(readBooleanField(existingDoc, 'name_locked')) ||
        Boolean(readBooleanField(existingDoc, 'enrollment_locked')) ||
        Boolean(readBooleanField(existingDoc, 'phone_locked')) ||
        Boolean(readBooleanField(existingDoc, 'is_locked')) ||
        readStringField(existingDoc, 'profile_status') === 'complete';

      if (!isStaleAdminStub && alreadyLocked) {
        return res.json(
          {
            success: false,
            error:
              'Your profile is already locked. Name and enrollment number cannot be changed, and phone changes require academic Department Admin approval.',
            code: 'PROFILE_ALREADY_LOCKED',
          },
          403
        );
      }
    }

    // 5. Ensure enrollment number is unique across student accounts
    const existingEnrollment = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('enrollment_no', rawEnrollment), Query.limit(1)]
    );

    if (
      existingEnrollment.total > 0 &&
      existingEnrollment.documents[0] &&
      readStringField(existingEnrollment.documents[0], 'user_id') !== caller.id
    ) {
      return res.json(
        {
          success: false,
          error: 'This enrollment number is already registered to another student account.',
          code: 'ENROLLMENT_ALREADY_REGISTERED',
        },
        409
      );
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
      role: 'student' as const,
      name_locked: true,
      enrollment_locked: true,
      phone_locked: true,
      profile_status: 'complete' as const,
      created_at: existingDoc ? readStringField(existingDoc, 'created_at') || now : now,
      updated_at: now,
    };

    const savedDoc = existingDoc
      ? await databases.updateDocument(
          config.databaseId,
          config.profilesCollectionId,
          existingDoc.$id,
          dbProfileData
        )
      : await databases.createDocument(
          config.databaseId,
          config.profilesCollectionId,
          ID.unique(),
          dbProfileData,
          []
        );

    log(
      `[profile] Successfully onboarded student ${caller.id} for department ${enrollmentResult.departmentId} (code ${enrollmentResult.code})`
    );

    const profile = buildProfileResponse(savedDoc.$id, {
      ...dbProfileData,
      department_id: enrollmentResult.departmentId,
      department_name: enrollmentResult.departmentName || undefined,
    });

    return res.json(
      {
        success: true,
        data: {
          profile,
        },
      },
      200
    );
  } catch (createErr) {
    error(`[profile] Failed to save profile for ${caller.id}: ${String(createErr)}`);
    return res.json(
      {
        success: false,
        error: 'Failed to create student profile. Please try again.',
        code: 'PROFILE_CREATION_FAILED',
      },
      500
    );
  }
}

/**
 * Lists all 6 active institutional departments with academic and maintenance flags.
 * Queries the database when configured and reconciles against the authoritative 6-department registry.
 */
export async function handleListDepartments(
  context: AppwriteContext,
  deps?: ProfileHandlerDeps
): Promise<unknown> {
  const { res, log } = context;
  const config = getAppwriteConfig();
  const canonicalDepartments: Department[] = INSTITUTIONAL_DEPARTMENTS.map(toDepartmentModel);

  if (deps?.databases || config.apiKey) {
    try {
      const databases = deps?.databases ?? getServerClient().databases;
      const result = await databases.listDocuments(
        config.databaseId,
        config.departmentsCollectionId,
        [Query.limit(50)]
      );

      if (result.total > 0) {
        const dbById = new Map<string, Department>();
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

        return res.json(
          {
            success: true,
            data: {
              departments: merged,
            },
          },
          200
        );
      }
    } catch (dbErr) {
      log(`[departments] Falling back to canonical department registry: ${String(dbErr)}`);
    }
  }

  return res.json(
    {
      success: true,
      data: {
        departments: canonicalDepartments,
      },
    },
    200
  );
}
