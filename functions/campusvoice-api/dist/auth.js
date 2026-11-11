import { Client, Account, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from './db.js';
import { readBooleanField, readStringField, resolveDepartment } from './departments.js';
export async function verifyCaller(context, payload) {
    const { req, log, error } = context;
    const config = getAppwriteConfig();
    // 1. Extract potential auth tokens / user headers
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const jwtHeader = (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '') ||
        req.headers['x-auth-jwt'] ||
        req.headers['x-appwrite-user-jwt'] ||
        req.headers['x-appwrite-jwt'] ||
        (typeof payload?.jwt === 'string' ? payload.jwt : '');
    const userIdHeader = req.headers['x-appwrite-user-id'] || '';
    let user = null;
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
        }
        catch (jwtErr) {
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
        }
        catch (usersErr) {
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
    const normalizedEmail = user.email.trim().toLowerCase();
    let role = 'student';
    let department_code = null;
    let department_name = null;
    let admin_assignments;
    // 4. Resolve database-backed assignments & principal role when server API key is configured
    let hasDbAdminRecords = false;
    if (config.apiKey) {
        const { databases } = getServerClient();
        try {
            const adminRes = await databases.listDocuments(config.databaseId, config.departmentAdminsCollectionId, [Query.equal('user_id', user.$id), Query.limit(20)]);
            if (adminRes.total > 0) {
                hasDbAdminRecords = true;
                const activeAssignments = [];
                for (const doc of adminRes.documents) {
                    const isActive = readBooleanField(doc, 'is_active') ?? true;
                    const rawScope = readStringField(doc, 'scope');
                    const scope = rawScope === 'academic' ? 'academic' : 'maintenance';
                    const rawDeptId = readStringField(doc, 'department_id');
                    const dept = resolveDepartment(rawDeptId);
                    if (isActive && dept) {
                        activeAssignments.push({
                            $id: doc.$id,
                            user_id: readStringField(doc, 'user_id') || user.$id,
                            email: readStringField(doc, 'email') || user.email,
                            department_id: dept.id,
                            scope,
                            is_active: true,
                            assigned_by: readStringField(doc, 'assigned_by'),
                            created_at: readStringField(doc, 'created_at') || doc.$createdAt,
                        });
                    }
                }
                if (activeAssignments.length > 0) {
                    role = 'department_admin';
                    admin_assignments = activeAssignments;
                    const primary = activeAssignments.find((a) => a.scope === 'maintenance') || activeAssignments[0];
                    const primaryDept = resolveDepartment(primary.department_id);
                    if (primaryDept) {
                        department_code = primaryDept.code;
                        department_name = primaryDept.name;
                    }
                }
            }
        }
        catch {
            // department_admins collection may not exist prior to live migration
        }
        if (role === 'student') {
            try {
                const profileRes = await databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', user.$id), Query.limit(1)]);
                const profileDoc = profileRes.documents[0];
                if (profileDoc) {
                    const profileRole = readStringField(profileDoc, 'role');
                    if (profileRole === 'principal') {
                        role = 'principal';
                    }
                    else if (profileRole === 'department_admin') {
                        const profileDept = resolveDepartment(readStringField(profileDoc, 'department_code') ||
                            readStringField(profileDoc, 'department_id'));
                        if (profileDept) {
                            role = 'department_admin';
                            department_code = profileDept.code;
                            department_name = profileDept.name;
                        }
                    }
                }
            }
            catch {
                // Ignore profile lookup failure here; downstream handlers validate profile
            }
        }
    }
    // 5. Legacy env allowlist fallback during migration (only if no explicit DB admin record exists)
    if (!hasDbAdminRecords && role === 'student') {
        if (config.adminComputerEmail && normalizedEmail === config.adminComputerEmail) {
            role = 'department_admin';
            department_code = '07';
            department_name = 'Computer Department';
            log(`[auth] Recognized caller ${user.$id} (${normalizedEmail}) as Computer Department Admin`);
        }
        else if (config.adminCivilEmail && normalizedEmail === config.adminCivilEmail) {
            role = 'department_admin';
            department_code = '06';
            department_name = 'Civil Department';
            log(`[auth] Recognized caller ${user.$id} (${normalizedEmail}) as Civil Department Admin`);
        }
    }
    return {
        caller: {
            id: user.$id,
            email: user.email,
            name: user.name,
            role,
            ...(admin_assignments ? { admin_assignments } : {}),
            department_code,
            department_name,
        },
    };
}
