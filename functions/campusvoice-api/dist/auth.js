import { Client, Account, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient, withTransientRetry } from './db.js';
import { readBooleanField, readStringField, resolveDepartment, } from './departments.js';
/**
 * Resolves valid, active DepartmentAdminAssignment entries from candidate database documents,
 * enforcing boolean is_active === true, active department registry lookup, and scope parity.
 */
export function resolveActiveAdminAssignmentsFromDocs(candidateDocs, callerId, callerEmail) {
    const normalizedCallerEmail = callerEmail.trim().toLowerCase();
    const assignments = [];
    const matchedDocsToLink = [];
    for (const doc of candidateDocs) {
        const docUserId = readStringField(doc, 'user_id').trim();
        const docEmail = readStringField(doc, 'email').trim().toLowerCase();
        // Must match either user_id or verified email
        if (docUserId !== callerId && (!normalizedCallerEmail || docEmail !== normalizedCallerEmail)) {
            continue;
        }
        // Require explicit boolean true; missing, false, or non-boolean values never grant access.
        if (readBooleanField(doc, 'is_active') !== true) {
            continue;
        }
        const rawScope = readStringField(doc, 'scope').trim().toLowerCase();
        const docDeptId = readStringField(doc, 'department_id').trim();
        const academicDeptId = readStringField(doc, 'academic_department_id').trim();
        const maintDeptId = readStringField(doc, 'maintenance_department_id').trim();
        const scopesToAdd = [];
        if (rawScope === 'academic') {
            scopesToAdd.push('academic');
        }
        else if (rawScope === 'maintenance') {
            scopesToAdd.push('maintenance');
        }
        else if (rawScope === 'both' || rawScope === 'all') {
            scopesToAdd.push('maintenance', 'academic');
        }
        else {
            // Fallback when scope is null, empty, or unspecified
            if (maintDeptId) {
                scopesToAdd.push('maintenance');
            }
            if (academicDeptId) {
                scopesToAdd.push('academic');
            }
            if (scopesToAdd.length === 0 && docDeptId) {
                const dept = resolveDepartment(docDeptId);
                if (dept?.is_maintenance) {
                    scopesToAdd.push('maintenance');
                }
                if (dept?.is_academic) {
                    scopesToAdd.push('academic');
                }
                if (!dept) {
                    scopesToAdd.push('maintenance');
                }
            }
        }
        for (const scope of scopesToAdd) {
            const targetDeptId = scope === 'maintenance'
                ? maintDeptId || docDeptId
                : academicDeptId || docDeptId;
            const dept = resolveDepartment(targetDeptId);
            if (dept) {
                if (!dept.is_active) {
                    continue;
                }
                if (scope === 'academic' && !dept.is_academic) {
                    continue;
                }
                if (scope === 'maintenance' && !dept.is_maintenance) {
                    continue;
                }
            }
            else {
                if (scope !== 'maintenance' || !targetDeptId) {
                    continue;
                }
            }
            const assignedDeptId = dept ? dept.id : targetDeptId;
            const exists = assignments.some((a) => a.department_id === assignedDeptId && a.scope === scope);
            if (!exists) {
                assignments.push({
                    $id: doc.$id,
                    user_id: callerId,
                    email: readStringField(doc, 'email') || callerEmail,
                    department_id: assignedDeptId,
                    scope,
                    is_active: true,
                    assigned_by: readStringField(doc, 'assigned_by'),
                    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
                });
            }
        }
        if (docUserId !== callerId) {
            matchedDocsToLink.push(doc);
        }
    }
    return { assignments, matchedDocsToLink };
}
export async function verifyCaller(context, payload, deps) {
    const { req, log, error } = context;
    const config = getAppwriteConfig();
    // 1. Extract potential auth tokens / user headers
    const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
    const jwtHeader = (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '') ||
        req.headers['x-auth-jwt'] ||
        req.headers['x-appwrite-user-jwt'] ||
        req.headers['x-appwrite-jwt'] ||
        (typeof payload?.jwt === 'string' ? payload.jwt : '');
    const userIdHeader = (req.headers['x-appwrite-user-id'] || '').trim();
    const dynamicApiKey = (req.headers['x-appwrite-key'] || '').trim();
    const effectiveApiKey = config.apiKey || dynamicApiKey;
    let user = null;
    // 2. Try JWT verification if present
    if (jwtHeader) {
        try {
            const accountData = await withTransientRetry(() => deps?.verifyJwt
                ? deps.verifyJwt(jwtHeader)
                : (() => {
                    const userClient = new Client();
                    userClient.setEndpoint(config.endpoint);
                    if (config.projectId) {
                        userClient.setProject(config.projectId);
                    }
                    userClient.setJWT(jwtHeader);
                    return new Account(userClient).get();
                })());
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
    if (!user && userIdHeader && (deps?.users || effectiveApiKey)) {
        try {
            const users = deps?.users ?? getServerClient(effectiveApiKey).users;
            const userData = await withTransientRetry(() => users.get(userIdHeader));
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
    if (!deps?.databases && !effectiveApiKey) {
        error('[auth] Server database configuration missing; cannot verify caller authorization.');
        return {
            caller: null,
            error: 'Authorization verification unavailable.',
            statusCode: 500,
        };
    }
    let role = 'student';
    let department_id = null;
    let department_name = null;
    const admin_assignments = [];
    const databases = deps?.databases ?? getServerClient(effectiveApiKey).databases;
    // 4. Authoritative database-backed Department Admin assignment verification (fail closed on DB errors)
    try {
        const adminColIds = Array.from(new Set([config.departmentAdminsCollectionId, 'department_admins'].filter(Boolean)));
        const candidateDocsMap = new Map();
        let activeAdminColId = config.departmentAdminsCollectionId;
        const normalizedCallerEmail = (user.email || '').trim().toLowerCase();
        for (const colId of adminColIds) {
            let colHandled = false;
            try {
                const userRes = await withTransientRetry(() => databases.listDocuments(config.databaseId, colId, [Query.equal('user_id', user.$id), Query.limit(100)]));
                colHandled = true;
                for (const doc of userRes.documents) {
                    candidateDocsMap.set(doc.$id, doc);
                }
                const hasValidActiveFromUser = resolveActiveAdminAssignmentsFromDocs(userRes.documents, user.$id, user.email).assignments.length > 0;
                // Fall back to verified email when user_id yields no active assignment so an
                // older revoked user_id row never shadows a newly pre-provisioned email record.
                if (!hasValidActiveFromUser && normalizedCallerEmail) {
                    try {
                        const emailRes = await withTransientRetry(() => databases.listDocuments(config.databaseId, colId, [Query.equal('email', normalizedCallerEmail), Query.limit(100)]));
                        for (const doc of emailRes.documents) {
                            candidateDocsMap.set(doc.$id, doc);
                        }
                    }
                    catch (emailQueryErr) {
                        const errObj = emailQueryErr;
                        const errStr = String(errObj?.message || emailQueryErr);
                        const isNotFound = errStr.includes('not found') ||
                            errStr.includes('could not be found') ||
                            errObj?.code === 404;
                        if (!isNotFound) {
                            throw emailQueryErr;
                        }
                        log(`[auth] Notice: email query on ${colId} skipped: ${errStr}`);
                    }
                }
                if (candidateDocsMap.size > 0 || colHandled) {
                    activeAdminColId = colId;
                    if (candidateDocsMap.size > 0) {
                        break;
                    }
                }
            }
            catch (colErr) {
                const errObj = colErr;
                const errStr = String(errObj?.message || colErr);
                const isNotFound = errStr.includes('not found') ||
                    errStr.includes('could not be found') ||
                    errObj?.code === 404;
                if (!isNotFound) {
                    throw colErr;
                }
                log(`[auth] Notice: query on collection '${colId}' failed or not found: ${errStr}`);
            }
        }
        const candidateDocs = Array.from(candidateDocsMap.values());
        const resolved = resolveActiveAdminAssignmentsFromDocs(candidateDocs, user.$id, user.email);
        admin_assignments.push(...resolved.assignments);
        // Synchronize OAuth user ID to department_admins record if not yet linked
        for (const doc of resolved.matchedDocsToLink) {
            try {
                await databases.updateDocument(config.databaseId, activeAdminColId, doc.$id, { user_id: user.$id });
                log(`[auth] Linked department_admins record ${doc.$id} to user ID ${user.$id}`);
            }
            catch (linkErr) {
                log(`[auth] Notice: Could not sync user ID to department_admins record: ${String(linkErr)}`);
            }
        }
        if (admin_assignments.length > 0) {
            role = 'department_admin';
            const primary = admin_assignments.find((a) => a.scope === 'maintenance') || admin_assignments[0];
            const primaryDept = resolveDepartment(primary.department_id);
            if (primaryDept) {
                department_id = primaryDept.id;
                department_name = primaryDept.name;
            }
            else if (primary.department_id) {
                department_id = primary.department_id;
                department_name = primary.department_id;
                try {
                    const deptDoc = await withTransientRetry(() => databases.getDocument(config.databaseId, config.departmentsCollectionId, primary.department_id));
                    const nameFromDb = readStringField(deptDoc, 'name');
                    if (nameFromDb) {
                        department_name = nameFromDb;
                    }
                }
                catch {
                    // If department doc not found or lookup fails, department_name remains fallback
                }
            }
        }
    }
    catch (adminErr) {
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
            const profileRes = await withTransientRetry(() => databases.listDocuments(config.databaseId, config.profilesCollectionId, [Query.equal('user_id', user.$id), Query.limit(1)]));
            const profileDoc = profileRes.documents[0];
            if (profileDoc &&
                readStringField(profileDoc, 'user_id') === user.$id &&
                readStringField(profileDoc, 'role') === 'principal') {
                role = 'principal';
            }
        }
        catch (profileErr) {
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
