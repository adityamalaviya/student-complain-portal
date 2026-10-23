import { Client, Account } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from './db.js';
import type { AppwriteContext, AuthenticatedCaller, DepartmentCode, UserRole } from './types.js';

export async function verifyCaller(
  context: AppwriteContext,
  payload?: Record<string, unknown>
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
  const userIdHeader = req.headers['x-appwrite-user-id'] || '';

  let user: { $id: string; email: string; name: string } | null = null;

  // 2. Try JWT verification if present
  if (jwtHeader) {
    try {
      const userClient = new Client();
      userClient.setEndpoint(config.endpoint);
      if (config.projectId) {
        userClient.setProject(config.projectId);
      }
      userClient.setJWT(jwtHeader);

      const account = new Account(userClient);
      const accountData = await account.get();
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
  if (!user && userIdHeader && config.apiKey) {
    try {
      const { users } = getServerClient();
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

  // 4. Admin Allowlist Evaluation (Normalized lowercase with whitespace trimmed)
  const normalizedEmail = user.email.trim().toLowerCase();
  let role: UserRole = 'student';
  let department_code: DepartmentCode | null = null;
  let department_name: string | null = null;

  if (config.adminComputerEmail && normalizedEmail === config.adminComputerEmail) {
    role = 'department_admin';
    department_code = '07';
    department_name = 'Computer Department';
    log(`[auth] Recognized caller ${user.$id} (${normalizedEmail}) as Computer Department Admin`);
  } else if (config.adminCivilEmail && normalizedEmail === config.adminCivilEmail) {
    role = 'department_admin';
    department_code = '06';
    department_name = 'Civil Department';
    log(`[auth] Recognized caller ${user.$id} (${normalizedEmail}) as Civil Department Admin`);
  }

  return {
    caller: {
      id: user.$id,
      email: user.email,
      name: user.name,
      role,
      department_code,
      department_name,
    },
  };
}
