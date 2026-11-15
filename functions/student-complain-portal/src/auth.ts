import { Client, Account, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from './db.js';
import {
  readBooleanField,
  readStringField,
  resolveDepartment,
  type DatabaseClientLike,
} from './departments.js';
import type {
  AdminScope,
  AppwriteContext,
  AuthenticatedCaller,
  DepartmentAdminAssignment,
  DepartmentId,
  UserRole,
} from './types.js';

export interface UsersClientLike {
  get(userId: string): Promise<{ $id: string; email?: string; name?: string }>;
}

export interface AuthVerifierDeps {
  databases?: DatabaseClientLike;
  users?: UsersClientLike;
  verifyJwt?: (jwt: string) => Promise<{ $id: string; email?: string; name?: string }>;
}

export async function verifyCaller(
  context: AppwriteContext,
  payload?: Record<string, unknown>,
  deps?: AuthVerifierDeps
): Promise<{ caller: AuthenticatedCaller | null; error?: string; statusCode?: number }> {
  const { req, log, error } = context;
  const config = getAppwriteConfig();

  // 1. Extract potential auth tokens / user headers
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  const jwtHeader =
    (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '') ||
    req.headers['x-auth-jwt'] ||
    req.headers['x-appwrite-user-jwt'] ||
    req.headers['x-appwrite-jwt'] ||
    (typeof payload?.jwt === 'string' ? payload.jwt : '');
  const userIdHeader = (req.headers['x-appwrite-user-id'] || '').trim();

  let user: { $id: string; email: string; name: string } | null = null;

  // 2. Try JWT verification if present
  if (jwtHeader) {
    try {
      const accountData = deps?.verifyJwt
        ? await deps.verifyJwt(jwtHeader)
        : await (() => {
            const userClient = new Client();
            userClient.setEndpoint(config.endpoint);
            if (config.projectId) {
              userClient.setProject(config.projectId);
            }
            userClient.setJWT(jwtHeader);
            return new Account(userClient).get();
          })();

      user = {
        $id: accountData.$id,
        email: accountData.email || '',
        name: accountData.name || '',
      };
      log(`[auth] Successfully authenticated user ${user.$id} via JWT`);
    } catch (jwtErr) {
      log(`[auth] JWT verification attempt failed: ${String(jwtErr)}`);
    }
  }

  // 3. Fallback to Appwrite Execution User ID (when invoked within Appwrite platform)
  if (!user && userIdHeader && (deps?.users || config.apiKey)) {
    try {
      const users = deps?.users ?? getServerClient().users;
      const userData = await users.get(userIdHeader);
      user = {
        $id: userData.$id,
        email: userData.email || '',
        name: userData.name || '',
      };
      log(`[auth] Authenticated user ${user.$id} via x-appwrite-user-id header`);
    } catch (usersErr) {
      error(`[auth] Failed to fetch user ${userIdHeader}: ${String(usersErr)}`);
    }
  }

  if (!user) {
    return {
      caller: null,
      error: 'Unauthorized: Missing or invalid authentication token.',
      statusCode: 401,
    };
  }

  if (!deps?.databases && !config.apiKey) {
    error('[auth] Server database configuration missing; cannot verify caller authorization.');
    return {
      caller: null,
      error: 'Authorization verification unavailable.',
      statusCode: 500,
    };
  }

  let role: UserRole = 'student';
  let department_id: DepartmentId | null = null;
  let department_name: string | null = null;
  const admin_assignments: DepartmentAdminAssignment[] = [];

  const databases = deps?.databases ?? getServerClient().databases;

  // 4. Authoritative database-backed Department Admin assignment verification (fail closed on DB errors)
  try {
    const adminRes = await databases.listDocuments(
      config.databaseId,
      config.departmentAdminsCollectionId,
      [Query.equal('user_id', user.$id), Query.limit(100)]
    );

    let candidateDocs = adminRes.documents;
    const normalizedCallerEmail = (user.email || '').trim().toLowerCase();

    // Fallback: If user_id is not yet linked, query active assignment by verified email
    if (candidateDocs.length === 0 && normalizedCallerEmail) {
      try {
        const emailRes = await databases.listDocuments(
          config.databaseId,
          config.departmentAdminsCollectionId,
          [Query.equal('email', normalizedCallerEmail), Query.limit(100)]
        );
        if (emailRes.total > 0) {
          candidateDocs = emailRes.documents;
        }
      } catch (emailQueryErr) {
        log(`[auth] Notice: email query on department_admins skipped or index missing: ${String(emailQueryErr)}`);
      }
    }

    for (const doc of candidateDocs) {
      const docUserId = readStringField(doc, 'user_id').trim();
      const docEmail = readStringField(doc, 'email').trim().toLowerCase();

      // Must match either user_id or verified email
      if (docUserId !== user.$id && docEmail !== normalizedCallerEmail) {
        continue;
      }
      // Require explicit boolean true; missing, false, or non-boolean values never grant access.
      if (readBooleanField(doc, 'is_active') !== true) {
        continue;
      }
      const rawScope = readStringField(doc, 'scope').trim();
      if (rawScope !== 'academic' && rawScope !== 'maintenance') {
        continue;
      }
      const scope: AdminScope = rawScope;
      const dept = resolveDepartment(readStringField(doc, 'department_id'));
      if (!dept || !dept.is_active) {
        continue;
      }
      if (scope === 'academic' && !dept.is_academic) {
        continue;
      }
      if (scope === 'maintenance' && !dept.is_maintenance) {
        continue;
      }

      admin_assignments.push({
        $id: doc.$id,
        user_id: user.$id,
        email: readStringField(doc, 'email') || user.email,
        department_id: dept.id,
        scope,
        is_active: true,
        assigned_by: readStringField(doc, 'assigned_by'),
        created_at: readStringField(doc, 'created_at') || doc.$createdAt,
      });

      // Synchronize OAuth user ID to department_admins record if not yet linked
      if (docUserId !== user.$id) {
        try {
          await databases.updateDocument(
            config.databaseId,
            config.departmentAdminsCollectionId,
            doc.$id,
            { user_id: user.$id }
          );
          log(`[auth] Linked department_admins record ${doc.$id} to user ID ${user.$id}`);
        } catch (linkErr) {
          log(`[auth] Notice: Could not sync user ID to department_admins record: ${String(linkErr)}`);
        }
      }
    }

    if (admin_assignments.length > 0) {
      role = 'department_admin';
      const primary =
        admin_assignments.find((a) => a.scope === 'maintenance') || admin_assignments[0];
      const primaryDept = resolveDepartment(primary.department_id);
      if (primaryDept) {
        department_id = primaryDept.id;
        department_name = primaryDept.name;
      }
    }
  } catch (adminErr) {
    error(`[auth] Failed to query department_admins for ${user.$id}: ${String(adminErr)}`);
    return {
      caller: null,
      error: 'Unable to verify administrator authorization.',
      statusCode: 500,
    };
  }

  // 5. Verify Principal role from profiles when caller has no active admin assignment (never elevate department_admin)
  if (role === 'student') {
    try {
      const profileRes = await databases.listDocuments(
        config.databaseId,
        config.profilesCollectionId,
        [Query.equal('user_id', user.$id), Query.limit(1)]
      );
      const profileDoc = profileRes.documents[0];
      if (
        profileDoc &&
        readStringField(profileDoc, 'user_id') === user.$id &&
        readStringField(profileDoc, 'role') === 'principal'
      ) {
        role = 'principal';
      }
    } catch (profileErr) {
      error(`[auth] Failed to query profiles for ${user.$id}: ${String(profileErr)}`);
      return {
        caller: null,
        error: 'Unable to verify caller role.',
        statusCode: 500,
      };
    }
  }

  return {
    caller: {
      id: user.$id,
      email: user.email,
      name: user.name,
      role,
      admin_assignments,
      department_id,
      department_name,
    },
  };
}
