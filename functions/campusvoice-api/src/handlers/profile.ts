import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import type { AppwriteContext, AuthenticatedCaller, DepartmentCode, UserProfile } from '../types.js';

export async function handleGetProfile(
  context: AppwriteContext,
  caller: AuthenticatedCaller
): Promise<unknown> {
  const { res, log, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  try {
    const listResult = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('user_id', caller.id), Query.limit(1)]
    );

    if (listResult.total > 0 && listResult.documents[0]) {
      const doc = listResult.documents[0];
      const profile: UserProfile = {
        $id: doc.$id,
        user_id: (doc.user_id as string) || (doc.auth_user_id as string) || caller.id,
        auth_user_id: (doc.auth_user_id as string) || caller.id,
        email: (doc.email as string) || caller.email,
        name: (doc.name as string) || (doc.display_name as string) || caller.name,
        display_name: (doc.display_name as string) || (doc.name as string) || caller.name,
        enrollment_no: (doc.enrollment_no as string) || '',
        department_code: (doc.department_code as DepartmentCode) || caller.department_code || '07',
        department_name: (doc.department_name as string) || caller.department_name || '',
        role: (doc.role as 'student' | 'department_admin') || caller.role,
        is_locked: typeof doc.is_locked === 'boolean' ? doc.is_locked : true,
        profile_status: (doc.profile_status as 'complete' | 'incomplete') || 'complete',
        created_at: (doc.created_at as string) || doc.$createdAt,
        updated_at: (doc.updated_at as string) || doc.$updatedAt,
      };

      return res.json(
        {
          success: true,
          data: {
            profile,
            is_onboarded: true,
          },
        },
        200
      );
    }

    // If caller is an admin, provision admin profile automatically
    if (caller.role === 'department_admin' && caller.department_code) {
      log(`[profile] Auto-provisioning admin profile for ${caller.email}`);
      const now = new Date().toISOString();
      const adminDoc: Omit<UserProfile, '$id'> = {
        user_id: caller.id,
        auth_user_id: caller.id,
        email: caller.email,
        name: caller.name || 'Department Administrator',
        display_name: caller.name || 'Department Administrator',
        enrollment_no: '',
        department_code: caller.department_code,
        department_name: caller.department_name || '',
        role: 'department_admin',
        is_locked: true,
        profile_status: 'complete',
        created_at: now,
        updated_at: now,
      };

      try {
        const createdDoc = await databases.createDocument(
          config.databaseId,
          config.profilesCollectionId,
          ID.unique(),
          adminDoc,
          []
        );

        const adminProfile: UserProfile = {
          $id: createdDoc.$id,
          ...adminDoc,
        };

        return res.json(
          {
            success: true,
            data: {
              profile: adminProfile,
              is_onboarded: true,
            },
          },
          200
        );
      } catch (adminCreateErr) {
        log(`[profile] Could not auto-create admin doc in DB, returning computed admin profile: ${String(adminCreateErr)}`);
        return res.json(
          {
            success: true,
            data: {
              profile: adminDoc,
              is_onboarded: true,
            },
          },
          200
        );
      }
    }

    // Student has not onboarded yet
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

export async function handleCompleteOnboarding(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  payload: Record<string, unknown>
): Promise<unknown> {
  const { res, log, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  if (caller.role === 'department_admin') {
    return res.json(
      {
        success: false,
        error: 'Department administrators do not require student profile onboarding.',
        code: 'ADMIN_ONBOARDING_NOT_REQUIRED',
      },
      400
    );
  }

  // 1. Validate name
  const rawName = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (rawName.length < 2 || rawName.length > 100) {
    return res.json(
      {
        success: false,
        error: 'Student name must be between 2 and 100 characters.',
        code: 'INVALID_NAME',
      },
      400
    );
  }

  // 2. Validate enrollment number format
  const rawEnrollment = typeof payload.enrollment_no === 'string' ? payload.enrollment_no.trim() : '';
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

  // 3. Extract department code using zero-based slice [7:9]
  const deptCode = rawEnrollment.slice(7, 9);
  let deptName = '';
  if (deptCode === '06') {
    deptName = 'Civil Department';
  } else if (deptCode === '07') {
    deptName = 'Computer Department';
  } else {
    return res.json(
      {
        success: false,
        error: 'Department code in enrollment number must be 06 (Civil) or 07 (Computer). Unmapped codes are not permitted.',
        code: 'INVALID_DEPARTMENT_CODE',
      },
      400
    );
  }

  try {
    // 4. Check if profile already exists and is locked
    const existingUserProfiles = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('user_id', caller.id), Query.limit(1)]
    );

    if (existingUserProfiles.total > 0 && existingUserProfiles.documents[0]) {
      const existing = existingUserProfiles.documents[0];
      if (existing.is_locked || existing.profile_status === 'complete') {
        return res.json(
          {
            success: false,
            error: 'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.',
            code: 'PROFILE_ALREADY_LOCKED',
          },
          403
        );
      }
    }

    // 5. Check if enrollment number is already registered by another user
    const existingEnrollment = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('enrollment_no', rawEnrollment), Query.limit(1)]
    );

    if (
      existingEnrollment.total > 0 &&
      existingEnrollment.documents[0] &&
      existingEnrollment.documents[0].user_id !== caller.id
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

    // 6. Create locked profile document with empty permissions ([])
    const now = new Date().toISOString();
    const newProfileData: Omit<UserProfile, '$id'> = {
      user_id: caller.id,
      auth_user_id: caller.id,
      email: caller.email,
      name: rawName,
      display_name: rawName,
      enrollment_no: rawEnrollment,
      department_code: deptCode as DepartmentCode,
      department_name: deptName,
      role: 'student',
      is_locked: true,
      profile_status: 'complete',
      created_at: now,
      updated_at: now,
    };

    const createdDoc = await databases.createDocument(
      config.databaseId,
      config.profilesCollectionId,
      ID.unique(),
      newProfileData,
      []
    );

    log(`[profile] Successfully onboarded student ${caller.id} for department ${deptCode}`);

    const profile: UserProfile = {
      $id: createdDoc.$id,
      ...newProfileData,
    };

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

export function handleListDepartments(context: AppwriteContext): unknown {
  const { res } = context;
  return res.json(
    {
      success: true,
      data: {
        departments: [
          { code: '06', name: 'Civil Department', is_active: true },
          { code: '07', name: 'Computer Department', is_active: true },
        ],
      },
    },
    200
  );
}
