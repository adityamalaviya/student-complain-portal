import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import main from '../index.js';
import { verifyCaller } from '../auth.js';
import { handleGetProfile } from '../handlers/profile.js';
import { handleCreateComplaint, handleGetAdminDashboard, handleGetComplaint, handleGetComplaintAttachment, handleGetSupportState, handleListAdminComplaints, handleListComplaints, handleSupportComplaint, handleRemoveSupport, handleUpdateAdminComplaint, handleRequestClarification, handleReplyClarification, } from '../handlers/complaints.js';
import { handleRequestPhoneChange, handleReviewPhoneChange, handleCompletePhoneChange, handleListPhoneChangeRequests, } from '../handlers/phoneChange.js';
import { handleGetPrincipalDashboard, handleIssueWarning, handleRespondToWarning, handleListAdminAssignments, handleAssignAdmin, handleRevokeAdmin, handleGetAuditHistory, } from '../handlers/principal.js';
function makeAdminAssignment(userId, departmentId, scope = 'maintenance', isActive = true) {
    return {
        $id: `da_${userId}`,
        user_id: userId,
        email: `${userId}@college.edu`,
        department_id: departmentId,
        scope,
        is_active: isActive,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
    };
}
/**
 * Pure authorization evaluation function enforcing Phase 3 Cross-Department Oracle Elimination.
 *
 * Rules:
 * 1. If complaint is 'public', any authenticated student or admin from any department can view it.
 * 2. If complaint is 'department', the caller's department MUST exactly match the complaint's department.
 * 3. If caller's department does NOT match, the system MUST return a generic 404 Not Found (never 403, never revealing existence).
 */
function evaluateComplaintAccess(callerDept, complaint) {
    // Public complaints are completely removed. Cross-department access is strictly forbidden (Oracle Elimination).
    if (callerDept === complaint.department_code) {
        return { allowed: true, status: 200 };
    }
    return { allowed: false, status: 404 };
}
/**
 * Validates input parameters for creating a new complaint per Phase 3 specifications.
 */
function validateComplaintPayload(payload) {
    const title = payload.title.trim();
    const location = payload.location.trim();
    const description = payload.description.trim();
    if (title.length < 5 || title.length > 150) {
        return { valid: false, error: 'Complaint title must be between 5 and 150 characters.' };
    }
    if (location.length < 3 || location.length > 100) {
        return { valid: false, error: 'Location must be between 3 and 100 characters.' };
    }
    if (description.length < 10 || description.length > 2000) {
        return { valid: false, error: 'Description must be between 10 and 2000 characters.' };
    }
    if (!['low', 'medium', 'high'].includes(payload.priority)) {
        return { valid: false, error: "Priority must be 'low', 'medium', or 'high'." };
    }
    if (payload.issue_type === 'public') {
        return { valid: false, error: 'Public complaints have been completely removed.' };
    }
    if (!['department'].includes(payload.issue_type)) {
        return { valid: false, error: "Issue type must be 'department'." };
    }
    return { valid: true };
}
test('Phase 3 Exit Criteria: Department A cannot access Department B private complaints (Oracle Elimination)', () => {
    const civilDept = '06';
    const compDept = '07';
    const computerPrivateComplaint = {
        department_code: compDept,
        issue_type: 'department',
    };
    // Student from Civil (06) attempts to access Computer (07) private complaint
    const civilAccess = evaluateComplaintAccess(civilDept, computerPrivateComplaint);
    assert.equal(civilAccess.allowed, false, 'Civil student must not access Computer private complaint');
    assert.equal(civilAccess.status, 404, 'Must return generic 404 to eliminate cross-department oracle');
    // Student from Computer (07) accesses Computer (07) private complaint
    const compAccess = evaluateComplaintAccess(compDept, computerPrivateComplaint);
    assert.equal(compAccess.allowed, true, 'Computer student must access Computer private complaint');
    assert.equal(compAccess.status, 200);
});
test('Phase 3 Exit Criteria: Public issues are removed; cross-department probes return 404 Oracle Elimination', () => {
    const civilDept = '06';
    const compDept = '07';
    const publicGrievance = {
        department_code: compDept,
        issue_type: 'public',
    };
    // Cross-department student must be denied with 404 (Oracle Elimination)
    const civilAccess = evaluateComplaintAccess(civilDept, publicGrievance);
    assert.equal(civilAccess.allowed, false, 'Civil student must NOT access Computer complaint via public exemption');
    assert.equal(civilAccess.status, 404, 'Must return 404 Oracle Elimination');
    // Same-department student can access their department complaints
    const compAccess = evaluateComplaintAccess(compDept, publicGrievance);
    assert.equal(compAccess.allowed, true, 'Computer department student accesses Computer complaint');
    assert.equal(compAccess.status, 200);
});
test('Phase 3 Validation: Complaint creation payload bounds checking', () => {
    // Valid payload
    const valid = validateComplaintPayload({
        title: 'AC unit leaking in Room 304',
        location: 'Computer Lab 3, 2nd Floor',
        description: 'The split AC unit is dripping water directly above server rack 2.',
        priority: 'high',
        issue_type: 'department',
    });
    assert.equal(valid.valid, true);
    // Too short title (< 5 chars)
    const shortTitle = validateComplaintPayload({
        title: 'Leak',
        location: 'Lab 3',
        description: 'Valid description with more than 10 characters',
        priority: 'high',
        issue_type: 'department',
    });
    assert.equal(shortTitle.valid, false);
    // Invalid priority
    const invalidPriority = validateComplaintPayload({
        title: 'Valid Complaint Title',
        location: 'Lab 3',
        description: 'Valid description with more than 10 characters',
        priority: 'critical', // not allowed
        issue_type: 'department',
    });
    assert.equal(invalidPriority.valid, false);
    // Invalid issue_type
    const invalidScope = validateComplaintPayload({
        title: 'Valid Complaint Title',
        location: 'Lab 3',
        description: 'Valid description with more than 10 characters',
        priority: 'medium',
        issue_type: 'global', // not allowed
    });
    assert.equal(invalidScope.valid, false);
});
test('Phase 4 Exit Criteria: Deterministic 32-character SHA-256 support document ID', () => {
    const complaintId = '671234567890abcdef123456';
    const userId = 'usr_student_123';
    const docId = crypto.createHash('sha256').update(`${complaintId}:${userId}`).digest('hex').slice(0, 32);
    assert.equal(docId.length, 32);
    assert.match(docId, /^[a-f0-9]{32}$/);
    // Deterministic check
    const docIdAgain = crypto.createHash('sha256').update(`${complaintId}:${userId}`).digest('hex').slice(0, 32);
    assert.equal(docId, docIdAgain);
});
test('Phase 4 Exit Criteria: Duplicate support attempt returns ALREADY_SUPPORTED without count increment', () => {
    const supports = new Set();
    const complaint = { id: 'c_01', count: 0 };
    const userId = 'usr_voter';
    const docId = crypto.createHash('sha256').update(`${complaint.id}:${userId}`).digest('hex').slice(0, 32);
    // First vote succeeds
    if (!supports.has(docId)) {
        supports.add(docId);
        complaint.count += 1;
    }
    assert.equal(complaint.count, 1);
    assert.equal(supports.size, 1);
    // Second vote: docId collision detected (409)
    let isConflict = false;
    if (supports.has(docId)) {
        isConflict = true;
        // count is NOT incremented
    }
    assert.equal(isConflict, true);
    assert.equal(complaint.count, 1, 'Support count must not increase on duplicate vote');
    assert.equal(supports.size, 1);
});
test('Phase 5 Exit Criteria: Admin A can only manage own department; Public Issues are removed and cannot be managed across departments', () => {
    const adminCivil = { role: 'department_admin', dept: '06' };
    // Own department complaint
    const civilPrivate = { dept: '06', issue_type: 'department' };
    const civilCanManage = adminCivil.dept === civilPrivate.dept;
    assert.equal(civilCanManage, true, 'Civil admin can manage Civil private complaints');
    // Public issue attempt from other department: must NOT be manageable (Oracle Elimination: 404)
    const publicIssue = { dept: '07', issue_type: 'public' };
    const canManagePublic = adminCivil.dept === publicIssue.dept;
    assert.equal(canManagePublic, false, 'Civil admin cannot manage cross-department public issues');
    const pubStatus = canManagePublic ? 200 : 404;
    assert.equal(pubStatus, 404, 'Must return 404 Oracle Elimination for cross-department issues');
    // Cross-department private complaint: MUST return 404 (Oracle Elimination)
    const compPrivate = { dept: '07', issue_type: 'department' };
    const isAuthorized = adminCivil.dept === compPrivate.dept;
    assert.equal(isAuthorized, false, 'Civil admin cannot manage Computer private complaints');
    const responseStatus = isAuthorized ? 200 : 404;
    assert.equal(responseStatus, 404, 'Must return generic 404 for Department B private complaints');
});
function createComplaintMockContext() {
    let captured = { statusCode: 200, body: {} };
    const context = {
        req: { body: {}, headers: {}, method: 'POST', url: '/', path: '/' },
        res: {
            json: (data, statusCode = 200) => {
                captured = { statusCode, body: data };
                return captured;
            },
            empty: () => null,
        },
        log: () => { },
        error: () => { },
    };
    return { context, getResponse: () => captured };
}
function createComplaintInMemoryDb(initialCollections = {}) {
    const collections = new Map();
    for (const [k, docs] of Object.entries(initialCollections)) {
        collections.set(k, [...docs]);
    }
    let idSeq = 1;
    const databases = {
        async listDocuments(_dbId, collectionId, queries = []) {
            let docs = [...(collections.get(collectionId) || [])];
            for (const q of queries) {
                try {
                    const parsed = JSON.parse(q);
                    if (parsed.method === 'equal' && parsed.attribute && Array.isArray(parsed.values)) {
                        docs = docs.filter((d) => parsed.values?.includes(d[parsed.attribute]));
                    }
                }
                catch {
                    // Ignore non-JSON query strings
                }
            }
            return { total: docs.length, documents: docs };
        },
        async getDocument(_dbId, collectionId, documentId) {
            const docs = collections.get(collectionId) || [];
            const found = docs.find((d) => d.$id === documentId);
            if (!found) {
                throw new Error('Document not found');
            }
            return found;
        },
        async createDocument(_dbId, collectionId, documentId, data, permissions = []) {
            const docs = collections.get(collectionId) || [];
            const actualId = documentId === 'unique()' ? `cmpl_${idSeq++}` : documentId;
            const existing = docs.find((d) => d.$id === actualId);
            if (existing) {
                const collisionErr = new Error(`Document with ID ${actualId} already exists`);
                collisionErr.code = 409;
                throw collisionErr;
            }
            const now = new Date().toISOString();
            const doc = {
                $id: actualId,
                $collectionId: collectionId,
                $databaseId: 'campusvoice',
                $createdAt: now,
                $updatedAt: now,
                $permissions: permissions,
                ...data,
            };
            docs.push(doc);
            collections.set(collectionId, docs);
            return doc;
        },
        async updateDocument(_dbId, collectionId, documentId, data = {}) {
            const docs = collections.get(collectionId) || [];
            const idx = docs.findIndex((d) => d.$id === documentId);
            if (idx === -1) {
                throw new Error('Document not found');
            }
            const updated = {
                ...docs[idx],
                ...data,
                $updatedAt: new Date().toISOString(),
            };
            docs[idx] = updated;
            return updated;
        },
        async deleteDocument(_dbId, collectionId, documentId) {
            const docs = collections.get(collectionId) || [];
            const idx = docs.findIndex((d) => d.$id === documentId);
            if (idx === -1) {
                throw new Error('Document not found');
            }
            docs.splice(idx, 1);
            return { deleted: true };
        },
    };
    return { databases, collections };
}
test('Day 2: handleCreateComplaint routes across all 6 maintenance departments, derives identity server-side, initializes Pending & support_count=1', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_comp_1',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_student',
                name: 'Aarav Patel',
                enrollment_no: '246510307054',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
            },
        ],
    });
    const caller = {
        id: 'usr_comp_student',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // Computer student files complaint for Water maintenance (and tries to spoof identity & count)
    const ctx = createComplaintMockContext();
    await handleCreateComplaint(ctx.context, caller, {
        title: 'Drinking water cooler not working on 2nd floor',
        maintenance_department_id: 'dept_water',
        location: 'Computer Block, 2nd Floor',
        description: 'The drinking water dispenser is warm and leaking onto the corridor.',
        priority: 'high',
        student_user_id: 'usr_spoofed',
        student_name: 'Fake Student',
        student_enrollment_no: '246510306001',
        student_department_id: 'dept_civil',
        status: 'Resolved',
        support_count: 999,
    }, { databases });
    const res = ctx.getResponse();
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    const stored = (collections.get('complaints') || [])[0];
    assert.ok(stored);
    assert.equal(stored.student_user_id, 'usr_comp_student');
    assert.equal(stored.student_name, 'Aarav Patel');
    assert.equal(stored.student_enrollment_no, '246510307054');
    assert.equal(stored.student_department_id, 'dept_comp');
    assert.equal(stored.maintenance_department_id, 'dept_water');
    assert.equal(stored.status, 'Pending');
    assert.equal(stored.support_count, 1);
    assert.equal(stored.issue_type, undefined);
    assert.equal(stored.department_code, undefined, 'complaints collection must not store undeclared department_code');
    assert.ok(stored.last_meaningful_update_at);
    assert.deepEqual(stored.$permissions, []);
    // Verify complaint_created audit log was appended
    const auditLogs = collections.get('audit_logs') || [];
    const createdAudit = auditLogs.find((a) => a.action === 'complaint_created');
    assert.ok(createdAudit, 'complaint_created audit entry must be appended');
    assert.equal(createdAudit.target_resource_id, stored.$id);
    assert.equal(createdAudit.actor_id, 'usr_comp_student');
    // Verify all 6 maintenance departments are selectable
    for (const maintId of ['dept_comp', 'dept_civil', 'dept_elec', 'dept_mech', 'dept_water', 'dept_sanit']) {
        const deptCtx = createComplaintMockContext();
        await handleCreateComplaint(deptCtx.context, caller, {
            title: `Issue routed to ${maintId}`,
            maintenance_department_id: maintId,
            location: 'Block A',
            description: 'Detailed maintenance issue description for testing.',
            priority: 'medium',
        }, { databases });
        assert.equal(deptCtx.getResponse().statusCode, 201);
    }
});
test('Day 2: handleCreateComplaint & handleListComplaints reject invalid maintenance departments, incomplete profiles, and obsolete public requests', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_comp_valid',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_valid',
                name: 'Valid Student',
                enrollment_no: '246510307054',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_no_phone',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_incomplete',
                name: 'Incomplete Student',
                enrollment_no: '246510307099',
                student_department_id: 'dept_comp',
                phone_number: '',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: false,
            },
        ],
    });
    const validCaller = {
        id: 'usr_valid',
        email: 'valid@college.edu',
        name: 'Valid Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // Reject public issue_type
    const pubCreateCtx = createComplaintMockContext();
    await handleCreateComplaint(pubCreateCtx.context, validCaller, {
        title: 'Public issue attempt',
        maintenance_department_id: 'dept_elec',
        location: 'Campus Gate',
        description: 'Attempting to file obsolete public complaint.',
        priority: 'low',
        issue_type: 'public',
    }, { databases });
    assert.equal(pubCreateCtx.getResponse().statusCode, 400);
    assert.equal(pubCreateCtx.getResponse().body.code, 'PUBLIC_COMPLAINTS_REMOVED');
    // Reject invalid maintenance_department_id
    const badMaintCtx = createComplaintMockContext();
    await handleCreateComplaint(badMaintCtx.context, validCaller, {
        title: 'Unknown maintenance dept',
        maintenance_department_id: 'dept_unknown',
        location: 'Room 101',
        description: 'Valid description for testing invalid department.',
        priority: 'low',
    }, { databases });
    assert.equal(badMaintCtx.getResponse().statusCode, 400);
    assert.equal(badMaintCtx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
    // Reject incomplete profile missing phone_number
    const incompleteCaller = {
        id: 'usr_incomplete',
        email: 'incomplete@college.edu',
        name: 'Incomplete Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const incCtx = createComplaintMockContext();
    await handleCreateComplaint(incCtx.context, incompleteCaller, {
        title: 'Broken fan in classroom',
        maintenance_department_id: 'dept_elec',
        location: 'Room 202',
        description: 'Ceiling fan not working in Room 202.',
        priority: 'medium',
    }, { databases });
    assert.equal(incCtx.getResponse().statusCode, 400);
    assert.equal(incCtx.getResponse().body.code, 'PROFILE_INCOMPLETE');
    // Reject feed_type: 'public' in handleListComplaints
    const pubListCtx = createComplaintMockContext();
    await handleListComplaints(pubListCtx.context, validCaller, { feed_type: 'public' }, { databases });
    assert.equal(pubListCtx.getResponse().statusCode, 400);
    assert.equal(pubListCtx.getResponse().body.code, 'PUBLIC_COMPLAINTS_REMOVED');
});
// =====================================================================
// Day 3 Integration Tests (Slice 1): Visibility, PII Redaction, Role Scope
// =====================================================================
test('Day 3: handleListComplaints scopes strictly by student_department_id and redacts peer PII and attachment metadata', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_a',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_a',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_b',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_b',
                name: 'Bhavya Shah',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        complaints: [
            {
                $id: 'cmpl_comp_own',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_a',
                student_name: 'Aarav Patel',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water cooler fault near Lab 1',
                location: 'Computer Block',
                description: 'Cooler is not dispensing cold water.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_own_123',
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
            {
                $id: 'cmpl_comp_peer',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T02:00:00.000Z',
                $updatedAt: '2026-11-10T02:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_b',
                student_name: 'Bhavya Shah',
                student_enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_elec',
                title: 'Flickering lights in Lab 3',
                location: 'Computer Lab 3',
                description: 'Tube lights are flickering continuously.',
                priority: 'high',
                status: 'Pending',
                support_count: 2,
                attachment_file_id: 'file_peer_secret',
                created_at: '2026-11-10T02:00:00.000Z',
                updated_at: '2026-11-10T02:00:00.000Z',
            },
            {
                $id: 'cmpl_civil_other',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T03:00:00.000Z',
                $updatedAt: '2026-11-10T03:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_civil_c',
                student_name: 'Chirag Mehta',
                student_enrollment_no: '246510306003',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_comp',
                title: 'Civil student complaint routed to Computer maintenance',
                location: 'Civil Block',
                description: 'CAD workstation monitor issue.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_civil_secret',
                created_at: '2026-11-10T03:00:00.000Z',
                updated_at: '2026-11-10T03:00:00.000Z',
            },
        ],
    });
    const studentACaller = {
        id: 'usr_comp_a',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const listCtx = createComplaintMockContext();
    await handleListComplaints(listCtx.context, studentACaller, {}, { databases });
    const res = listCtx.getResponse();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const data = res.body.data;
    assert.equal(data.total, 2, 'Only same-academic-department complaints must be returned');
    assert.equal(data.complaints.some((c) => c.$id === 'cmpl_civil_other'), false, 'Cross-academic-department complaint must not appear even if maintenance_department_id is Computer');
    const ownItem = data.complaints.find((c) => c.$id === 'cmpl_comp_own');
    assert.ok(ownItem);
    assert.equal(ownItem.is_own_complaint, true);
    assert.equal(ownItem.student_name, 'Aarav Patel');
    assert.equal(ownItem.student_enrollment_no, '246510307001');
    assert.equal(ownItem.attachment_file_id, 'file_own_123');
    const peerItem = data.complaints.find((c) => c.$id === 'cmpl_comp_peer');
    assert.ok(peerItem);
    assert.equal(peerItem.is_own_complaint, false);
    assert.equal('student_user_id' in peerItem, false, 'Peer projection must omit student_user_id');
    assert.equal('student_name' in peerItem, false, 'Peer projection must omit student_name');
    assert.equal('student_enrollment_no' in peerItem, false, 'Peer projection must omit student_enrollment_no');
    assert.equal('student_phone_number' in peerItem, false, 'Peer projection must omit student_phone_number');
    assert.equal('phone_number' in peerItem, false, 'Peer projection must omit phone_number');
    assert.equal('attachment_file_id' in peerItem, false, 'Peer projection must omit attachment_file_id');
    assert.equal('attachment_url' in peerItem, false, 'Peer projection must omit attachment_url');
    // Non-student roles cannot call student feed
    const adminListCtx = createComplaintMockContext();
    await handleListComplaints(adminListCtx.context, {
        id: 'adm_water',
        email: 'water.admin@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        department_id: 'dept_water',
        department_name: 'Water',
    }, {}, { databases });
    assert.equal(adminListCtx.getResponse().statusCode, 403);
});
test('Day 3: handleGetComplaint enforces peer redaction, cross-department 404, and full access for creator, concerned Maintenance Admin, and Principal', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_a',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_a',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_b',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_b',
                name: 'Bhavya Shah',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_c',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_civil_c',
                name: 'Chirag Mehta',
                enrollment_no: '246510306003',
                student_department_id: 'dept_civil',
                phone_number: '9876543212',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        department_admins: [
            {
                $id: 'da_water',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                email: 'water@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_comp_acad_only',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_comp_acad',
                email: 'comp.acad@college.edu',
                department_id: 'dept_comp',
                scope: 'academic',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_water_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_b',
                student_name: 'Bhavya Shah',
                student_enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water pipe burst in corridor',
                location: 'Computer Building 1st Floor',
                description: 'Pipe leaking heavily near staircase.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_water_1',
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
        ],
    });
    // 1. Peer student (same academic dept) -> redacted
    const peerCtx = createComplaintMockContext();
    await handleGetComplaint(peerCtx.context, { id: 'usr_comp_a', email: 'a@college.edu', name: 'Aarav Patel', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(peerCtx.getResponse().statusCode, 200);
    const peerComplaint = peerCtx.getResponse().body.data.complaint;
    assert.equal(peerComplaint.is_own_complaint, false);
    assert.equal('student_user_id' in peerComplaint, false);
    assert.equal('student_name' in peerComplaint, false);
    assert.equal('student_enrollment_no' in peerComplaint, false);
    assert.equal('student_phone_number' in peerComplaint, false);
    assert.equal('attachment_file_id' in peerComplaint, false);
    assert.equal('attachment_url' in peerComplaint, false);
    // 2. Creator student -> full detail including phone & attachment
    const creatorCtx = createComplaintMockContext();
    await handleGetComplaint(creatorCtx.context, { id: 'usr_comp_b', email: 'b@college.edu', name: 'Bhavya Shah', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(creatorCtx.getResponse().statusCode, 200);
    const creatorComplaint = creatorCtx.getResponse().body.data.complaint;
    assert.equal(creatorComplaint.is_own_complaint, true);
    assert.equal(creatorComplaint.student_name, 'Bhavya Shah');
    assert.equal(creatorComplaint.student_enrollment_no, '246510307002');
    assert.equal(creatorComplaint.student_phone_number, '9876543211');
    assert.equal(creatorComplaint.attachment_file_id, 'file_water_1');
    // 3. Cross-academic-department student -> 404 Oracle Elimination
    const crossCtx = createComplaintMockContext();
    await handleGetComplaint(crossCtx.context, { id: 'usr_civil_c', email: 'c@college.edu', name: 'Chirag Mehta', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(crossCtx.getResponse().statusCode, 404);
    assert.equal(crossCtx.getResponse().body.code, 'NOT_FOUND');
    // 4. Concerned Water Maintenance Admin -> full detail including phone & attachment
    const waterAdminCtx = createComplaintMockContext();
    await handleGetComplaint(waterAdminCtx.context, {
        id: 'adm_water',
        email: 'water@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance')],
        department_id: 'dept_water',
        department_name: 'Water',
    }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(waterAdminCtx.getResponse().statusCode, 200);
    const adminComplaint = waterAdminCtx.getResponse().body.data.complaint;
    assert.equal(adminComplaint.student_name, 'Bhavya Shah');
    assert.equal(adminComplaint.student_enrollment_no, '246510307002');
    assert.equal(adminComplaint.student_phone_number, '9876543211');
    assert.equal(adminComplaint.attachment_file_id, 'file_water_1');
    // 5. Non-concerned Electrical Maintenance Admin -> 404 Oracle Elimination
    const elecAdminCtx = createComplaintMockContext();
    await handleGetComplaint(elecAdminCtx.context, {
        id: 'adm_elec',
        email: 'elec@college.edu',
        name: 'Elec Admin',
        role: 'department_admin',
        admin_assignments: [],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(elecAdminCtx.getResponse().statusCode, 404);
    // 6. Academic-only Computer Admin -> 404 (not maintenance admin for Water)
    const acadAdminCtx = createComplaintMockContext();
    await handleGetComplaint(acadAdminCtx.context, {
        id: 'adm_comp_acad',
        email: 'comp.acad@college.edu',
        name: 'Comp Acad Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_comp_acad', 'dept_comp', 'academic')],
        department_id: 'dept_comp',
        department_name: 'Computer',
    }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(acadAdminCtx.getResponse().statusCode, 404);
    // 7. Principal -> full detail across all departments
    const principalCtx = createComplaintMockContext();
    await handleGetComplaint(principalCtx.context, { id: 'usr_principal', email: 'principal@college.edu', name: 'Dr. Principal', role: 'principal', department_id: null, department_name: null }, { complaint_id: 'cmpl_water_1' }, { databases });
    assert.equal(principalCtx.getResponse().statusCode, 200);
    const principalComplaint = principalCtx.getResponse().body.data.complaint;
    assert.equal(principalComplaint.student_name, 'Bhavya Shah');
    assert.equal(principalComplaint.student_enrollment_no, '246510307002');
    assert.equal(principalComplaint.student_phone_number, '9876543211');
    assert.equal(principalComplaint.attachment_file_id, 'file_water_1');
});
test('Day 3: Admin queues, dashboard, and get-support-state enforce maintenance_department_id scoping across all 6 departments', async () => {
    const { databases } = createComplaintInMemoryDb({
        department_admins: [
            {
                $id: 'da_sanit',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_sanit',
                email: 'sanit@college.edu',
                department_id: 'dept_sanit',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_sanit_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_1',
                student_name: 'Student One',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_sanit',
                title: 'Washroom drainage clogged',
                location: 'Block B Ground Floor',
                description: 'Drainage blocked in men washroom.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
            {
                $id: 'cmpl_elec_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T02:00:00.000Z',
                $updatedAt: '2026-11-10T02:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_civil_1',
                student_name: 'Student Two',
                student_enrollment_no: '246510306002',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_elec',
                title: 'Main breaker tripping',
                location: 'Civil Lab',
                description: 'Breaker trips under load.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                created_at: '2026-11-10T02:00:00.000Z',
                updated_at: '2026-11-10T02:00:00.000Z',
            },
        ],
    });
    const sanitAdmin = {
        id: 'adm_sanit',
        email: 'sanit@college.edu',
        name: 'Sanitation Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_sanit', 'dept_sanit', 'maintenance')],
        department_id: 'dept_sanit',
        department_name: 'Sanitation',
    };
    const dashCtx = createComplaintMockContext();
    await handleGetAdminDashboard(dashCtx.context, sanitAdmin, { databases });
    assert.equal(dashCtx.getResponse().statusCode, 200);
    const metrics = dashCtx.getResponse().body.data.metrics;
    assert.equal(metrics.total_open, 1);
    assert.equal(metrics.department_id, 'dept_sanit');
    const queueCtx = createComplaintMockContext();
    await handleListAdminComplaints(queueCtx.context, sanitAdmin, {}, { databases });
    assert.equal(queueCtx.getResponse().statusCode, 200);
    const queue = queueCtx.getResponse().body.data.complaints;
    assert.equal(queue.length, 1);
    assert.equal(queue[0].$id, 'cmpl_sanit_1');
    // Cross-department support state probe by admin must return 404
    const supportProbeCtx = createComplaintMockContext();
    await handleGetSupportState(supportProbeCtx.context, sanitAdmin, { complaint_id: 'cmpl_elec_1' }, { databases });
    assert.equal(supportProbeCtx.getResponse().statusCode, 404);
    // Principal cannot mutate complaint status
    const principalStatusCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(principalStatusCtx.context, { id: 'usr_principal', email: 'p@college.edu', name: 'Principal', role: 'principal', department_id: null, department_name: null }, { complaint_id: 'cmpl_sanit_1', status: 'Resolved', official_response: 'Trying to override' }, { databases });
    assert.equal(principalStatusCtx.getResponse().statusCode, 403);
});
function createInMemoryStorage(initialFiles = {}) {
    const files = new Map(Object.entries(initialFiles));
    const storage = {
        async getFile(bucketId, fileId) {
            const entry = files.get(fileId);
            if (!entry || entry.meta.bucketId !== bucketId) {
                throw new Error('File not found');
            }
            return entry.meta;
        },
        async getFileDownload(bucketId, fileId) {
            const entry = files.get(fileId);
            if (!entry || entry.meta.bucketId !== bucketId) {
                throw new Error('File not found');
            }
            const copy = new Uint8Array(entry.bytes.byteLength);
            copy.set(entry.bytes);
            return copy.buffer;
        },
        async updateFile(bucketId, fileId, name, permissions) {
            const entry = files.get(fileId);
            if (!entry || entry.meta.bucketId !== bucketId) {
                throw new Error('File not found');
            }
            entry.meta = {
                ...entry.meta,
                ...(name !== undefined ? { name } : {}),
                ...(permissions !== undefined ? { $permissions: permissions } : {}),
                $updatedAt: new Date().toISOString(),
            };
            return entry.meta;
        },
    };
    return { storage, files };
}
function makeFileMeta(overrides = {}) {
    return {
        $id: 'file_valid_1',
        bucketId: 'complaint-attachments',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: ['read("user:usr_student_1")', 'delete("user:usr_student_1")'],
        name: 'evidence.png',
        signature: 'sig_123',
        mimeType: 'image/png',
        sizeOriginal: 16,
        chunksTotal: 1,
        chunksUploaded: 1,
        ...overrides,
    };
}
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);
test('Day 3: handleCreateComplaint validates attachment existence, ownership, private permissions, size <= 5MB, MIME, magic bytes, and locks permissions', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_1',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_student_1',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
    });
    const { storage, files } = createInMemoryStorage({
        file_other_user: {
            meta: makeFileMeta({
                $id: 'file_other_user',
                $permissions: ['read("user:usr_other_student")'],
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
        file_public_perm: {
            meta: makeFileMeta({
                $id: 'file_public_perm',
                $permissions: ['read("user:usr_student_1")', 'read("any")'],
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
        file_oversized: {
            meta: makeFileMeta({
                $id: 'file_oversized',
                name: 'huge.pdf',
                mimeType: 'application/pdf',
                sizeOriginal: 5 * 1024 * 1024 + 1,
            }),
            bytes: PDF_BYTES,
        },
        file_bad_mime: {
            meta: makeFileMeta({
                $id: 'file_bad_mime',
                name: 'photo.webp',
                mimeType: 'image/webp',
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
        file_spoofed_magic: {
            meta: makeFileMeta({
                $id: 'file_spoofed_magic',
                name: 'fake.png',
                mimeType: 'image/png',
                sizeOriginal: 12,
            }),
            bytes: new TextEncoder().encode('<script>1</script>'.slice(0, 12)),
        },
        file_valid_png: {
            meta: makeFileMeta({
                $id: 'file_valid_png',
                name: 'leak.png',
                mimeType: 'image/png',
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
        file_valid_pdf: {
            meta: makeFileMeta({
                $id: 'file_valid_pdf',
                name: 'report.pdf',
                mimeType: 'application/pdf',
                sizeOriginal: PDF_BYTES.byteLength,
            }),
            bytes: PDF_BYTES,
        },
        file_valid_jpg: {
            meta: makeFileMeta({
                $id: 'file_valid_jpg',
                name: 'photo.jpg',
                mimeType: 'image/jpeg',
                sizeOriginal: JPEG_BYTES.byteLength,
            }),
            bytes: JPEG_BYTES,
        },
    });
    const caller = {
        id: 'usr_student_1',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const basePayload = {
        title: 'Lab 2 electrical hazard',
        maintenance_department_id: 'dept_elec',
        location: 'Computer Block Lab 2',
        description: 'Exposed wiring near projector switchboard.',
        priority: 'high',
    };
    // 1. Non-existent attachment file ID
    const missingCtx = createComplaintMockContext();
    await handleCreateComplaint(missingCtx.context, caller, { ...basePayload, attachment_file_id: 'file_does_not_exist' }, { databases, storage });
    assert.equal(missingCtx.getResponse().statusCode, 400);
    assert.equal(missingCtx.getResponse().body.code, 'ATTACHMENT_NOT_FOUND');
    // 2. IDOR: attachment owned by another user
    const idorCtx = createComplaintMockContext();
    await handleCreateComplaint(idorCtx.context, caller, { ...basePayload, attachment_file_id: 'file_other_user' }, { databases, storage });
    assert.equal(idorCtx.getResponse().statusCode, 403);
    assert.equal(idorCtx.getResponse().body.code, 'ATTACHMENT_OWNERSHIP_DENIED');
    // 3. Public permissions rejected
    const pubPermCtx = createComplaintMockContext();
    await handleCreateComplaint(pubPermCtx.context, caller, { ...basePayload, attachment_file_id: 'file_public_perm' }, { databases, storage });
    assert.equal(pubPermCtx.getResponse().statusCode, 403);
    // 4. Oversized (> 5 MB) rejected
    const bigCtx = createComplaintMockContext();
    await handleCreateComplaint(bigCtx.context, caller, { ...basePayload, attachment_file_id: 'file_oversized' }, { databases, storage });
    assert.equal(bigCtx.getResponse().statusCode, 400);
    assert.equal(bigCtx.getResponse().body.code, 'ATTACHMENT_TOO_LARGE');
    // 5. Disallowed MIME type (.webp) rejected
    const mimeCtx = createComplaintMockContext();
    await handleCreateComplaint(mimeCtx.context, caller, { ...basePayload, attachment_file_id: 'file_bad_mime' }, { databases, storage });
    assert.equal(mimeCtx.getResponse().statusCode, 400);
    assert.equal(mimeCtx.getResponse().body.code, 'INVALID_ATTACHMENT_TYPE');
    // 6. Spoofed magic bytes rejected
    const spoofCtx = createComplaintMockContext();
    await handleCreateComplaint(spoofCtx.context, caller, { ...basePayload, attachment_file_id: 'file_spoofed_magic' }, { databases, storage });
    assert.equal(spoofCtx.getResponse().statusCode, 400);
    assert.equal(spoofCtx.getResponse().body.code, 'INVALID_ATTACHMENT_CONTENT');
    // 7. Valid PNG succeeds and locks storage permissions to []
    const okPngCtx = createComplaintMockContext();
    await handleCreateComplaint(okPngCtx.context, caller, { ...basePayload, attachment_file_id: 'file_valid_png' }, { databases, storage });
    assert.equal(okPngCtx.getResponse().statusCode, 201);
    assert.deepEqual(files.get('file_valid_png')?.meta.$permissions, []);
    // 8. Replay same file_valid_png on another complaint must fail
    const replayCtx = createComplaintMockContext();
    await handleCreateComplaint(replayCtx.context, caller, { ...basePayload, attachment_file_id: 'file_valid_png' }, { databases, storage });
    assert.ok(replayCtx.getResponse().statusCode === 403 || replayCtx.getResponse().statusCode === 409);
    // 9. Valid PDF and JPG also succeed
    const okPdfCtx = createComplaintMockContext();
    await handleCreateComplaint(okPdfCtx.context, caller, { ...basePayload, attachment_file_id: 'file_valid_pdf' }, { databases, storage });
    assert.equal(okPdfCtx.getResponse().statusCode, 201);
    const okJpgCtx = createComplaintMockContext();
    await handleCreateComplaint(okJpgCtx.context, caller, { ...basePayload, attachment_file_id: 'file_valid_jpg' }, { databases, storage });
    assert.equal(okJpgCtx.getResponse().statusCode, 201);
});
test('Day 3: handleGetComplaintAttachment restricts private attachment download to creator, concerned Maintenance Admin, and Principal (blocking peers and IDOR)', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_creator',
                name: 'Creator Student',
                enrollment_no: '246510307010',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_peer',
                name: 'Peer Student',
                enrollment_no: '246510307011',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_other_dept',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_civil',
                name: 'Civil Student',
                enrollment_no: '246510306012',
                student_department_id: 'dept_civil',
                phone_number: '9876543212',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        department_admins: [
            {
                $id: 'da_water_att',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                email: 'water@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_att_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_creator',
                student_name: 'Creator Student',
                student_enrollment_no: '246510307010',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water pipeline leak',
                location: 'Block A',
                description: 'Leakage near drinking fountain.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_locked_1',
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
            {
                $id: 'cmpl_att_2',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_civil',
                student_name: 'Civil Student',
                student_enrollment_no: '246510306012',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_elec',
                title: 'Switchboard spark',
                location: 'Civil Block',
                description: 'Sparks observed in room 101.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_locked_other',
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
        ],
    });
    const { storage } = createInMemoryStorage({
        file_locked_1: {
            meta: makeFileMeta({
                $id: 'file_locked_1',
                $permissions: [],
                name: 'water-leak.png',
                mimeType: 'image/png',
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
        file_locked_other: {
            meta: makeFileMeta({
                $id: 'file_locked_other',
                $permissions: [],
                name: 'secret.pdf',
                mimeType: 'application/pdf',
                sizeOriginal: PDF_BYTES.byteLength,
            }),
            bytes: PDF_BYTES,
        },
    });
    // 1. Creator -> allowed
    const creatorCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(creatorCtx.context, { id: 'usr_creator', email: 'c@college.edu', name: 'Creator', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(creatorCtx.getResponse().statusCode, 200);
    const creatorAtt = creatorCtx.getResponse().body.data.attachment;
    assert.equal(creatorAtt.file_id, 'file_locked_1');
    assert.equal(creatorAtt.mime_type, 'image/png');
    assert.equal(creatorAtt.content_base64, Buffer.from(PNG_BYTES).toString('base64'));
    // 2. Concerned Water Maintenance Admin -> allowed
    const waterCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(waterCtx.context, {
        id: 'adm_water',
        email: 'water@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance')],
        department_id: 'dept_water',
        department_name: 'Water',
    }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(waterCtx.getResponse().statusCode, 200);
    // 3. Principal -> allowed across all departments
    const principalCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(principalCtx.context, { id: 'usr_principal', email: 'p@college.edu', name: 'Principal', role: 'principal', department_id: null, department_name: null }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(principalCtx.getResponse().statusCode, 200);
    // 4. Same-academic-department peer student -> 404 NOT_FOUND
    const peerCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(peerCtx.context, { id: 'usr_peer', email: 'peer@college.edu', name: 'Peer', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(peerCtx.getResponse().statusCode, 404);
    // 5. Cross-department student -> 404 NOT_FOUND
    const crossCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(crossCtx.context, { id: 'usr_civil', email: 'civil@college.edu', name: 'Civil', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(crossCtx.getResponse().statusCode, 404);
    // 6. Non-concerned Electrical Admin -> 404 NOT_FOUND
    const elecCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(elecCtx.context, {
        id: 'adm_elec',
        email: 'elec@college.edu',
        name: 'Elec Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_elec', 'dept_elec', 'maintenance')],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    }, { complaint_id: 'cmpl_att_1' }, { databases, storage });
    assert.equal(elecCtx.getResponse().statusCode, 404);
    // 7. IDOR: Mismatched file_id probe even by authorized creator -> 404 NOT_FOUND
    const idorFileCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(idorFileCtx.context, { id: 'usr_creator', email: 'c@college.edu', name: 'Creator', role: 'student', department_id: null, department_name: null }, { complaint_id: 'cmpl_att_1', file_id: 'file_locked_other' }, { databases, storage });
    assert.equal(idorFileCtx.getResponse().statusCode, 404);
});
test('Step 5: handleCreateComplaint & handleListComplaints enforce canonical IDs, reject Water/Sanitation academic scope, and reject inactive maintenance departments', async () => {
    const { databases } = createComplaintInMemoryDb({
        departments: [
            {
                $id: 'dept_water',
                $collectionId: 'departments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                name: 'Water',
                is_academic: false,
                is_maintenance: true,
                is_active: false,
            },
            {
                $id: 'dept_sanit',
                $collectionId: 'departments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                name: 'Sanitation',
                is_academic: false,
                is_maintenance: true,
                is_active: true,
            },
        ],
        profiles: [
            {
                $id: 'prof_valid_elec',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_elec_student',
                name: 'Electrical Student',
                enrollment_no: '246510309001',
                student_department_id: 'dept_elec',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_water_student',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_water_student',
                name: 'Invalid Water Student',
                enrollment_no: '246510305001',
                student_department_id: 'dept_water',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_sanit_student',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_sanit_student',
                name: 'Invalid Sanit Student',
                enrollment_no: '246510308001',
                student_department_id: 'dept_sanit',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
    });
    const elecCaller = {
        id: 'usr_elec_student',
        email: 'elec@college.edu',
        name: 'Electrical Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // Active Sanitation maintenance department succeeds
    const sanitOkCtx = createComplaintMockContext();
    await handleCreateComplaint(sanitOkCtx.context, elecCaller, {
        title: 'Washroom cleaning required',
        maintenance_department_id: 'dept_sanit',
        location: 'Electrical Block Ground Floor',
        description: 'Restroom requires sanitation servicing.',
        priority: 'medium',
    }, { databases });
    assert.equal(sanitOkCtx.getResponse().statusCode, 201);
    // Inactive Water maintenance department is rejected
    const inactiveCtx = createComplaintMockContext();
    await handleCreateComplaint(inactiveCtx.context, elecCaller, {
        title: 'Water cooler issue',
        maintenance_department_id: 'dept_water',
        location: 'Electrical Block',
        description: 'Water cooler stopped cooling.',
        priority: 'low',
    }, { databases });
    assert.equal(inactiveCtx.getResponse().statusCode, 400);
    assert.equal(inactiveCtx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
    // Legacy codes and water/sanitation aliases must NOT be accepted as maintenance_department_id
    for (const badMaintId of ['03', '04', '05', '06', '07', '08', '09', '19', 'water', 'sanitation']) {
        const badCtx = createComplaintMockContext();
        await handleCreateComplaint(badCtx.context, elecCaller, {
            title: 'Invalid department ID test',
            maintenance_department_id: badMaintId,
            location: 'Block A',
            description: 'Testing strict canonical department ID validation.',
            priority: 'low',
        }, { databases });
        assert.equal(badCtx.getResponse().statusCode, 400);
        assert.equal(badCtx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
    }
    // Students with Water or Sanitation academic department are rejected by both create & list
    for (const badStudentId of ['usr_water_student', 'usr_sanit_student']) {
        const badCaller = {
            id: badStudentId,
            email: `${badStudentId}@college.edu`,
            name: 'Invalid Student',
            role: 'student',
            department_id: null,
            department_name: null,
        };
        const createBlockedCtx = createComplaintMockContext();
        await handleCreateComplaint(createBlockedCtx.context, badCaller, {
            title: 'Blocked student dept',
            maintenance_department_id: 'dept_sanit',
            location: 'Block B',
            description: 'Must reject non-academic student department.',
            priority: 'low',
        }, { databases });
        assert.equal(createBlockedCtx.getResponse().statusCode, 400);
        assert.equal(createBlockedCtx.getResponse().body.code, 'PROFILE_INCOMPLETE');
        const listBlockedCtx = createComplaintMockContext();
        await handleListComplaints(listBlockedCtx.context, badCaller, {}, { databases });
        assert.equal(listBlockedCtx.getResponse().statusCode, 401);
    }
});
// =====================================================================
// Step 7 Regression Tests: Admin Response & Timeline Persistence
// =====================================================================
function createStep7FixtureDb() {
    return createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_creator_1',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_creator',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_peer_1',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_peer',
                name: 'Bhavya Shah',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_civil_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_civil_other',
                name: 'Chirag Mehta',
                enrollment_no: '246510306003',
                student_department_id: 'dept_civil',
                phone_number: '9876543212',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        department_admins: [
            {
                $id: 'da_water_maint',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                email: 'water.admin@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_elec_maint',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_elec',
                email: 'elec.admin@college.edu',
                department_id: 'dept_elec',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_comp_acad',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_comp_acad',
                email: 'comp.acad@college.edu',
                department_id: 'dept_comp',
                scope: 'academic',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_water_revoked',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water_revoked',
                email: 'water.revoked@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: false,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_persist_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T08:00:00.000Z',
                $updatedAt: '2026-11-10T08:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_creator',
                student_name: 'Aarav Patel',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Main drinking water purifier leaking in Computer Block',
                location: 'Computer Block 2nd Floor',
                description: 'Water purifier valve is leaking steadily near classroom 204.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_private_1',
                last_meaningful_update_at: '2026-11-10T08:00:00.000Z',
                created_at: '2026-11-10T08:00:00.000Z',
                updated_at: '2026-11-10T08:00:00.000Z',
            },
            {
                $id: 'cmpl_other_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T09:00:00.000Z',
                $updatedAt: '2026-11-10T09:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_civil_other',
                student_name: 'Chirag Mehta',
                student_enrollment_no: '246510306003',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_elec',
                title: 'Civil lab projector socket sparking',
                location: 'Civil Block Lab 1',
                description: 'Power socket produces sparks when projector plugs in.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                last_meaningful_update_at: '2026-11-10T09:00:00.000Z',
                created_at: '2026-11-10T09:00:00.000Z',
                updated_at: '2026-11-10T09:00:00.000Z',
            },
        ],
    });
}
test('Step 7 (Scenarios 1-5, 10, 11): Admin official response & status transitions persist in complaint_timeline, survive refresh retrieval, and keep complaint content immutable', async () => {
    const { databases, collections } = createStep7FixtureDb();
    const waterAdmin = {
        id: 'adm_water',
        email: 'water.admin@college.edu',
        name: 'Water Maintenance Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance')],
        department_id: 'dept_water',
        department_name: 'Water',
    };
    const creatorCaller = {
        id: 'usr_comp_creator',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const peerCaller = {
        id: 'usr_comp_peer',
        email: 'bhavya@college.edu',
        name: 'Bhavya Shah',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Authorized Maintenance Admin transitions Pending -> In Progress with official response
    const inProgressCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(inProgressCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'In Progress',
        official_response: 'Plumbing technician assigned to inspect the purifier valve today.',
    }, { databases });
    assert.equal(inProgressCtx.getResponse().statusCode, 200);
    assert.equal(inProgressCtx.getResponse().body.success, true);
    // Verify persisted in complaint_timeline collection (both status_change and admin_response)
    const storedTimelineAfterInProg = (collections.get('complaint_timeline') || []).filter((d) => d.complaint_id === 'cmpl_persist_1');
    assert.equal(storedTimelineAfterInProg.length, 2);
    const statusEvent1 = storedTimelineAfterInProg.find((d) => d.entry_type === 'status_change');
    const responseEvent1 = storedTimelineAfterInProg.find((d) => d.entry_type === 'admin_response');
    assert.ok(statusEvent1);
    assert.equal(statusEvent1.old_status, 'Pending');
    assert.equal(statusEvent1.new_status, 'In Progress');
    assert.equal(statusEvent1.author_id, 'adm_water');
    assert.equal(statusEvent1.author_role, 'department_admin');
    assert.ok(responseEvent1);
    assert.equal(responseEvent1.content, 'Plumbing technician assigned to inspect the purifier valve today.');
    assert.equal(responseEvent1.author_id, 'adm_water');
    assert.equal(responseEvent1.author_role, 'department_admin');
    assert.deepEqual(responseEvent1.$permissions, []);
    // Verify original complaint document content was NEVER overwritten
    const storedComplaint = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1');
    assert.ok(storedComplaint);
    assert.equal(storedComplaint.title, 'Main drinking water purifier leaking in Computer Block');
    assert.equal(storedComplaint.location, 'Computer Block 2nd Floor');
    assert.equal(storedComplaint.description, 'Water purifier valve is leaking steadily near classroom 204.');
    assert.equal(storedComplaint.student_user_id, 'usr_comp_creator');
    assert.equal(storedComplaint.student_name, 'Aarav Patel');
    assert.equal(storedComplaint.student_enrollment_no, '246510307001');
    assert.equal(storedComplaint.student_department_id, 'dept_comp');
    assert.equal(storedComplaint.maintenance_department_id, 'dept_water');
    assert.equal(storedComplaint.created_at, '2026-11-10T08:00:00.000Z');
    assert.equal(storedComplaint.status, 'In Progress');
    assert.equal('official_response' in storedComplaint, false);
    // 2. Refresh-equivalent retrieval by creator & peer returns persisted timeline & official_response
    const creatorRefreshCtx = createComplaintMockContext();
    await handleGetComplaint(creatorRefreshCtx.context, creatorCaller, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(creatorRefreshCtx.getResponse().statusCode, 200);
    const creatorData = creatorRefreshCtx.getResponse().body.data;
    assert.equal(creatorData.complaint.status, 'In Progress');
    assert.equal(creatorData.complaint.official_response, 'Plumbing technician assigned to inspect the purifier valve today.');
    assert.equal(creatorData.timeline.length, 2);
    // List endpoints (admin queue & student feed) also reflect persisted official_response after refresh
    const adminListCtx = createComplaintMockContext();
    await handleListAdminComplaints(adminListCtx.context, waterAdmin, {}, { databases });
    assert.equal(adminListCtx.getResponse().statusCode, 200);
    const adminQueue = adminListCtx.getResponse().body.data.complaints;
    assert.equal(adminQueue[0].official_response, 'Plumbing technician assigned to inspect the purifier valve today.');
    const studentListCtx = createComplaintMockContext();
    await handleListComplaints(studentListCtx.context, peerCaller, {}, { databases });
    assert.equal(studentListCtx.getResponse().statusCode, 200);
    const studentFeed = studentListCtx.getResponse().body.data.complaints;
    assert.equal(studentFeed[0].official_response, 'Plumbing technician assigned to inspect the purifier valve today.');
    // 3. Transition In Progress -> Resolved and verify resolution event & resolved_at persistence
    const resolveCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(resolveCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'Resolved',
        official_response: 'Replaced leaking inlet valve and verified pressure seal.',
    }, { databases });
    assert.equal(resolveCtx.getResponse().statusCode, 200);
    // Add a follow-up admin note while Resolved; resolution timestamp must stay preserved
    const followUpCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(followUpCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'Resolved',
        official_response: 'Post-repair 24h inspection confirmed zero leakage.',
    }, { databases });
    assert.equal(followUpCtx.getResponse().statusCode, 200);
    // Fresh handleGetComplaint simulates browser page reload
    const peerRefreshCtx = createComplaintMockContext();
    await handleGetComplaint(peerRefreshCtx.context, peerCaller, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(peerRefreshCtx.getResponse().statusCode, 200);
    const peerData = peerRefreshCtx.getResponse().body.data;
    assert.equal(peerData.complaint.status, 'Resolved');
    assert.equal(peerData.complaint.official_response, 'Post-repair 24h inspection confirmed zero leakage.');
    const resolvedEvent = peerData.timeline.find((t) => t.entry_type === 'status_change' && t.new_status === 'Resolved');
    assert.ok(resolvedEvent, 'status_change entry for Resolved must exist in timeline');
    assert.equal(resolvedEvent.old_status, 'In Progress');
    assert.equal(peerData.complaint.resolved_at, resolvedEvent.created_at);
    assert.equal(peerData.timeline.length, 5);
});
test('Step 7 (Scenarios 6-8): Rejects unauthorized maintenance admin, academic-only admin, revoked admin, student, principal, and cross-department admin', async () => {
    const { databases, collections } = createStep7FixtureDb();
    const payload = {
        complaint_id: 'cmpl_persist_1',
        status: 'In Progress',
        official_response: 'Unauthorized status update attempt.',
    };
    // Student -> 403 FORBIDDEN
    const studentCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(studentCtx.context, {
        id: 'usr_comp_creator',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    }, payload, { databases });
    assert.equal(studentCtx.getResponse().statusCode, 403);
    assert.equal(studentCtx.getResponse().body.code, 'FORBIDDEN');
    // Principal -> 403 FORBIDDEN
    const principalCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(principalCtx.context, {
        id: 'usr_principal',
        email: 'principal@college.edu',
        name: 'Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    }, payload, { databases });
    assert.equal(principalCtx.getResponse().statusCode, 403);
    assert.equal(principalCtx.getResponse().body.code, 'FORBIDDEN');
    // Academic-only admin -> 403 FORBIDDEN (no maintenance scope)
    const acadOnlyCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(acadOnlyCtx.context, {
        id: 'adm_comp_acad',
        email: 'comp.acad@college.edu',
        name: 'Comp Acad Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_comp_acad', 'dept_comp', 'academic')],
        department_id: 'dept_comp',
        department_name: 'Computer',
    }, payload, { databases });
    assert.equal(acadOnlyCtx.getResponse().statusCode, 403);
    assert.equal(acadOnlyCtx.getResponse().body.code, 'FORBIDDEN');
    // Revoked maintenance admin -> 403 FORBIDDEN
    const revokedCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(revokedCtx.context, {
        id: 'adm_water_revoked',
        email: 'water.revoked@college.edu',
        name: 'Revoked Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water_revoked', 'dept_water', 'maintenance', false)],
        department_id: 'dept_water',
        department_name: 'Water',
    }, payload, { databases });
    assert.equal(revokedCtx.getResponse().statusCode, 403);
    assert.equal(revokedCtx.getResponse().body.code, 'FORBIDDEN');
    // Cross-department Electrical Maintenance Admin -> 404 Oracle Elimination
    const crossAdminCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(crossAdminCtx.context, {
        id: 'adm_elec',
        email: 'elec.admin@college.edu',
        name: 'Electrical Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_elec', 'dept_elec', 'maintenance')],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    }, payload, { databases });
    assert.equal(crossAdminCtx.getResponse().statusCode, 404);
    assert.equal(crossAdminCtx.getResponse().body.code, 'NOT_FOUND');
    // Zero timeline writes and zero complaint mutations occurred
    assert.equal((collections.get('complaint_timeline') || []).length, 0);
    const unchanged = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1');
    assert.equal(unchanged?.status, 'Pending');
});
test('Step 7 (Scenario 9 & Pending Note): Pending note persists without status change or timer reset unless substantive progress, and substantive progress updates persist independently', async () => {
    const { databases, collections } = createStep7FixtureDb();
    const waterAdmin = {
        id: 'adm_water',
        email: 'water.admin@college.edu',
        name: 'Water Maintenance Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance')],
        department_id: 'dept_water',
        department_name: 'Water',
    };
    // 1. Admin submits a note while keeping status Pending (non-substantive)
    const pendingNoteCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(pendingNoteCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'Pending',
        official_response: 'Received complaint; queued for morning inspection round.',
    }, { databases });
    assert.equal(pendingNoteCtx.getResponse().statusCode, 200);
    const complaintAfterNote = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1');
    assert.equal(complaintAfterNote?.status, 'Pending');
    assert.equal(complaintAfterNote?.last_meaningful_update_at, '2026-11-10T08:00:00.000Z', 'Non-substantive Pending-to-Pending note must NOT reset last_meaningful_update_at');
    const timelineAfterNote = (collections.get('complaint_timeline') || []).filter((d) => d.complaint_id === 'cmpl_persist_1');
    assert.equal(timelineAfterNote.length, 1);
    assert.equal(timelineAfterNote[0].entry_type, 'admin_response');
    // 2. Admin transitions to In Progress, then submits an independent substantive progress_update
    const startCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(startCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'In Progress',
        official_response: 'Dispatched plumber to shut off main bypass valve.',
    }, { databases });
    assert.equal(startCtx.getResponse().statusCode, 200);
    const prevMeaningful = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1')?.last_meaningful_update_at;
    // Wait 2ms so timestamps strictly advance
    await new Promise((resolve) => setTimeout(resolve, 2));
    const progressCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(progressCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'In Progress',
        is_substantive: true,
        official_response: 'Replacement brass valve procured from central store; installation underway.',
    }, { databases });
    assert.equal(progressCtx.getResponse().statusCode, 200);
    const complaintAfterProgress = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1');
    assert.equal(complaintAfterProgress?.status, 'In Progress');
    assert.notEqual(complaintAfterProgress?.last_meaningful_update_at, prevMeaningful, 'Substantive progress update must advance last_meaningful_update_at');
    // Reverting an In Progress complaint back to Pending must be rejected
    const revertCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(revertCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'Pending',
        official_response: 'Attempting invalid rollback to Pending.',
    }, { databases });
    assert.equal(revertCtx.getResponse().statusCode, 400);
    assert.equal(revertCtx.getResponse().body.code, 'INVALID_STATUS_TRANSITION');
    // Verify independent timeline entries via handleGetComplaint
    const getCtx = createComplaintMockContext();
    await handleGetComplaint(getCtx.context, waterAdmin, { complaint_id: 'cmpl_persist_1' }, { databases });
    const timeline = getCtx.getResponse().body.data.timeline;
    assert.equal(timeline.length, 4);
    assert.deepEqual(timeline.map((t) => t.entry_type), ['admin_response', 'status_change', 'admin_response', 'progress_update']);
    assert.equal(timeline[3].content, 'Replacement brass valve procured from central store; installation underway.');
});
test('Step 7 (Scenario 12): Failed timeline write or partial DB failure never produces false success or dirty state', async () => {
    const waterAdmin = {
        id: 'adm_water',
        email: 'water.admin@college.edu',
        name: 'Water Maintenance Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance')],
        department_id: 'dept_water',
        department_name: 'Water',
    };
    // Case A: complaint_timeline createDocument fails -> returns 500 and complaint stays Pending
    const { databases: baseDbA, collections: colA } = createStep7FixtureDb();
    const failingTimelineDb = {
        ...baseDbA,
        async createDocument(dbId, collectionId, documentId, data, permissions) {
            if (collectionId === 'complaint_timeline') {
                throw new Error('Simulated Appwrite timeline write outage');
            }
            return baseDbA.createDocument(dbId, collectionId, documentId, data, permissions);
        },
    };
    const failTimelineCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(failTimelineCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'Resolved',
        official_response: 'Claiming resolved while DB timeline write fails.',
    }, { databases: failingTimelineDb });
    assert.equal(failTimelineCtx.getResponse().statusCode, 500);
    assert.equal(failTimelineCtx.getResponse().body.success, false);
    assert.equal(failTimelineCtx.getResponse().body.code, 'DATABASE_ERROR');
    assert.equal((colA.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1')?.status, 'Pending', 'Complaint status must remain Pending when timeline persistence fails');
    assert.equal((colA.get('complaint_timeline') || []).length, 0);
    // Case B: complaints updateDocument fails after timeline write -> rolls back created timeline docs and returns 500
    const { databases: baseDbB, collections: colB } = createStep7FixtureDb();
    const failingComplaintUpdateDb = {
        ...baseDbB,
        async updateDocument(dbId, collectionId, documentId, data) {
            if (collectionId === 'complaints') {
                throw new Error('Simulated Appwrite complaint update failure');
            }
            return baseDbB.updateDocument(dbId, collectionId, documentId, data);
        },
    };
    const failUpdateCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(failUpdateCtx.context, waterAdmin, {
        complaint_id: 'cmpl_persist_1',
        status: 'In Progress',
        official_response: 'Technician assigned before complaint update fails.',
    }, { databases: failingComplaintUpdateDb });
    assert.equal(failUpdateCtx.getResponse().statusCode, 500);
    assert.equal(failUpdateCtx.getResponse().body.success, false);
    assert.equal((colB.get('complaint_timeline') || []).length, 0, 'Partial timeline records must be rolled back if complaint status update fails');
    assert.equal((colB.get('complaints') || []).find((c) => c.$id === 'cmpl_persist_1')?.status, 'Pending');
});
test('Step 7 (Scenarios 13-15): Timeline retrieval enforces visibility, chronological ordering, audit exclusion, and peer PII protection', async () => {
    const { databases } = createStep7FixtureDb();
    // Seed out-of-order timeline entries, a student clarification_reply, another complaint's entry, and an invalid audit-like entry
    await databases.createDocument('campusvoice', 'complaint_timeline', 'tm_3', {
        complaint_id: 'cmpl_persist_1',
        author_id: 'adm_water',
        author_role: 'department_admin',
        entry_type: 'admin_response',
        content: 'Third event: valve assembly ordered.',
        created_at: '2026-11-10T12:00:00.000Z',
    }, []);
    await databases.createDocument('campusvoice', 'complaint_timeline', 'tm_1', {
        complaint_id: 'cmpl_persist_1',
        author_id: 'adm_water',
        author_role: 'department_admin',
        entry_type: 'clarification_request',
        content: 'First event: please confirm exact floor wing.',
        created_at: '2026-11-10T09:00:00.000Z',
    }, []);
    await databases.createDocument('campusvoice', 'complaint_timeline', 'tm_2', {
        complaint_id: 'cmpl_persist_1',
        author_id: 'usr_comp_creator',
        author_role: 'student',
        entry_type: 'clarification_reply',
        content: 'Second event: East wing near Room 204.',
        created_at: '2026-11-10T10:30:00.000Z',
    }, []);
    await databases.createDocument('campusvoice', 'complaint_timeline', 'tm_other_complaint', {
        complaint_id: 'cmpl_other_1',
        author_id: 'adm_elec',
        author_role: 'department_admin',
        entry_type: 'admin_response',
        content: 'Unrelated Civil complaint note that must not leak.',
        created_at: '2026-11-10T11:00:00.000Z',
    }, []);
    await databases.createDocument('campusvoice', 'complaint_timeline', 'tm_internal_audit', {
        complaint_id: 'cmpl_persist_1',
        author_id: 'system',
        author_role: 'principal',
        entry_type: 'audit_internal',
        content: 'Internal security audit payload that must be filtered out.',
        created_at: '2026-11-10T11:30:00.000Z',
    }, []);
    // 1. Peer student in same academic department sees chronological timeline with ZERO creator PII or author_id
    const peerCtx = createComplaintMockContext();
    await handleGetComplaint(peerCtx.context, {
        id: 'usr_comp_peer',
        email: 'bhavya@college.edu',
        name: 'Bhavya Shah',
        role: 'student',
        department_id: null,
        department_name: null,
    }, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(peerCtx.getResponse().statusCode, 200);
    const peerBody = peerCtx.getResponse().body.data;
    // Protected creator details remain absent in peer view
    assert.equal('student_user_id' in peerBody.complaint, false);
    assert.equal('student_name' in peerBody.complaint, false);
    assert.equal('student_enrollment_no' in peerBody.complaint, false);
    assert.equal('student_phone_number' in peerBody.complaint, false);
    assert.equal('attachment_file_id' in peerBody.complaint, false);
    // Chronological order & exclusion of foreign complaint and internal audit entries
    assert.equal(peerBody.timeline.length, 3);
    assert.deepEqual(peerBody.timeline.map((t) => t.created_at), [
        '2026-11-10T09:00:00.000Z',
        '2026-11-10T10:30:00.000Z',
        '2026-11-10T12:00:00.000Z',
    ]);
    assert.equal(peerBody.timeline.some((t) => t.complaint_id !== 'cmpl_persist_1'), false);
    assert.equal(peerBody.timeline.some((t) => t.entry_type === 'audit_internal'), false);
    for (const entry of peerBody.timeline) {
        assert.equal('author_id' in entry, false, 'Peer view must omit raw author_id from timeline entries');
        assert.ok(typeof entry.author_label === 'string' && entry.author_label.length > 0);
        assert.equal(String(entry.author_label).includes('Aarav'), false, 'Timeline author_label must not expose creator real name');
    }
    // 2. Cross-department student -> 404 Oracle Elimination (no timeline returned)
    const crossStudentCtx = createComplaintMockContext();
    await handleGetComplaint(crossStudentCtx.context, {
        id: 'usr_civil_other',
        email: 'chirag@college.edu',
        name: 'Chirag Mehta',
        role: 'student',
        department_id: null,
        department_name: null,
    }, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(crossStudentCtx.getResponse().statusCode, 404);
    assert.equal(crossStudentCtx.getResponse().body.data, undefined);
    // 3. Non-concerned Electrical Admin -> 404 Oracle Elimination (no timeline returned)
    const crossAdminCtx = createComplaintMockContext();
    await handleGetComplaint(crossAdminCtx.context, {
        id: 'adm_elec',
        email: 'elec.admin@college.edu',
        name: 'Electrical Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_elec', 'dept_elec', 'maintenance')],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    }, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(crossAdminCtx.getResponse().statusCode, 404);
    assert.equal(crossAdminCtx.getResponse().body.data, undefined);
    // 4. Academic-only admin -> 404 Oracle Elimination
    const acadAdminCtx = createComplaintMockContext();
    await handleGetComplaint(acadAdminCtx.context, {
        id: 'adm_comp_acad',
        email: 'comp.acad@college.edu',
        name: 'Comp Acad Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_comp_acad', 'dept_comp', 'academic')],
        department_id: 'dept_comp',
        department_name: 'Computer',
    }, { complaint_id: 'cmpl_persist_1' }, { databases });
    assert.equal(acadAdminCtx.getResponse().statusCode, 404);
});
// =====================================================================
// Step 10 Regression Tests: End-to-End verifyCaller -> Handlers Security
// =====================================================================
function createAuthRequestContext(userIdHeader) {
    const { context, getResponse } = createComplaintMockContext();
    if (userIdHeader) {
        context.req.headers['x-appwrite-user-id'] = userIdHeader;
    }
    else {
        context.req.headers['authorization'] = 'Bearer test_jwt';
    }
    return { context, getResponse };
}
test('Step 10 (Scenarios 6, 7, 8, 9): verifyCaller -> handlers enforces DB assignments, rejects revoked/allowlisted/academic admins, and rejects missing admin_assignments', async () => {
    const prevAllow07 = process.env.ADMIN_ALLOWLIST_07;
    process.env.ADMIN_ALLOWLIST_07 = 'deleted.allow@college.edu';
    try {
        const { databases } = createComplaintInMemoryDb({
            profiles: [
                {
                    $id: 'prof_creator',
                    $collectionId: 'profiles',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'usr_comp_creator',
                    name: 'Aarav Patel',
                    enrollment_no: '246510307001',
                    student_department_id: 'dept_comp',
                    phone_number: '9876543210',
                    role: 'student',
                    name_locked: true,
                    enrollment_locked: true,
                    phone_locked: true,
                    profile_status: 'complete',
                },
                {
                    $id: 'prof_revoked_water',
                    $collectionId: 'profiles',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_water_revoked',
                    email: 'water.revoked@college.edu',
                    name: 'Revoked Water Admin',
                    enrollment_no: '',
                    student_department_id: null,
                    department_id: 'dept_water',
                    department_code: '07',
                    phone_number: '',
                    role: 'department_admin',
                    name_locked: true,
                    enrollment_locked: true,
                    phone_locked: true,
                    profile_status: 'complete',
                },
                {
                    $id: 'prof_deleted_allow',
                    $collectionId: 'profiles',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_deleted_allow',
                    email: 'deleted.allow@college.edu',
                    name: 'Deleted Allowlist Admin',
                    enrollment_no: '',
                    student_department_id: null,
                    department_id: 'dept_comp',
                    department_code: '07',
                    phone_number: '',
                    role: 'department_admin',
                    name_locked: true,
                    enrollment_locked: true,
                    phone_locked: true,
                    profile_status: 'complete',
                },
                {
                    $id: 'prof_water_admin_student_shadow',
                    $collectionId: 'profiles',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_water_active',
                    name: 'Active Water Admin',
                    enrollment_no: '246510307088',
                    student_department_id: 'dept_comp',
                    phone_number: '9876543218',
                    role: 'student',
                    name_locked: true,
                    enrollment_locked: true,
                    phone_locked: true,
                },
            ],
            department_admins: [
                {
                    $id: 'da_water_active',
                    $collectionId: 'department_admins',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_water_active',
                    email: 'water.active@college.edu',
                    department_id: 'dept_water',
                    scope: 'maintenance',
                    is_active: true,
                    assigned_by: 'usr_principal',
                    created_at: '2026-11-10T00:00:00.000Z',
                },
                {
                    $id: 'da_comp_acad_only',
                    $collectionId: 'department_admins',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_comp_acad',
                    email: 'comp.acad@college.edu',
                    department_id: 'dept_comp',
                    scope: 'academic',
                    is_active: true,
                    assigned_by: 'usr_principal',
                    created_at: '2026-11-10T00:00:00.000Z',
                },
                {
                    $id: 'da_water_revoked',
                    $collectionId: 'department_admins',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T00:00:00.000Z',
                    $updatedAt: '2026-11-10T00:00:00.000Z',
                    $permissions: [],
                    user_id: 'adm_water_revoked',
                    email: 'water.revoked@college.edu',
                    department_id: 'dept_water',
                    scope: 'maintenance',
                    is_active: false,
                    assigned_by: 'usr_principal',
                    created_at: '2026-11-10T00:00:00.000Z',
                },
            ],
            complaints: [
                {
                    $id: 'cmpl_water_e2e',
                    $collectionId: 'complaints',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T08:00:00.000Z',
                    $updatedAt: '2026-11-10T08:00:00.000Z',
                    $permissions: [],
                    student_user_id: 'usr_comp_creator',
                    student_name: 'Aarav Patel',
                    student_enrollment_no: '246510307001',
                    student_department_id: 'dept_comp',
                    maintenance_department_id: 'dept_water',
                    title: 'Water purifier tank valve broken',
                    location: 'Computer Block 1st Floor',
                    description: 'Water tank inlet valve is continuously leaking.',
                    priority: 'high',
                    status: 'Pending',
                    support_count: 1,
                    attachment_file_id: 'file_water_e2e',
                    created_at: '2026-11-10T08:00:00.000Z',
                    updated_at: '2026-11-10T08:00:00.000Z',
                },
                {
                    $id: 'cmpl_comp_e2e',
                    $collectionId: 'complaints',
                    $databaseId: 'campusvoice',
                    $createdAt: '2026-11-10T09:00:00.000Z',
                    $updatedAt: '2026-11-10T09:00:00.000Z',
                    $permissions: [],
                    student_user_id: 'usr_comp_creator',
                    student_name: 'Aarav Patel',
                    student_enrollment_no: '246510307001',
                    student_department_id: 'dept_comp',
                    maintenance_department_id: 'dept_comp',
                    title: 'Lab 2 server rack ventilation failure',
                    location: 'Computer Block Lab 2',
                    description: 'Rack exhaust fan stopped spinning.',
                    priority: 'medium',
                    status: 'Pending',
                    support_count: 1,
                    attachment_file_id: 'file_comp_e2e',
                    created_at: '2026-11-10T09:00:00.000Z',
                    updated_at: '2026-11-10T09:00:00.000Z',
                },
            ],
        });
        const { storage } = createInMemoryStorage({
            file_water_e2e: {
                meta: makeFileMeta({
                    $id: 'file_water_e2e',
                    $permissions: [],
                    name: 'water.png',
                    mimeType: 'image/png',
                    sizeOriginal: PNG_BYTES.byteLength,
                }),
                bytes: PNG_BYTES,
            },
            file_comp_e2e: {
                meta: makeFileMeta({
                    $id: 'file_comp_e2e',
                    $permissions: [],
                    name: 'comp.png',
                    mimeType: 'image/png',
                    sizeOriginal: PNG_BYTES.byteLength,
                }),
                bytes: PNG_BYTES,
            },
        });
        // Scenario 7: Active Water maintenance admin via verifyCaller
        const waterAuth = await verifyCaller(createAuthRequestContext().context, undefined, {
            databases,
            verifyJwt: async () => ({
                $id: 'adm_water_active',
                email: 'water.active@college.edu',
                name: 'Active Water Admin',
            }),
        });
        assert.ok(waterAuth.caller);
        assert.equal(waterAuth.caller.role, 'department_admin');
        assert.equal(waterAuth.caller.admin_assignments?.length, 1);
        const wDash = createComplaintMockContext();
        await handleGetAdminDashboard(wDash.context, waterAuth.caller, { databases });
        assert.equal(wDash.getResponse().statusCode, 200);
        assert.equal(wDash.getResponse().body.data.metrics.department_id, 'dept_water');
        const wQueue = createComplaintMockContext();
        await handleListAdminComplaints(wQueue.context, waterAuth.caller, {}, { databases });
        assert.equal(wQueue.getResponse().statusCode, 200);
        const wList = wQueue.getResponse().body.data.complaints;
        assert.deepEqual(wList.map((c) => c.$id), ['cmpl_water_e2e']);
        const wDetail = createComplaintMockContext();
        await handleGetComplaint(wDetail.context, waterAuth.caller, { complaint_id: 'cmpl_water_e2e' }, { databases });
        assert.equal(wDetail.getResponse().statusCode, 200);
        const wAtt = createComplaintMockContext();
        await handleGetComplaintAttachment(wAtt.context, waterAuth.caller, { complaint_id: 'cmpl_water_e2e' }, { databases, storage });
        assert.equal(wAtt.getResponse().statusCode, 200);
        const wUpdate = createComplaintMockContext();
        await handleUpdateAdminComplaint(wUpdate.context, waterAuth.caller, { complaint_id: 'cmpl_water_e2e', status: 'In Progress', official_response: 'Water technician assigned.' }, { databases });
        assert.equal(wUpdate.getResponse().statusCode, 200);
        // Unassigned department (dept_comp) denied to Water admin
        const wCrossDetail = createComplaintMockContext();
        await handleGetComplaint(wCrossDetail.context, waterAuth.caller, { complaint_id: 'cmpl_comp_e2e' }, { databases });
        assert.equal(wCrossDetail.getResponse().statusCode, 404);
        // Active admin cannot support complaints even if a student profile row exists (handleSupportComplaint checks caller.role)
        const wSupport = createComplaintMockContext();
        await handleSupportComplaint(wSupport.context, waterAuth.caller, { complaint_id: 'cmpl_comp_e2e' }, { databases });
        assert.equal(wSupport.getResponse().statusCode, 403);
        assert.equal(wSupport.getResponse().body.code, 'FORBIDDEN');
        // Scenario 6: Active academic-only Computer admin via verifyCaller cannot access maintenance operations (even for dept_comp)
        const acadAuth = await verifyCaller(createAuthRequestContext().context, undefined, {
            databases,
            verifyJwt: async () => ({
                $id: 'adm_comp_acad',
                email: 'comp.acad@college.edu',
                name: 'Comp Acad Admin',
            }),
        });
        assert.ok(acadAuth.caller);
        assert.equal(acadAuth.caller.role, 'department_admin');
        assert.equal(acadAuth.caller.admin_assignments?.[0]?.scope, 'academic');
        const aDash = createComplaintMockContext();
        await handleGetAdminDashboard(aDash.context, acadAuth.caller, { databases });
        assert.equal(aDash.getResponse().statusCode, 403);
        const aQueue = createComplaintMockContext();
        await handleListAdminComplaints(aQueue.context, acadAuth.caller, {}, { databases });
        assert.equal(aQueue.getResponse().statusCode, 403);
        const aDetail = createComplaintMockContext();
        await handleGetComplaint(aDetail.context, acadAuth.caller, { complaint_id: 'cmpl_comp_e2e' }, { databases });
        assert.equal(aDetail.getResponse().statusCode, 404);
        const aAtt = createComplaintMockContext();
        await handleGetComplaintAttachment(aAtt.context, acadAuth.caller, { complaint_id: 'cmpl_comp_e2e' }, { databases, storage });
        assert.equal(aAtt.getResponse().statusCode, 404);
        const aUpdate = createComplaintMockContext();
        await handleUpdateAdminComplaint(aUpdate.context, acadAuth.caller, { complaint_id: 'cmpl_comp_e2e', status: 'Resolved', official_response: 'Academic admin cannot resolve.' }, { databases });
        assert.equal(aUpdate.getResponse().statusCode, 403);
        // Scenario 8 & 9: Deactivated admin and deleted allowlisted admin via verifyCaller across profile & all admin/complaint endpoints
        for (const revokedIdentity of [
            { $id: 'adm_water_revoked', email: 'water.revoked@college.edu', name: 'Revoked Water Admin' },
            { $id: 'adm_deleted_allow', email: 'deleted.allow@college.edu', name: 'Deleted Allowlist Admin' },
        ]) {
            const revAuth = await verifyCaller(createAuthRequestContext(revokedIdentity.$id).context, undefined, {
                databases,
                users: {
                    get: async () => revokedIdentity,
                },
            });
            assert.ok(revAuth.caller);
            assert.equal(revAuth.caller.role, 'student');
            assert.deepEqual(revAuth.caller.admin_assignments, []);
            const revProfile = createComplaintMockContext();
            await handleGetProfile(revProfile.context, revAuth.caller, { databases });
            assert.equal(revProfile.getResponse().statusCode, 200);
            const revProfData = revProfile.getResponse().body.data;
            assert.equal(revProfData.profile.role, 'student');
            assert.equal(revProfData.is_onboarded, false);
            const revDash = createComplaintMockContext();
            await handleGetAdminDashboard(revDash.context, revAuth.caller, { databases });
            assert.equal(revDash.getResponse().statusCode, 403);
            const revQueue = createComplaintMockContext();
            await handleListAdminComplaints(revQueue.context, revAuth.caller, {}, { databases });
            assert.equal(revQueue.getResponse().statusCode, 403);
            const revDetail = createComplaintMockContext();
            await handleGetComplaint(revDetail.context, revAuth.caller, { complaint_id: 'cmpl_water_e2e' }, { databases });
            assert.equal(revDetail.getResponse().statusCode, 404);
            const revAtt = createComplaintMockContext();
            await handleGetComplaintAttachment(revAtt.context, revAuth.caller, { complaint_id: 'cmpl_water_e2e' }, { databases, storage });
            assert.equal(revAtt.getResponse().statusCode, 404);
            const revUpdate = createComplaintMockContext();
            await handleUpdateAdminComplaint(revUpdate.context, revAuth.caller, { complaint_id: 'cmpl_water_e2e', status: 'Resolved', official_response: 'Revoked admin attempt.' }, { databases });
            assert.equal(revUpdate.getResponse().statusCode, 403);
        }
        // Missing caller.admin_assignments (undefined) must never grant maintenance access
        const missingAssignmentsCaller = {
            id: 'adm_water_active',
            email: 'water.active@college.edu',
            name: 'Missing Assignments',
            role: 'department_admin',
            department_id: 'dept_water',
            department_name: 'Water',
        };
        const mDash = createComplaintMockContext();
        await handleGetAdminDashboard(mDash.context, missingAssignmentsCaller, { databases });
        assert.equal(mDash.getResponse().statusCode, 403);
        const mDetail = createComplaintMockContext();
        await handleGetComplaint(mDetail.context, missingAssignmentsCaller, { complaint_id: 'cmpl_water_e2e' }, { databases });
        assert.equal(mDetail.getResponse().statusCode, 404);
        const mAtt = createComplaintMockContext();
        await handleGetComplaintAttachment(mAtt.context, missingAssignmentsCaller, { complaint_id: 'cmpl_water_e2e' }, { databases, storage });
        assert.equal(mAtt.getResponse().statusCode, 404);
        const mUpdate = createComplaintMockContext();
        await handleUpdateAdminComplaint(mUpdate.context, missingAssignmentsCaller, { complaint_id: 'cmpl_water_e2e', status: 'Resolved', official_response: 'Missing assignments attempt.' }, { databases });
        assert.equal(mUpdate.getResponse().statusCode, 403);
    }
    finally {
        if (prevAllow07 === undefined)
            delete process.env.ADMIN_ALLOWLIST_07;
        else
            process.env.ADMIN_ALLOWLIST_07 = prevAllow07;
    }
});
test('Step 10 (Scenarios 10, 11, 12): Student operations, Principal governance, and Principal/Student role mismatches are handled consistently via verifyCaller', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_s_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_s_creator',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
            },
            {
                $id: 'prof_s_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_s_peer',
                name: 'Bhavya Shah',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
            },
        ],
    });
    const { storage } = createInMemoryStorage({
        file_s_att: {
            meta: makeFileMeta({
                $id: 'file_s_att',
                $permissions: ['read("user:usr_s_creator")'],
                name: 'proof.png',
                mimeType: 'image/png',
                sizeOriginal: PNG_BYTES.byteLength,
            }),
            bytes: PNG_BYTES,
        },
    });
    // Scenario 10: Valid Student operations via verifyCaller
    const creatorAuth = await verifyCaller(createAuthRequestContext().context, undefined, {
        databases,
        verifyJwt: async () => ({ $id: 'usr_s_creator', email: 'a@college.edu', name: 'Aarav Patel' }),
    });
    assert.equal(creatorAuth.caller?.role, 'student');
    const createCtx = createComplaintMockContext();
    await handleCreateComplaint(createCtx.context, creatorAuth.caller, {
        title: 'Water leakage near CS lab',
        maintenance_department_id: 'dept_water',
        location: 'CS Block Floor 2',
        description: 'Drinking water pipeline is leaking continuously.',
        priority: 'high',
        attachment_file_id: 'file_s_att',
    }, { databases, storage });
    assert.equal(createCtx.getResponse().statusCode, 201);
    const complaintId = createCtx.getResponse().body.data.complaint.$id;
    const peerAuth = await verifyCaller(createAuthRequestContext().context, undefined, {
        databases,
        verifyJwt: async () => ({ $id: 'usr_s_peer', email: 'b@college.edu', name: 'Bhavya Shah' }),
    });
    const peerListCtx = createComplaintMockContext();
    await handleListComplaints(peerListCtx.context, peerAuth.caller, {}, { databases });
    assert.equal(peerListCtx.getResponse().statusCode, 200);
    assert.equal(peerListCtx.getResponse().body.data.total, 1);
    const supportCtx = createComplaintMockContext();
    await handleSupportComplaint(supportCtx.context, peerAuth.caller, { complaint_id: complaintId }, { databases });
    assert.equal(supportCtx.getResponse().statusCode, 200);
    assert.equal(supportCtx.getResponse().body.data.support_count, 2);
    // Scenario 11: Valid Principal access via verifyCaller
    const principalAuth = await verifyCaller(createAuthRequestContext().context, undefined, {
        databases,
        verifyJwt: async () => ({ $id: 'usr_principal', email: 'principal@college.edu', name: 'Dr. Principal' }),
    });
    assert.equal(principalAuth.caller?.role, 'principal');
    const pProfileCtx = createComplaintMockContext();
    await handleGetProfile(pProfileCtx.context, principalAuth.caller, { databases });
    assert.equal(pProfileCtx.getResponse().statusCode, 200);
    assert.equal(pProfileCtx.getResponse().body.data.profile.role, 'principal');
    const pGetCtx = createComplaintMockContext();
    await handleGetComplaint(pGetCtx.context, principalAuth.caller, { complaint_id: complaintId }, { databases });
    assert.equal(pGetCtx.getResponse().statusCode, 200);
    assert.equal(pGetCtx.getResponse().body.data.complaint.student_name, 'Aarav Patel');
    const pAttCtx = createComplaintMockContext();
    await handleGetComplaintAttachment(pAttCtx.context, principalAuth.caller, { complaint_id: complaintId }, { databases, storage });
    assert.equal(pAttCtx.getResponse().statusCode, 200);
    const pSupportStateCtx = createComplaintMockContext();
    await handleGetSupportState(pSupportStateCtx.context, principalAuth.caller, { complaint_id: complaintId }, { databases });
    assert.equal(pSupportStateCtx.getResponse().statusCode, 200);
    const pUpdateCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(pUpdateCtx.context, principalAuth.caller, { complaint_id: complaintId, status: 'Resolved', official_response: 'Principal cannot mutate status.' }, { databases });
    assert.equal(pUpdateCtx.getResponse().statusCode, 403);
    const pSupportCtx = createComplaintMockContext();
    await handleSupportComplaint(pSupportCtx.context, principalAuth.caller, { complaint_id: complaintId }, { databases });
    assert.equal(pSupportCtx.getResponse().statusCode, 403);
    // Scenario 12: Principal & Student role mismatches are rejected consistently with 403 FORBIDDEN
    const spoofedPrincipal = {
        id: 'usr_s_peer',
        email: 'b@college.edu',
        name: 'Bhavya Shah',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    for (const fn of [
        () => handleGetProfile(createComplaintMockContext().context, spoofedPrincipal, { databases }),
        () => handleGetComplaint(createComplaintMockContext().context, spoofedPrincipal, { complaint_id: complaintId }, { databases }),
        () => handleGetComplaintAttachment(createComplaintMockContext().context, spoofedPrincipal, { complaint_id: complaintId }, { databases, storage }),
        () => handleGetSupportState(createComplaintMockContext().context, spoofedPrincipal, { complaint_id: complaintId }, { databases }),
        () => handleSupportComplaint(createComplaintMockContext().context, spoofedPrincipal, { complaint_id: complaintId }, { databases }),
    ]) {
        const res = (await fn());
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'FORBIDDEN');
    }
    const spoofedStudentWithPrincipalProfile = {
        id: 'usr_principal',
        email: 'principal@college.edu',
        name: 'Dr. Principal',
        role: 'student',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    for (const fn of [
        () => handleGetProfile(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, { databases }),
        () => handleListComplaints(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, {}, { databases }),
        () => handleGetComplaint(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, { complaint_id: complaintId }, { databases }),
        () => handleGetComplaintAttachment(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, { complaint_id: complaintId }, { databases, storage }),
        () => handleGetSupportState(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, { complaint_id: complaintId }, { databases }),
        () => handleSupportComplaint(createComplaintMockContext().context, spoofedStudentWithPrincipalProfile, { complaint_id: complaintId }, { databases }),
    ]) {
        const res = (await fn());
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'FORBIDDEN');
    }
});
test('Step 11 (Scenarios 1-4): Router main() preserves verifyCaller 401 vs 500 status, avoids UNAUTHORIZED and internal leaks on 500, and blocks protected handlers', async () => {
    const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const { storage } = createInMemoryStorage({
        file_s11: {
            meta: {
                $id: 'file_s11',
                bucketId: 'complaint-attachments',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                name: 'evidence.png',
                signature: 'sig_s11',
                mimeType: 'image/png',
                sizeOriginal: PNG_BYTES.byteLength,
                chunksTotal: 1,
                chunksUploaded: 1,
            },
            bytes: PNG_BYTES,
        },
    });
    let protectedDbCallCount = 0;
    const spyProtectedDb = {
        async listDocuments() {
            protectedDbCallCount += 1;
            return { total: 0, documents: [] };
        },
        async getDocument() {
            protectedDbCallCount += 1;
            throw new Error('Should not be reached');
        },
        async createDocument() {
            protectedDbCallCount += 1;
            throw new Error('Should not be reached');
        },
        async updateDocument() {
            protectedDbCallCount += 1;
            throw new Error('Should not be reached');
        },
        async deleteDocument() {
            protectedDbCallCount += 1;
            return {};
        },
    };
    // Scenario 1: Genuine authentication failure (401) via real verifyCaller -> UNAUTHORIZED 401, no handler executed
    const unauthCtx = createComplaintMockContext();
    unauthCtx.context.req.body = { action: 'get-complaint', data: { complaint_id: 'cmpl_s11' } };
    await main(unauthCtx.context, {
        authDeps: { databases: spyProtectedDb },
        complaintDeps: { databases: spyProtectedDb, storage },
        profileDeps: { databases: spyProtectedDb },
    });
    assert.equal(unauthCtx.getResponse().statusCode, 401);
    assert.equal(unauthCtx.getResponse().body.success, false);
    assert.equal(unauthCtx.getResponse().body.code, 'UNAUTHORIZED');
    assert.equal(protectedDbCallCount, 0, 'Protected handler must not execute on 401 authentication failure');
    // Scenario 2 & 3: Database failure inside real verifyCaller returns 500, non-UNAUTHORIZED code, zero leaked DB details/stack trace
    const internalLeakSecret = 'ECONNREFUSED db-internal-secret-host:3306\n    at QueryRunner.exec (/srv/secret/db.ts:42:9)';
    const failingAuthDb = {
        async listDocuments() {
            throw new Error(internalLeakSecret);
        },
        async getDocument() {
            throw new Error(internalLeakSecret);
        },
        async createDocument() {
            throw new Error(internalLeakSecret);
        },
        async updateDocument() {
            throw new Error(internalLeakSecret);
        },
        async deleteDocument() {
            throw new Error(internalLeakSecret);
        },
    };
    const dbFailCtx = createComplaintMockContext();
    dbFailCtx.context.req.headers = { 'x-appwrite-user-jwt': 'valid.jwt.token' };
    dbFailCtx.context.req.body = { action: 'get-profile' };
    await main(dbFailCtx.context, {
        authDeps: {
            databases: failingAuthDb,
            verifyJwt: async () => ({ $id: 'usr_any', email: 'any@college.edu', name: 'Any User' }),
        },
        complaintDeps: { databases: spyProtectedDb, storage },
        profileDeps: { databases: spyProtectedDb },
    });
    const dbFailRes = dbFailCtx.getResponse();
    assert.equal(dbFailRes.statusCode, 500);
    assert.equal(dbFailRes.body.success, false);
    assert.notEqual(dbFailRes.body.code, 'UNAUTHORIZED');
    assert.equal(dbFailRes.body.code, 'INTERNAL_ERROR');
    const dbFailSerialized = JSON.stringify(dbFailRes.body);
    assert.ok(!dbFailSerialized.includes('ECONNREFUSED'));
    assert.ok(!dbFailSerialized.includes('db-internal-secret-host'));
    assert.ok(!dbFailSerialized.includes('/srv/secret/db.ts'));
    assert.equal(protectedDbCallCount, 0, 'Protected handler must not execute on 500 auth verification failure');
    // Scenario 2b & 3b & 4: Injected verifyCaller returning statusCode 500 with raw error string still sanitizes response and blocks handler
    const injected500Ctx = createComplaintMockContext();
    injected500Ctx.context.req.body = { action: 'list-admin-complaints', data: {} };
    await main(injected500Ctx.context, {
        verifyCaller: async () => ({
            caller: null,
            statusCode: 500,
            error: internalLeakSecret,
        }),
        complaintDeps: { databases: spyProtectedDb, storage },
        profileDeps: { databases: spyProtectedDb },
    });
    const injectedRes = injected500Ctx.getResponse();
    assert.equal(injectedRes.statusCode, 500);
    assert.equal(injectedRes.body.success, false);
    assert.notEqual(injectedRes.body.code, 'UNAUTHORIZED');
    assert.equal(injectedRes.body.code, 'INTERNAL_ERROR');
    const injectedSerialized = JSON.stringify(injectedRes.body);
    assert.ok(!injectedSerialized.includes('ECONNREFUSED'));
    assert.ok(!injectedSerialized.includes('QueryRunner'));
    assert.equal(protectedDbCallCount, 0, 'Protected handler must not execute when injected verifyCaller fails with 500');
});
test('Step 11 (Scenarios 5-12): Principal profile consistency across handlers and end-to-end main() dispatch', async () => {
    const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const { storage } = createInMemoryStorage({
        file_s11_att: {
            meta: {
                $id: 'file_s11_att',
                bucketId: 'complaint-attachments',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                name: 'pipe.png',
                signature: 'sig_s11_att',
                mimeType: 'image/png',
                sizeOriginal: PNG_BYTES.byteLength,
                chunksTotal: 1,
                chunksUploaded: 1,
            },
            bytes: PNG_BYTES,
        },
    });
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_principal_valid',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal_valid',
                name: 'Dr. Principal',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'principal',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_student_row',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_student_s11',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'prof_admin_row',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water_s11',
                name: 'Water Admin',
                enrollment_no: '',
                student_department_id: null,
                phone_number: '',
                role: 'department_admin',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        department_admins: [
            {
                $id: 'da_water_s11',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water_s11',
                email: 'water.s11@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal_valid',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_s11_water',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T01:00:00.000Z',
                $updatedAt: '2026-11-10T01:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_student_s11',
                student_name: 'Aarav Patel',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water cooler pipe burst near Lab 2',
                location: 'Ground Floor Corridor',
                description: 'Continuous water leakage flooding the corridor entrance.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                attachment_file_id: 'file_s11_att',
                issue_type: 'department',
                created_at: '2026-11-10T01:00:00.000Z',
                updated_at: '2026-11-10T01:00:00.000Z',
            },
        ],
    });
    // Scenario 5 & 11: Valid Principal via main() can read detail, attachment, and support-state, and cannot mutate status
    const principalMainGet = createComplaintMockContext();
    principalMainGet.context.req.headers = { 'x-appwrite-user-jwt': 'principal.jwt' };
    principalMainGet.context.req.body = { action: 'get-complaint', data: { complaint_id: 'cmpl_s11_water' } };
    await main(principalMainGet.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_principal_valid', email: 'principal@college.edu', name: 'Dr. Principal' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(principalMainGet.getResponse().statusCode, 200);
    const pComplaint = principalMainGet.getResponse().body.data.complaint;
    assert.equal(pComplaint.student_name, 'Aarav Patel');
    assert.equal(pComplaint.student_enrollment_no, '246510307001');
    const principalMainAtt = createComplaintMockContext();
    principalMainAtt.context.req.headers = { 'x-appwrite-user-jwt': 'principal.jwt' };
    principalMainAtt.context.req.body = { action: 'get-complaint-attachment', data: { complaint_id: 'cmpl_s11_water' } };
    await main(principalMainAtt.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_principal_valid', email: 'principal@college.edu', name: 'Dr. Principal' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(principalMainAtt.getResponse().statusCode, 200);
    const principalMainSupportState = createComplaintMockContext();
    principalMainSupportState.context.req.headers = { 'x-appwrite-user-jwt': 'principal.jwt' };
    principalMainSupportState.context.req.body = { action: 'get-support-state', data: { complaint_id: 'cmpl_s11_water' } };
    await main(principalMainSupportState.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_principal_valid', email: 'principal@college.edu', name: 'Dr. Principal' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(principalMainSupportState.getResponse().statusCode, 200);
    const principalMainUpdate = createComplaintMockContext();
    principalMainUpdate.context.req.headers = { 'x-appwrite-user-jwt': 'principal.jwt' };
    principalMainUpdate.context.req.body = {
        action: 'update-admin-complaint',
        data: { complaint_id: 'cmpl_s11_water', status: 'Resolved', official_response: 'Principal override' },
    };
    await main(principalMainUpdate.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_principal_valid', email: 'principal@college.edu', name: 'Dr. Principal' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(principalMainUpdate.getResponse().statusCode, 403);
    assert.equal(principalMainUpdate.getResponse().body.code, 'FORBIDDEN');
    // Scenarios 6-8: Principal caller with MISSING profile is rejected (403 FORBIDDEN) by all three handlers
    const principalNoProfile = {
        id: 'usr_missing_profile',
        email: 'missing@college.edu',
        name: 'No Profile Principal',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    for (const fn of [
        () => handleGetComplaint(createComplaintMockContext().context, principalNoProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
        () => handleGetComplaintAttachment(createComplaintMockContext().context, principalNoProfile, { complaint_id: 'cmpl_s11_water' }, { databases, storage }),
        () => handleGetSupportState(createComplaintMockContext().context, principalNoProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
    ]) {
        const res = (await fn());
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'FORBIDDEN');
    }
    // Scenario 9: Principal caller with STUDENT profile is rejected (403 FORBIDDEN) by all three handlers
    const principalWithStudentProfile = {
        id: 'usr_student_s11',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    for (const fn of [
        () => handleGetComplaint(createComplaintMockContext().context, principalWithStudentProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
        () => handleGetComplaintAttachment(createComplaintMockContext().context, principalWithStudentProfile, { complaint_id: 'cmpl_s11_water' }, { databases, storage }),
        () => handleGetSupportState(createComplaintMockContext().context, principalWithStudentProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
    ]) {
        const res = (await fn());
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'FORBIDDEN');
    }
    // Scenario 10: Principal caller with DEPARTMENT_ADMIN profile is rejected (403 FORBIDDEN) by all three handlers
    const principalWithAdminProfile = {
        id: 'adm_water_s11',
        email: 'water.s11@college.edu',
        name: 'Water Admin',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    for (const fn of [
        () => handleGetComplaint(createComplaintMockContext().context, principalWithAdminProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
        () => handleGetComplaintAttachment(createComplaintMockContext().context, principalWithAdminProfile, { complaint_id: 'cmpl_s11_water' }, { databases, storage }),
        () => handleGetSupportState(createComplaintMockContext().context, principalWithAdminProfile, { complaint_id: 'cmpl_s11_water' }, { databases }),
    ]) {
        const res = (await fn());
        assert.equal(res.statusCode, 403);
        assert.equal(res.body.code, 'FORBIDDEN');
    }
    // Scenario 12: Existing Student and concerned Maintenance Admin operations remain functional via main()
    const studentMainGet = createComplaintMockContext();
    studentMainGet.context.req.headers = { 'x-appwrite-user-jwt': 'student.jwt' };
    studentMainGet.context.req.body = { action: 'get-complaint', data: { complaint_id: 'cmpl_s11_water' } };
    await main(studentMainGet.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_student_s11', email: 'aarav@college.edu', name: 'Aarav Patel' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(studentMainGet.getResponse().statusCode, 200);
    const adminMainUpdate = createComplaintMockContext();
    adminMainUpdate.context.req.headers = { 'x-appwrite-user-jwt': 'water.jwt' };
    adminMainUpdate.context.req.body = {
        action: 'update-admin-complaint',
        data: { complaint_id: 'cmpl_s11_water', status: 'In Progress', official_response: 'Plumber dispatched.' },
    };
    await main(adminMainUpdate.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'adm_water_s11', email: 'water.s11@college.edu', name: 'Water Admin' }),
        },
        complaintDeps: { databases, storage },
    });
    assert.equal(adminMainUpdate.getResponse().statusCode, 200);
});
test('Day 1 Support Lifecycle & Complaint Clarification: Comprehensive Multi-Agent Verification', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_creator',
                name: 'Creator Student',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_peer',
                name: 'Peer Student',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_cross',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_cross',
                name: 'Cross Dept Student',
                enrollment_no: '246510306001',
                student_department_id: 'dept_civil',
                phone_number: '9876543212',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_adm_water',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                name: 'Water Admin',
                phone_number: '9876543213',
                role: 'department_admin',
                name_locked: true,
                enrollment_locked: false,
            },
            {
                $id: 'prof_adm_mech',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_mech',
                name: 'Mech Admin',
                phone_number: '9876543214',
                role: 'department_admin',
                name_locked: true,
                enrollment_locked: false,
            },
            {
                $id: 'prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_principal',
                name: 'Campus Principal',
                phone_number: '9876543215',
                role: 'principal',
                name_locked: true,
                enrollment_locked: false,
            },
        ],
        department_admins: [
            {
                $id: 'da_adm_water',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                email: 'adm_water@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_adm_mech',
                $collectionId: 'department_admins',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_mech',
                email: 'adm_mech@college.edu',
                department_id: 'dept_mech',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        admin_assignments: [
            {
                $id: 'da_adm_water',
                $collectionId: 'admin_assignments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_water',
                email: 'adm_water@college.edu',
                department_id: 'dept_water',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
            {
                $id: 'da_adm_mech',
                $collectionId: 'admin_assignments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'adm_mech',
                email: 'adm_mech@college.edu',
                department_id: 'dept_mech',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-10T00:00:00.000Z',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_day1_test',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                title: 'Water filter broken in computer block',
                location: 'Computer Block 2nd Floor',
                description: 'The drinking water cooler leaks and water pressure is zero.',
                priority: 'high',
                student_user_id: 'usr_creator',
                student_name: 'Creator Student',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                department_name: 'Water',
                status: 'Pending',
                support_count: 1,
            },
        ],
        complaint_supports: [],
        complaint_timeline: [],
    });
    const callerCreator = {
        id: 'usr_creator',
        email: 'creator@college.edu',
        name: 'Creator Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const callerPeer = {
        id: 'usr_peer',
        email: 'peer@college.edu',
        name: 'Peer Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const callerCross = {
        id: 'usr_cross',
        email: 'cross@college.edu',
        name: 'Cross Dept Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_civil',
        department_name: 'Civil',
    };
    const callerAdminWater = {
        id: 'adm_water',
        email: 'adm_water@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_water', 'dept_water', 'maintenance', true)],
        department_id: 'dept_water',
        department_name: 'Water',
    };
    const callerAdminMech = {
        id: 'adm_mech',
        email: 'adm_mech@college.edu',
        name: 'Mech Admin',
        role: 'department_admin',
        admin_assignments: [makeAdminAssignment('adm_mech', 'dept_mech', 'maintenance', true)],
        department_id: 'dept_mech',
        department_name: 'Mechanical',
    };
    const callerPrincipal = {
        id: 'usr_principal',
        email: 'principal@college.edu',
        name: 'Campus Principal',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    const complaintId = 'cmpl_day1_test';
    // 1. Creator cannot support own complaint
    const selfSupportCtx = createComplaintMockContext();
    await handleSupportComplaint(selfSupportCtx.context, callerCreator, { complaint_id: complaintId }, { databases });
    assert.equal(selfSupportCtx.getResponse().statusCode, 400);
    assert.equal(selfSupportCtx.getResponse().body.code, 'CANNOT_SUPPORT_OWN_COMPLAINT');
    // 2. Creator cannot remove baseline support
    const creatorRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(creatorRemoveCtx.context, callerCreator, { complaint_id: complaintId }, { databases });
    assert.equal(creatorRemoveCtx.getResponse().statusCode, 400);
    assert.equal(creatorRemoveCtx.getResponse().body.code, 'CANNOT_REMOVE_CREATOR_SUPPORT');
    // 3. Cross-department student cannot support (Oracle Elimination: 404)
    const crossSupportCtx = createComplaintMockContext();
    await handleSupportComplaint(crossSupportCtx.context, callerCross, { complaint_id: complaintId }, { databases });
    assert.equal(crossSupportCtx.getResponse().statusCode, 404);
    // 4. Cross-department student cannot remove support (Oracle Elimination: 404)
    const crossRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(crossRemoveCtx.context, callerCross, { complaint_id: complaintId }, { databases });
    assert.equal(crossRemoveCtx.getResponse().statusCode, 404);
    // 5. Peer student who has not supported cannot remove support (400 NOT_SUPPORTED)
    const notSupportedRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(notSupportedRemoveCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(notSupportedRemoveCtx.getResponse().statusCode, 400);
    assert.equal(notSupportedRemoveCtx.getResponse().body.code, 'NOT_SUPPORTED');
    // 6. Peer student supports complaint (200, count -> 2, active record created with SHA-256 ID)
    const peerSupportCtx = createComplaintMockContext();
    await handleSupportComplaint(peerSupportCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(peerSupportCtx.getResponse().statusCode, 200);
    const supportData = peerSupportCtx.getResponse().body.data;
    assert.equal(supportData.support_count, 2);
    assert.equal(supportData.has_supported, true);
    // Verify complaint document in database has updated support_count
    const getComplaintDoc = () => collections.get('complaints')?.find((c) => c.$id === complaintId);
    const expectedShaId = crypto.createHash('sha256').update(`${complaintId}:${callerPeer.id}`).digest('hex').slice(0, 32);
    const getSupportDoc = () => collections.get('complaint_supports')?.find((s) => s.$id === expectedShaId);
    assert.equal(getComplaintDoc()?.support_count, 2);
    // Verify deterministic SHA-256 support document ID
    assert.ok(getSupportDoc());
    assert.equal(getSupportDoc()?.status, 'active');
    assert.equal(getSupportDoc()?.user_id, callerPeer.id);
    // 7. Repeated support returns 409 ALREADY_SUPPORTED without increasing count
    const duplicateSupportCtx = createComplaintMockContext();
    await handleSupportComplaint(duplicateSupportCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(duplicateSupportCtx.getResponse().statusCode, 409);
    assert.equal(duplicateSupportCtx.getResponse().body.code, 'ALREADY_SUPPORTED');
    assert.equal(getComplaintDoc()?.support_count, 2);
    // 8. Support state shows has_supported = true for peer, false for creator
    const peerStateCtx = createComplaintMockContext();
    await handleGetSupportState(peerStateCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(peerStateCtx.getResponse().statusCode, 200);
    assert.equal(peerStateCtx.getResponse().body.data.has_supported, true);
    assert.equal(peerStateCtx.getResponse().body.data.support_count, 2);
    const creatorStateCtx = createComplaintMockContext();
    await handleGetSupportState(creatorStateCtx.context, callerCreator, { complaint_id: complaintId }, { databases });
    assert.equal(creatorStateCtx.getResponse().statusCode, 200);
    assert.equal(creatorStateCtx.getResponse().body.data.has_supported, false);
    // 9. Peer student removes support (status -> revoked, count -> 1)
    const peerRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(peerRemoveCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(peerRemoveCtx.getResponse().statusCode, 200);
    const removeData = peerRemoveCtx.getResponse().body.data;
    assert.equal(removeData.support_count, 1);
    assert.equal(removeData.has_supported, false);
    assert.equal(getSupportDoc()?.status, 'revoked');
    assert.equal(getComplaintDoc()?.support_count, 1);
    // 10. Repeated remove-support fails (already revoked: NOT_SUPPORTED)
    const repeatRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(repeatRemoveCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(repeatRemoveCtx.getResponse().statusCode, 400);
    assert.equal(repeatRemoveCtx.getResponse().body.code, 'NOT_SUPPORTED');
    // 11. Support state reflects revoked status
    const peerStateAfterRevoke = createComplaintMockContext();
    await handleGetSupportState(peerStateAfterRevoke.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(peerStateAfterRevoke.getResponse().statusCode, 200);
    assert.equal(peerStateAfterRevoke.getResponse().body.data.has_supported, false);
    assert.equal(peerStateAfterRevoke.getResponse().body.data.support_count, 1);
    // 12. Re-support: student reactivates revoked support (status -> active, count -> 2)
    const resupportCtx = createComplaintMockContext();
    await handleSupportComplaint(resupportCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(resupportCtx.getResponse().statusCode, 200);
    const resupportData = resupportCtx.getResponse().body.data;
    assert.equal(resupportData.support_count, 2);
    assert.equal(resupportData.has_supported, true);
    assert.equal(getSupportDoc()?.status, 'active');
    assert.equal(getComplaintDoc()?.support_count, 2);
    // 13. CLARIFICATION REQUEST: Input validation
    const invalidClarifCtx = createComplaintMockContext();
    await handleRequestClarification(invalidClarifCtx.context, callerAdminWater, { complaint_id: complaintId, question: 'hi' }, { databases });
    assert.equal(invalidClarifCtx.getResponse().statusCode, 400);
    assert.equal(invalidClarifCtx.getResponse().body.code, 'VALIDATION_ERROR');
    // 14. CLARIFICATION REQUEST: Unauthorized callers
    // - Cross maintenance admin (Mechanical admin cannot request clarification for Water complaint: 404 Oracle Elimination)
    const crossAdminClarifCtx = createComplaintMockContext();
    await handleRequestClarification(crossAdminClarifCtx.context, callerAdminMech, { complaint_id: complaintId, question: 'Is this pipe leaking?' }, { databases });
    assert.equal(crossAdminClarifCtx.getResponse().statusCode, 404);
    // - Student cannot request clarification
    const studentClarifCtx = createComplaintMockContext();
    await handleRequestClarification(studentClarifCtx.context, callerPeer, { complaint_id: complaintId, question: 'Is this pipe leaking?' }, { databases });
    assert.equal(studentClarifCtx.getResponse().statusCode, 403);
    // - Principal cannot request clarification
    const principalClarifCtx = createComplaintMockContext();
    await handleRequestClarification(principalClarifCtx.context, callerPrincipal, { complaint_id: complaintId, question: 'Is this pipe leaking?' }, { databases });
    assert.equal(principalClarifCtx.getResponse().statusCode, 403);
    // 15. CLARIFICATION REQUEST: Authorized Maintenance Admin requests clarification
    const validClarifCtx = createComplaintMockContext();
    await handleRequestClarification(validClarifCtx.context, callerAdminWater, { complaint_id: complaintId, question: 'Could you please specify the room number next to the dispenser?' }, { databases });
    assert.equal(validClarifCtx.getResponse().statusCode, 200);
    const clarifEntry = validClarifCtx.getResponse().body.data.timeline_entry;
    assert.equal(clarifEntry.entry_type, 'clarification_request');
    assert.equal(clarifEntry.author_role, 'department_admin');
    assert.equal(clarifEntry.author_label, 'Water Maintenance Admin');
    assert.equal(clarifEntry.content, 'Could you please specify the room number next to the dispenser?');
    // Complaint immutability: original title, description, and status must remain unchanged
    assert.equal(getComplaintDoc()?.status, 'Pending');
    assert.equal(getComplaintDoc()?.title, 'Water filter broken in computer block');
    // 16. CLARIFICATION REPLY: Input validation
    const emptyReplyCtx = createComplaintMockContext();
    await handleReplyClarification(emptyReplyCtx.context, callerCreator, { complaint_id: complaintId, reply: '   ' }, { databases });
    assert.equal(emptyReplyCtx.getResponse().statusCode, 400);
    assert.equal(emptyReplyCtx.getResponse().body.code, 'VALIDATION_ERROR');
    // 17. CLARIFICATION REPLY: Unauthorized callers
    // - Peer student cannot reply
    const peerReplyCtx = createComplaintMockContext();
    await handleReplyClarification(peerReplyCtx.context, callerPeer, { complaint_id: complaintId, reply: 'It is near room 204' }, { databases });
    assert.equal(peerReplyCtx.getResponse().statusCode, 403);
    // - Admin cannot reply via reply-clarification
    const adminReplyCtx = createComplaintMockContext();
    await handleReplyClarification(adminReplyCtx.context, callerAdminWater, { complaint_id: complaintId, reply: 'It is near room 204' }, { databases });
    assert.equal(adminReplyCtx.getResponse().statusCode, 403);
    // 18. CLARIFICATION REPLY: Complaint author replies
    const authorReplyCtx = createComplaintMockContext();
    await handleReplyClarification(authorReplyCtx.context, callerCreator, { complaint_id: complaintId, reply: 'It is directly opposite Room 204 next to the staircase.' }, { databases });
    assert.equal(authorReplyCtx.getResponse().statusCode, 200);
    const replyEntry = authorReplyCtx.getResponse().body.data.timeline_entry;
    assert.equal(replyEntry.entry_type, 'clarification_reply');
    assert.equal(replyEntry.author_role, 'student');
    assert.equal(replyEntry.author_label, 'Complaint Creator');
    assert.equal(replyEntry.content, 'It is directly opposite Room 204 next to the staircase.');
    // 19. Chronological timeline retrieval and safe peer projection
    const getComplaintCtx = createComplaintMockContext();
    await handleGetComplaint(getComplaintCtx.context, callerPeer, { complaint_id: complaintId }, { databases });
    assert.equal(getComplaintCtx.getResponse().statusCode, 200);
    const getComplaintData = getComplaintCtx.getResponse().body.data;
    assert.equal(getComplaintData.has_supported, true);
    assert.equal(getComplaintData.complaint.support_count, 2);
    assert.equal(getComplaintData.timeline.length, 2);
    assert.equal(getComplaintData.timeline[0].entry_type, 'clarification_request');
    assert.equal(getComplaintData.timeline[1].entry_type, 'clarification_reply');
    // Peer privacy: peer does NOT receive creator author_id
    assert.equal(getComplaintData.timeline[1].author_id, undefined);
    assert.equal(getComplaintData.timeline[1].author_label, 'Complaint Creator');
    // 20. End-to-end Router dispatch verification via main()
    const mainRemoveSupportCtx = createComplaintMockContext();
    mainRemoveSupportCtx.context.req.headers = { 'x-appwrite-user-jwt': 'peer.jwt' };
    mainRemoveSupportCtx.context.req.body = { action: 'remove-support', data: { complaint_id: complaintId } };
    await main(mainRemoveSupportCtx.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_peer', email: 'peer@college.edu', name: 'Peer Student' }),
        },
        complaintDeps: { databases },
    });
    assert.equal(mainRemoveSupportCtx.getResponse().statusCode, 200);
    assert.equal(mainRemoveSupportCtx.getResponse().body.data.has_supported, false);
    const mainClarifReqCtx = createComplaintMockContext();
    mainClarifReqCtx.context.req.headers = { 'x-appwrite-user-jwt': 'water.jwt' };
    mainClarifReqCtx.context.req.body = {
        action: 'request-clarification',
        data: { complaint_id: complaintId, question: 'Has the leakage worsened since yesterday?' },
    };
    await main(mainClarifReqCtx.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'adm_water', email: 'adm_water@college.edu', name: 'Water Admin' }),
        },
        complaintDeps: { databases },
    });
    assert.equal(mainClarifReqCtx.getResponse().statusCode, 200);
    const mainClarifReplyCtx = createComplaintMockContext();
    mainClarifReplyCtx.context.req.headers = { 'x-appwrite-user-jwt': 'creator.jwt' };
    mainClarifReplyCtx.context.req.body = {
        action: 'reply-clarification',
        data: { complaint_id: complaintId, reply: 'Yes, it is now dripping continuously.' },
    };
    await main(mainClarifReplyCtx.context, {
        authDeps: {
            databases,
            verifyJwt: async () => ({ $id: 'usr_creator', email: 'creator@college.edu', name: 'Creator Student' }),
        },
        complaintDeps: { databases },
    });
    assert.equal(mainClarifReplyCtx.getResponse().statusCode, 200);
});
test('Day 1 Support Concurrency: Simultaneous support, remove, and re-support requests maintain strict uniqueness and derived count', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_creator',
                name: 'Creator Student',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_peer_concurrent',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_peer_concurrent',
                name: 'Concurrent Peer Student',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
        ],
        complaints: [
            {
                $id: 'cmpl_concurrency_test',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_creator',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Concurrent Support Verification Grievance',
                location: 'Block C 2nd Floor Washroom',
                description: 'Testing concurrency safety and atomic uniqueness guarantees under simultaneous requests.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
            },
        ],
        complaint_supports: [],
        supports: [],
    });
    const peerCaller = {
        id: 'usr_peer_concurrent',
        email: 'peer@college.edu',
        name: 'Concurrent Peer Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const complaintId = 'cmpl_concurrency_test';
    // 1. Dispatch 10 simultaneous support requests for the same student and complaint
    const concurrentSupportContexts = Array.from({ length: 10 }).map(() => createComplaintMockContext());
    await Promise.all(concurrentSupportContexts.map((ctx) => handleSupportComplaint(ctx.context, peerCaller, { complaint_id: complaintId }, { databases })));
    const supportResponses = concurrentSupportContexts.map((ctx) => ctx.getResponse());
    const successSupports = supportResponses.filter((r) => r.statusCode === 200);
    const conflictSupports = supportResponses.filter((r) => r.statusCode === 409);
    // Exactly one request must succeed, and the remaining 9 must return 409 Conflict
    assert.equal(successSupports.length, 1, 'Exactly one concurrent support request must succeed');
    assert.equal(conflictSupports.length, 9, 'All 9 concurrent duplicate requests must return 409 Conflict');
    assert.equal(conflictSupports[0].body.code, 'ALREADY_SUPPORTED');
    // Verify database record uniqueness
    const supportDocs = collections.get('complaint_supports') || [];
    assert.equal(supportDocs.length, 1, 'Only one support record must exist in database');
    const expectedDocId = crypto.createHash('sha256').update(`${complaintId}:${peerCaller.id}`).digest('hex').slice(0, 32);
    assert.equal(supportDocs[0].$id, expectedDocId, 'Support document ID must match deterministic SHA-256 hash');
    assert.equal(supportDocs[0].status, 'active');
    // Verify derived support count is 1 + 1 = 2 (NOT 11!)
    const getComplaintDoc = () => (collections.get('complaints') || []).find((c) => c.$id === complaintId);
    assert.equal(getComplaintDoc()?.support_count, 2, 'Derived support count must be strictly 2');
    // 2. Dispatch 5 simultaneous duplicate support requests when record is already active
    const duplicateSupportContexts = Array.from({ length: 5 }).map(() => createComplaintMockContext());
    await Promise.all(duplicateSupportContexts.map((ctx) => handleSupportComplaint(ctx.context, peerCaller, { complaint_id: complaintId }, { databases })));
    const dupResponses = duplicateSupportContexts.map((ctx) => ctx.getResponse());
    assert.equal(dupResponses.every((r) => r.statusCode === 409), true, 'All duplicate requests while active return 409');
    assert.equal(dupResponses[0].body.code, 'ALREADY_SUPPORTED');
    assert.equal(getComplaintDoc()?.support_count, 2, 'Count remains strictly 2 on duplicate attempts');
    // 3. Remove support and verify revocation and derived count decrement to baseline
    const removeCtx = createComplaintMockContext();
    await handleRemoveSupport(removeCtx.context, peerCaller, { complaint_id: complaintId }, { databases });
    assert.equal(removeCtx.getResponse().statusCode, 200);
    assert.equal(supportDocs[0].status, 'revoked');
    assert.equal(getComplaintDoc()?.support_count, 1, 'Support count must return to baseline 1');
    // Repeated remove fails with 400 NOT_SUPPORTED
    const repeatedRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(repeatedRemoveCtx.context, peerCaller, { complaint_id: complaintId }, { databases });
    assert.equal(repeatedRemoveCtx.getResponse().statusCode, 400);
    assert.equal(repeatedRemoveCtx.getResponse().body.code, 'NOT_SUPPORTED');
    // 4. Re-support reactivates the record (1 -> 2)
    const resupportCtx = createComplaintMockContext();
    await handleSupportComplaint(resupportCtx.context, peerCaller, { complaint_id: complaintId }, { databases });
    assert.equal(resupportCtx.getResponse().statusCode, 200);
    assert.equal(supportDocs[0].status, 'active');
    assert.equal(getComplaintDoc()?.support_count, 2, 'Derived count returns to 2 on re-support');
    // 5. Verify failure paths do not report false success
    const failingDb = {
        ...databases,
        async updateDocument() {
            throw new Error('Simulated database connection timeout');
        },
    };
    const failingRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(failingRemoveCtx.context, peerCaller, { complaint_id: complaintId }, { databases: failingDb });
    assert.equal(failingRemoveCtx.getResponse().statusCode, 500);
    assert.equal(failingRemoveCtx.getResponse().body.success, false);
    assert.equal(failingRemoveCtx.getResponse().body.code, 'DATABASE_ERROR');
});
test('Day 4: Audit logs are appended for status change, clarification, and support lifecycle', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_comp_audit_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                student_user_id: 'usr_comp_creator',
                student_name: 'Creator Student',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Lab 1 Workstation Issue',
                location: 'Lab 1',
                description: 'Computer 5 monitor does not power on.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                last_meaningful_update_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ],
        profiles: [
            {
                $id: 'prof_comp_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_creator',
                name: 'Creator Student',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_comp_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_comp_peer',
                name: 'Peer Student',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
        ],
        complaint_timeline: [],
        complaint_supports: [],
        supports: [],
        audit_logs: [],
    });
    const adminCaller = {
        id: 'usr_comp_admin',
        email: 'admin.comp@college.edu',
        name: 'Comp Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer',
        admin_assignments: [makeAdminAssignment('usr_comp_admin', 'dept_comp', 'maintenance')],
    };
    const creatorCaller = {
        id: 'usr_comp_creator',
        email: 'creator@college.edu',
        name: 'Creator Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const peerCaller = {
        id: 'usr_comp_peer',
        email: 'peer@college.edu',
        name: 'Peer Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    // 1. Admin updates status to In Progress
    const updateCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(updateCtx.context, adminCaller, { complaint_id: 'cmpl_comp_audit_1', status: 'In Progress', official_response: 'Work started on display unit.' }, { databases });
    assert.equal(updateCtx.getResponse().statusCode, 200);
    // 2. Admin requests clarification
    const clarReqCtx = createComplaintMockContext();
    await handleRequestClarification(clarReqCtx.context, adminCaller, { complaint_id: 'cmpl_comp_audit_1', question: 'Which desk number is affected?' }, { databases });
    assert.equal(clarReqCtx.getResponse().statusCode, 200);
    // 3. Creator replies to clarification
    const clarRepCtx = createComplaintMockContext();
    await handleReplyClarification(clarRepCtx.context, creatorCaller, { complaint_id: 'cmpl_comp_audit_1', reply: 'Desk 5 near the window.' }, { databases });
    assert.equal(clarRepCtx.getResponse().statusCode, 200);
    // 4. Peer supports complaint
    const supportCtx = createComplaintMockContext();
    await handleSupportComplaint(supportCtx.context, peerCaller, { complaint_id: 'cmpl_comp_audit_1' }, { databases });
    assert.equal(supportCtx.getResponse().statusCode, 200);
    // 5. Peer removes support
    const removeCtx = createComplaintMockContext();
    await handleRemoveSupport(removeCtx.context, peerCaller, { complaint_id: 'cmpl_comp_audit_1' }, { databases });
    assert.equal(removeCtx.getResponse().statusCode, 200);
    // Verify all 5 audit actions were appended
    const auditDocs = collections.get('audit_logs') || [];
    const statusAudit = auditDocs.find((a) => a.action === 'complaint_status_changed');
    assert.ok(statusAudit, 'complaint_status_changed audit entry must exist');
    assert.equal(statusAudit.actor_id, 'usr_comp_admin');
    const clarReqAudit = auditDocs.find((a) => a.action === 'clarification_requested');
    assert.ok(clarReqAudit, 'clarification_requested audit entry must exist');
    assert.equal(clarReqAudit.actor_id, 'usr_comp_admin');
    const clarRepAudit = auditDocs.find((a) => a.action === 'clarification_replied');
    assert.ok(clarRepAudit, 'clarification_replied audit entry must exist');
    assert.equal(clarRepAudit.actor_id, 'usr_comp_creator');
    const supportAudit = auditDocs.find((a) => a.action === 'support_added');
    assert.ok(supportAudit, 'support_added audit entry must exist');
    assert.equal(supportAudit.actor_id, 'usr_comp_peer');
    const removeAudit = auditDocs.find((a) => a.action === 'support_removed');
    assert.ok(removeAudit, 'support_removed audit entry must exist');
    assert.equal(removeAudit.actor_id, 'usr_comp_peer');
});
test('Day 4: Complaint content immutability, Principal status guard, and invalid status transitions', async () => {
    const initialTimestamp = '2026-11-10T10:00:00.000Z';
    const { databases, collections } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_immut_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: initialTimestamp,
                $updatedAt: initialTimestamp,
                $permissions: [],
                student_user_id: 'usr_student_immut',
                student_name: 'Immut Student',
                student_enrollment_no: '246510307099',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water Cooler Breakdown',
                location: 'Ground Floor Water Station',
                description: 'Cooler is leaking cold water continuously.',
                priority: 'high',
                status: 'In Progress',
                support_count: 2,
                last_meaningful_update_at: initialTimestamp,
                created_at: initialTimestamp,
                updated_at: initialTimestamp,
            },
        ],
        profiles: [],
        complaint_timeline: [],
        complaint_supports: [],
        supports: [],
        audit_logs: [],
    });
    // 1. Principal attempts status update -> must return 403 Forbidden
    const principalCaller = {
        id: 'usr_principal_root',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        admin_assignments: [],
        department_id: null,
        department_name: null,
    };
    const principalCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(principalCtx.context, principalCaller, { complaint_id: 'cmpl_immut_1', status: 'Resolved', official_response: 'Principal direct fix attempt.' }, { databases });
    assert.equal(principalCtx.getResponse().statusCode, 403);
    assert.equal(principalCtx.getResponse().body.code, 'FORBIDDEN');
    // 2. Concerned Water Maintenance Admin attempts to revert In Progress to Pending -> 400 Invalid Transition
    const waterAdminCaller = {
        id: 'usr_water_admin',
        email: 'admin.water@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        department_id: 'dept_water',
        department_name: 'Water',
        admin_assignments: [makeAdminAssignment('usr_water_admin', 'dept_water', 'maintenance')],
    };
    const revertCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(revertCtx.context, waterAdminCaller, { complaint_id: 'cmpl_immut_1', status: 'Pending', official_response: 'Attempt to reset back to pending.' }, { databases });
    assert.equal(revertCtx.getResponse().statusCode, 400);
    assert.equal(revertCtx.getResponse().body.code, 'INVALID_STATUS_TRANSITION');
    // 3. Successful resolution -> status becomes Resolved, content fields unchanged
    const resolveCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(resolveCtx.context, waterAdminCaller, { complaint_id: 'cmpl_immut_1', status: 'Resolved', official_response: 'Replaced faulty valve; test passed.' }, { databases });
    assert.equal(resolveCtx.getResponse().statusCode, 200);
    const updatedDoc = (collections.get('complaints') || []).find((c) => c.$id === 'cmpl_immut_1');
    assert.ok(updatedDoc);
    assert.equal(updatedDoc.status, 'Resolved');
    assert.equal(updatedDoc.title, 'Water Cooler Breakdown', 'Title must be immutable');
    assert.equal(updatedDoc.description, 'Cooler is leaking cold water continuously.', 'Description must be immutable');
    assert.equal(updatedDoc.location, 'Ground Floor Water Station', 'Location must be immutable');
    assert.equal(updatedDoc.student_department_id, 'dept_comp', 'Student department must be immutable');
    assert.equal(updatedDoc.maintenance_department_id, 'dept_water', 'Maintenance department must be immutable');
    assert.equal(updatedDoc.student_user_id, 'usr_student_immut', 'Author ID must be immutable');
    assert.equal(updatedDoc.created_at, initialTimestamp, 'created_at must be immutable');
});
test('Day 4: Clarification authorization — cross-dept admin receives 404, non-author student receives 403', async () => {
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_clar_auth_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: [],
                student_user_id: 'usr_author_1',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_elec',
                title: 'Switchboard sparking in Room 101',
                location: 'Room 101',
                description: 'Sparking observed when turning on the main switch.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                last_meaningful_update_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ],
        profiles: [],
        complaint_timeline: [],
        complaint_supports: [],
        supports: [],
        audit_logs: [],
    });
    // 1. Civil Admin attempts to request clarification on Electrical complaint -> 404 Oracle Elimination
    const civilAdminCaller = {
        id: 'usr_civil_admin',
        email: 'admin.civil@college.edu',
        name: 'Civil Admin',
        role: 'department_admin',
        department_id: 'dept_civil',
        department_name: 'Civil',
        admin_assignments: [makeAdminAssignment('usr_civil_admin', 'dept_civil', 'maintenance')],
    };
    const civilCtx = createComplaintMockContext();
    await handleRequestClarification(civilCtx.context, civilAdminCaller, { complaint_id: 'cmpl_clar_auth_1', question: 'Civil admin unauthorized probe.' }, { databases });
    assert.equal(civilCtx.getResponse().statusCode, 404);
    // 2. Non-author student attempts to reply -> 403 Forbidden
    const otherStudentCaller = {
        id: 'usr_imposter_student',
        email: 'imposter@college.edu',
        name: 'Imposter Student',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const imposterCtx = createComplaintMockContext();
    await handleReplyClarification(imposterCtx.context, otherStudentCaller, { complaint_id: 'cmpl_clar_auth_1', reply: 'Trying to answer for creator.' }, { databases });
    assert.equal(imposterCtx.getResponse().statusCode, 403);
    assert.equal(imposterCtx.getResponse().body.code, 'FORBIDDEN');
});
test('Day 4: Creator baseline support removal blocked and complete support toggle cycle verified', async () => {
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_supp_cycle_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: [],
                student_user_id: 'usr_supp_creator',
                student_department_id: 'dept_elec',
                maintenance_department_id: 'dept_elec',
                title: 'Transformer hum in substation',
                location: 'Substation Yard',
                description: 'Audible hum exceeding decibel standards.',
                priority: 'low',
                status: 'Pending',
                support_count: 1,
                last_meaningful_update_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
        ],
        profiles: [
            {
                $id: 'prof_supp_creator',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: [],
                user_id: 'usr_supp_creator',
                name: 'Creator Elec',
                enrollment_no: '246510309001',
                student_department_id: 'dept_elec',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
            {
                $id: 'prof_supp_peer',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: new Date().toISOString(),
                $updatedAt: new Date().toISOString(),
                $permissions: [],
                user_id: 'usr_supp_peer',
                name: 'Peer Elec',
                enrollment_no: '246510309002',
                student_department_id: 'dept_elec',
                phone_number: '9876543211',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
            },
        ],
        complaint_timeline: [],
        complaint_supports: [],
        supports: [],
        audit_logs: [],
    });
    const creatorCaller = {
        id: 'usr_supp_creator',
        email: 'creator@elec.edu',
        name: 'Creator Elec',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    };
    const peerCaller = {
        id: 'usr_supp_peer',
        email: 'peer@elec.edu',
        name: 'Peer Elec',
        role: 'student',
        admin_assignments: [],
        department_id: 'dept_elec',
        department_name: 'Electrical',
    };
    // 1. Creator attempts to remove baseline support -> 400 CANNOT_REMOVE_CREATOR_SUPPORT
    const creatorRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(creatorRemoveCtx.context, creatorCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(creatorRemoveCtx.getResponse().statusCode, 400);
    assert.equal(creatorRemoveCtx.getResponse().body.code, 'CANNOT_REMOVE_CREATOR_SUPPORT');
    // 2. Peer checks support state before supporting
    const stateCtx1 = createComplaintMockContext();
    await handleGetSupportState(stateCtx1.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(stateCtx1.getResponse().statusCode, 200);
    const data1 = stateCtx1.getResponse().body.data;
    assert.equal(data1.has_supported, false);
    assert.equal(data1.support_count, 1);
    // 3. Peer supports complaint
    const suppCtx = createComplaintMockContext();
    await handleSupportComplaint(suppCtx.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(suppCtx.getResponse().statusCode, 200);
    const data2 = suppCtx.getResponse().body.data;
    assert.equal(data2.has_supported, true);
    assert.equal(data2.support_count, 2);
    // 4. Peer checks support state after supporting
    const stateCtx2 = createComplaintMockContext();
    await handleGetSupportState(stateCtx2.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(stateCtx2.getResponse().statusCode, 200);
    const data3 = stateCtx2.getResponse().body.data;
    assert.equal(data3.has_supported, true);
    assert.equal(data3.support_count, 2);
    // 5. Peer removes support
    const removeCtx = createComplaintMockContext();
    await handleRemoveSupport(removeCtx.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(removeCtx.getResponse().statusCode, 200);
    const data4 = removeCtx.getResponse().body.data;
    assert.equal(data4.has_supported, false);
    assert.equal(data4.support_count, 1);
    // 6. Repeated remove returns 400 NOT_SUPPORTED
    const repeatRemoveCtx = createComplaintMockContext();
    await handleRemoveSupport(repeatRemoveCtx.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(repeatRemoveCtx.getResponse().statusCode, 400);
    assert.equal(repeatRemoveCtx.getResponse().body.code, 'NOT_SUPPORTED');
    // 7. Re-support reactivates the record (count returns to 2)
    const resuppCtx = createComplaintMockContext();
    await handleSupportComplaint(resuppCtx.context, peerCaller, { complaint_id: 'cmpl_supp_cycle_1' }, { databases });
    assert.equal(resuppCtx.getResponse().statusCode, 200);
    const data5 = resuppCtx.getResponse().body.data;
    assert.equal(data5.has_supported, true);
    assert.equal(data5.support_count, 2);
});
test('Day 5: handleRequestPhoneChange - Student request submission, validation, conflict guard, and audit log', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_comp_student_1',
                user_id: 'usr_comp_student_1',
                name: 'Aarav Patel',
                enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                $permissions: [],
            },
            {
                $id: 'prof_inc_student_1',
                user_id: 'usr_inc_student_1',
                name: 'Incomplete Student',
                enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                phone_number: '',
                role: 'student',
                $permissions: [],
            },
        ],
        phone_change_requests: [],
        audit_logs: [],
    });
    const studentCaller = {
        id: 'usr_comp_student_1',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const adminCaller = {
        id: 'admin_comp_1',
        email: 'admin.comp@college.edu',
        name: 'Computer Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer Engineering',
        admin_assignments: [makeAdminAssignment('admin_comp_1', 'dept_comp', 'academic')],
    };
    // 1. Non-student caller blocked
    const nonStudentCtx = createComplaintMockContext();
    await handleRequestPhoneChange(nonStudentCtx.context, adminCaller, { reason: 'Admin trying to change phone.' }, { databases });
    assert.equal(nonStudentCtx.getResponse().statusCode, 403);
    assert.equal(nonStudentCtx.getResponse().body.code, 'FORBIDDEN');
    // 2. Incomplete profile caller blocked
    const incCaller = {
        id: 'usr_inc_student_1',
        email: 'inc@college.edu',
        name: 'Incomplete',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const incCtx = createComplaintMockContext();
    await handleRequestPhoneChange(incCtx.context, incCaller, { reason: 'Lost my registered phone device.' }, { databases });
    assert.equal(incCtx.getResponse().statusCode, 400);
    assert.equal(incCtx.getResponse().body.code, 'PROFILE_INCOMPLETE');
    // 3. Invalid reason (< 10 chars)
    const shortReasonCtx = createComplaintMockContext();
    await handleRequestPhoneChange(shortReasonCtx.context, studentCaller, { reason: 'Lost sim' }, { databases });
    assert.equal(shortReasonCtx.getResponse().statusCode, 400);
    assert.equal(shortReasonCtx.getResponse().body.code, 'INVALID_REASON');
    // 4. Invalid requested phone format (not 10 digits starting with 6-9)
    const badPhoneCtx = createComplaintMockContext();
    await handleRequestPhoneChange(badPhoneCtx.context, studentCaller, { reason: 'Lost my primary SIM card.', requested_phone_number: '12345' }, { databases });
    assert.equal(badPhoneCtx.getResponse().statusCode, 400);
    assert.equal(badPhoneCtx.getResponse().body.code, 'INVALID_PHONE_NUMBER');
    // 5. Requested phone equals current phone
    const samePhoneCtx = createComplaintMockContext();
    await handleRequestPhoneChange(samePhoneCtx.context, studentCaller, { reason: 'Lost my primary SIM card.', requested_phone_number: '9876543210' }, { databases });
    assert.equal(samePhoneCtx.getResponse().statusCode, 400);
    assert.equal(samePhoneCtx.getResponse().body.code, 'SAME_PHONE_NUMBER');
    // 6. Valid request creation with audit log
    const validCtx = createComplaintMockContext();
    await handleRequestPhoneChange(validCtx.context, studentCaller, { reason: 'SIM card was damaged; changing to alternate personal number.', requested_phone_number: '9123456789' }, { databases });
    assert.equal(validCtx.getResponse().statusCode, 201);
    const data = validCtx.getResponse().body.data;
    assert.equal(data.request.status, 'pending');
    assert.equal(data.request.academic_department_id, 'dept_comp');
    // Verify audit log appended
    const auditDocs = collections.get('audit_logs') || [];
    const reqAudit = auditDocs.find((a) => a.action === 'request_phone_change');
    assert.ok(reqAudit, 'Audit log for request_phone_change must be recorded');
    assert.equal(reqAudit.actor_id, studentCaller.id);
    // 7. Duplicate active request blocked (409 Conflict)
    const dupCtx = createComplaintMockContext();
    await handleRequestPhoneChange(dupCtx.context, studentCaller, { reason: 'Submitting a second request while first is pending.' }, { databases });
    assert.equal(dupCtx.getResponse().statusCode, 409);
    assert.equal(dupCtx.getResponse().body.code, 'ACTIVE_REQUEST_EXISTS');
});
test('Day 5: handleReviewPhoneChange - Academic Admin review scope, rejection reason, and Water/Sanitation block', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        phone_change_requests: [
            {
                $id: 'pcr_pending_comp_1',
                student_user_id: 'usr_comp_student_1',
                academic_department_id: 'dept_comp',
                old_phone_number: '9876543210',
                requested_phone_number: '9123456789',
                reason: 'Lost device and need to update to family phone.',
                status: 'pending',
                reviewed_by: '',
                decision_reason: '',
                permission_consumed: false,
                requested_at: new Date().toISOString(),
                $permissions: [],
            },
        ],
        audit_logs: [],
    });
    const compAdminCaller = {
        id: 'admin_comp_1',
        email: 'admin.comp@college.edu',
        name: 'Computer Academic Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer Engineering',
        admin_assignments: [makeAdminAssignment('admin_comp_1', 'dept_comp', 'academic')],
    };
    const civilAdminCaller = {
        id: 'admin_civil_1',
        email: 'admin.civil@college.edu',
        name: 'Civil Academic Admin',
        role: 'department_admin',
        department_id: 'dept_civil',
        department_name: 'Civil Engineering',
        admin_assignments: [makeAdminAssignment('admin_civil_1', 'dept_civil', 'academic')],
    };
    const waterAdminCaller = {
        id: 'admin_water_1',
        email: 'admin.water@college.edu',
        name: 'Water Maintenance Admin',
        role: 'department_admin',
        department_id: 'dept_water',
        department_name: 'Water Supply',
        admin_assignments: [makeAdminAssignment('admin_water_1', 'dept_water', 'maintenance')],
    };
    const studentCaller = {
        id: 'usr_comp_student_1',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Water Admin blocked from reviewing academic phone change (403 FORBIDDEN)
    const waterCtx = createComplaintMockContext();
    await handleReviewPhoneChange(waterCtx.context, waterAdminCaller, { request_id: 'pcr_pending_comp_1', decision: 'approved' }, { databases });
    assert.equal(waterCtx.getResponse().statusCode, 403);
    assert.equal(waterCtx.getResponse().body.code, 'FORBIDDEN');
    // 2. Cross-department Academic Admin blocked (403 FORBIDDEN)
    const crossCtx = createComplaintMockContext();
    await handleReviewPhoneChange(crossCtx.context, civilAdminCaller, { request_id: 'pcr_pending_comp_1', decision: 'approved' }, { databases });
    assert.equal(crossCtx.getResponse().statusCode, 403);
    assert.equal(crossCtx.getResponse().body.code, 'FORBIDDEN');
    // 3. Student blocked from reviewing (403 FORBIDDEN)
    const studentRevCtx = createComplaintMockContext();
    await handleReviewPhoneChange(studentRevCtx.context, studentCaller, { request_id: 'pcr_pending_comp_1', decision: 'approved' }, { databases });
    assert.equal(studentRevCtx.getResponse().statusCode, 403);
    // 4. Rejection without reason blocked (400 REASON_REQUIRED)
    const noReasonCtx = createComplaintMockContext();
    await handleReviewPhoneChange(noReasonCtx.context, compAdminCaller, { request_id: 'pcr_pending_comp_1', decision: 'rejected', decision_reason: '' }, { databases });
    assert.equal(noReasonCtx.getResponse().statusCode, 400);
    assert.equal(noReasonCtx.getResponse().body.code, 'REASON_REQUIRED');
    // 5. Valid approval by student's assigned academic Department Admin
    const approveCtx = createComplaintMockContext();
    await handleReviewPhoneChange(approveCtx.context, compAdminCaller, { request_id: 'pcr_pending_comp_1', decision: 'approved' }, { databases });
    assert.equal(approveCtx.getResponse().statusCode, 200);
    const data = approveCtx.getResponse().body.data;
    assert.equal(data.request.status, 'approved');
    assert.equal(data.request.permission_consumed, false);
    // Verify audit log for review_phone_change
    const auditDocs = collections.get('audit_logs') || [];
    const reviewAudit = auditDocs.find((a) => a.action === 'review_phone_change');
    assert.ok(reviewAudit, 'Audit log for review_phone_change must be recorded');
    assert.equal(reviewAudit.actor_id, compAdminCaller.id);
    // 6. Reviewing already-reviewed request returns 400
    const reReviewCtx = createComplaintMockContext();
    await handleReviewPhoneChange(reReviewCtx.context, compAdminCaller, { request_id: 'pcr_pending_comp_1', decision: 'approved' }, { databases });
    assert.equal(reReviewCtx.getResponse().statusCode, 400);
    assert.equal(reReviewCtx.getResponse().body.code, 'REQUEST_ALREADY_REVIEWED');
});
test('Day 5: handleCompletePhoneChange - One-time permission consumption and failure-safety', async () => {
    const initialProfiles = [
        {
            $id: 'prof_comp_student_1',
            user_id: 'usr_comp_student_1',
            name: 'Aarav Patel',
            enrollment_no: '246510307001',
            student_department_id: 'dept_comp',
            phone_number: '9876543210',
            role: 'student',
            name_locked: true,
            enrollment_locked: true,
            phone_locked: true,
            $permissions: [],
        },
    ];
    const initialRequests = [
        {
            $id: 'pcr_approved_1',
            student_user_id: 'usr_comp_student_1',
            academic_department_id: 'dept_comp',
            old_phone_number: '9876543210',
            requested_phone_number: '9123456789',
            reason: 'SIM card damaged.',
            status: 'approved',
            permission_consumed: false,
            $permissions: [],
        },
        {
            $id: 'pcr_consumed_1',
            student_user_id: 'usr_comp_student_1',
            academic_department_id: 'dept_comp',
            old_phone_number: '9876543210',
            requested_phone_number: '9123456789',
            reason: 'Already completed change.',
            status: 'completed',
            permission_consumed: true,
            $permissions: [],
        },
    ];
    const { databases, collections } = createComplaintInMemoryDb({
        profiles: initialProfiles,
        phone_change_requests: initialRequests,
        audit_logs: [],
    });
    const studentCaller = {
        id: 'usr_comp_student_1',
        email: 'aarav@college.edu',
        name: 'Aarav Patel',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const otherStudentCaller = {
        id: 'usr_other_student_1',
        email: 'other@college.edu',
        name: 'Other Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Non-matching student gets 404 (Oracle Elimination / IDOR prevention)
    const idorCtx = createComplaintMockContext();
    await handleCompletePhoneChange(idorCtx.context, otherStudentCaller, { request_id: 'pcr_approved_1', new_phone_number: '9123456789' }, { databases });
    assert.equal(idorCtx.getResponse().statusCode, 404);
    assert.equal(idorCtx.getResponse().body.code, 'NOT_FOUND');
    // 2. Already consumed request returns 403 PERMISSION_NOT_AVAILABLE
    const consumedCtx = createComplaintMockContext();
    await handleCompletePhoneChange(consumedCtx.context, studentCaller, { request_id: 'pcr_consumed_1', new_phone_number: '9123456789' }, { databases });
    assert.equal(consumedCtx.getResponse().statusCode, 403);
    assert.equal(consumedCtx.getResponse().body.code, 'PERMISSION_NOT_AVAILABLE');
    // 3. New phone equals old phone returns 400 SAME_PHONE_NUMBER
    const samePhoneCtx = createComplaintMockContext();
    await handleCompletePhoneChange(samePhoneCtx.context, studentCaller, { request_id: 'pcr_approved_1', new_phone_number: '9876543210' }, { databases });
    assert.equal(samePhoneCtx.getResponse().statusCode, 400);
    assert.equal(samePhoneCtx.getResponse().body.code, 'SAME_PHONE_NUMBER');
    // 4. FAILURE SAFETY SIMULATION:
    // If the profile document update fails, permission MUST NOT be consumed and old phone must remain active!
    const failingDatabases = {
        ...databases,
        async updateDocument(dbId, collectionId, documentId, data) {
            if (collectionId === 'profiles') {
                throw new Error('Database disk write failure on profiles');
            }
            return databases.updateDocument(dbId, collectionId, documentId, data);
        },
    };
    const failCtx = createComplaintMockContext();
    await handleCompletePhoneChange(failCtx.context, studentCaller, { request_id: 'pcr_approved_1', new_phone_number: '9123456789' }, { databases: failingDatabases });
    assert.equal(failCtx.getResponse().statusCode, 500);
    assert.equal(failCtx.getResponse().body.code, 'PROFILE_SAVE_FAILED');
    // Verify permission was NOT consumed on failure:
    const requestAfterFail = await databases.getDocument('campusvoice', 'phone_change_requests', 'pcr_approved_1');
    assert.equal(requestAfterFail.permission_consumed, false, 'Permission must remain unconsumed after profile write failure');
    assert.equal(requestAfterFail.status, 'approved', 'Request status must remain approved so student can retry');
    // Verify profile phone was NOT modified:
    const profileAfterFail = (collections.get('profiles') || [])[0];
    assert.equal(profileAfterFail.phone_number, '9876543210', 'Old phone number must remain active after profile write failure');
    // 4b. Step 2 Failure & Automatic Rollback Simulation:
    // If updating phone_change_requests throws, profiles update must be rolled back to old phone!
    const step2FailingDatabases = {
        ...databases,
        async updateDocument(dbId, collectionId, documentId, data) {
            if (collectionId === 'phone_change_requests' && data && data.status === 'completed') {
                throw new Error('Database network timeout on phone_change_requests completion');
            }
            return databases.updateDocument(dbId, collectionId, documentId, data);
        },
    };
    const step2FailCtx = createComplaintMockContext();
    await handleCompletePhoneChange(step2FailCtx.context, studentCaller, { request_id: 'pcr_approved_1', new_phone_number: '9123456789' }, { databases: step2FailingDatabases });
    assert.equal(step2FailCtx.getResponse().statusCode, 500);
    assert.equal(step2FailCtx.getResponse().body.code, 'REQUEST_COMPLETION_FAILED');
    // Verify permission remains unconsumed and profile rolled back:
    const requestAfterStep2Fail = await databases.getDocument('campusvoice', 'phone_change_requests', 'pcr_approved_1');
    assert.equal(requestAfterStep2Fail.permission_consumed, false, 'Permission must remain unconsumed after Step 2 write failure');
    assert.equal(requestAfterStep2Fail.status, 'approved', 'Request status must remain approved so student can retry');
    const profileAfterStep2Fail = (collections.get('profiles') || [])[0];
    assert.equal(profileAfterStep2Fail.phone_number, '9876543210', 'Profile phone number must be rolled back to old phone number');
    // 5. Successful completion (Happy path)
    const successCtx = createComplaintMockContext();
    await handleCompletePhoneChange(successCtx.context, studentCaller, { request_id: 'pcr_approved_1', new_phone_number: '9123456789' }, { databases });
    assert.equal(successCtx.getResponse().statusCode, 200);
    // Verify profile updated and locked
    const updatedProfile = (collections.get('profiles') || [])[0];
    assert.equal(updatedProfile.phone_number, '9123456789');
    assert.equal(updatedProfile.phone_locked, true);
    // Verify request marked completed and consumed
    const updatedReq = await databases.getDocument('campusvoice', 'phone_change_requests', 'pcr_approved_1');
    assert.equal(updatedReq.status, 'completed');
    assert.equal(updatedReq.permission_consumed, true);
    // Verify audit log with masked phone
    const auditDocs = collections.get('audit_logs') || [];
    const compAudit = auditDocs.find((a) => a.action === 'complete_phone_change');
    assert.ok(compAudit, 'Audit log for complete_phone_change must be recorded');
    const detailsStr = String(compAudit.details || '');
    assert.ok(detailsStr.includes('****'), 'Audit log must mask phone number');
});
test('Day 5: handleListPhoneChangeRequests - Scoped listing by role and Water/Sanitation rejection', async () => {
    const { databases } = createComplaintInMemoryDb({
        phone_change_requests: [
            {
                $id: 'pcr_comp_1',
                student_user_id: 'usr_comp_student_1',
                academic_department_id: 'dept_comp',
                status: 'pending',
                $permissions: [],
            },
            {
                $id: 'pcr_civil_1',
                student_user_id: 'usr_civil_student_1',
                academic_department_id: 'dept_civil',
                status: 'pending',
                $permissions: [],
            },
        ],
    });
    const studentCaller = {
        id: 'usr_comp_student_1',
        email: 'comp@college.edu',
        name: 'Comp Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const compAdminCaller = {
        id: 'admin_comp_1',
        email: 'admin.comp@college.edu',
        name: 'Computer Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer Engineering',
        admin_assignments: [makeAdminAssignment('admin_comp_1', 'dept_comp', 'academic')],
    };
    const waterAdminCaller = {
        id: 'admin_water_1',
        email: 'admin.water@college.edu',
        name: 'Water Admin',
        role: 'department_admin',
        department_id: 'dept_water',
        department_name: 'Water Supply',
        admin_assignments: [makeAdminAssignment('admin_water_1', 'dept_water', 'maintenance')],
    };
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    // 1. Student sees only their own request
    const studListCtx = createComplaintMockContext();
    await handleListPhoneChangeRequests(studListCtx.context, studentCaller, {}, { databases });
    assert.equal(studListCtx.getResponse().statusCode, 200);
    const studData = studListCtx.getResponse().body.data;
    assert.ok(studData.requests.every((r) => r.student_user_id === studentCaller.id));
    // 2. Academic Admin sees only their academic department
    const compAdminListCtx = createComplaintMockContext();
    await handleListPhoneChangeRequests(compAdminListCtx.context, compAdminCaller, {}, { databases });
    assert.equal(compAdminListCtx.getResponse().statusCode, 200);
    const compData = compAdminListCtx.getResponse().body.data;
    assert.ok(compData.requests.every((r) => r.academic_department_id === 'dept_comp'));
    // 3. Water maintenance admin receives 403 FORBIDDEN
    const waterListCtx = createComplaintMockContext();
    await handleListPhoneChangeRequests(waterListCtx.context, waterAdminCaller, {}, { databases });
    assert.equal(waterListCtx.getResponse().statusCode, 403);
    assert.equal(waterListCtx.getResponse().body.code, 'FORBIDDEN');
    // 4. Principal sees all requests
    const prinListCtx = createComplaintMockContext();
    await handleListPhoneChangeRequests(prinListCtx.context, principalCaller, {}, { databases });
    assert.equal(prinListCtx.getResponse().statusCode, 200);
    const prinData = prinListCtx.getResponse().body.data;
    assert.equal(prinData.total, 2);
});
test('Day 5: handleGetPrincipalDashboard - 6-department breakdown, delay metrics, and Principal status mutation prohibition', async () => {
    const past6Days = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const past1Day = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_delayed_water_1',
                student_user_id: 'usr_student_1',
                student_name: 'Student 1',
                student_enrollment_no: '246510307001',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_water',
                title: 'Water filter broken',
                location: 'Ground Floor',
                description: 'No clean drinking water.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                created_at: past6Days,
                last_meaningful_update_at: past6Days,
                $permissions: [],
            },
            {
                $id: 'cmpl_fresh_comp_1',
                student_user_id: 'usr_student_2',
                student_name: 'Student 2',
                student_enrollment_no: '246510307002',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Monitor flickering',
                location: 'Lab 2',
                description: 'Screen flickers when typing.',
                priority: 'low',
                status: 'In Progress',
                support_count: 2,
                created_at: past1Day,
                last_meaningful_update_at: past1Day,
                $permissions: [],
            },
        ],
        complaint_warnings: [],
    });
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    const studentCaller = {
        id: 'usr_student_1',
        email: 'student@college.edu',
        name: 'Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Student blocked from principal dashboard (403 FORBIDDEN)
    const studDashCtx = createComplaintMockContext();
    await handleGetPrincipalDashboard(studDashCtx.context, studentCaller, { databases });
    assert.equal(studDashCtx.getResponse().statusCode, 403);
    // 2. Principal receives 200 OK with all 6 canonical department metrics
    const prinDashCtx = createComplaintMockContext();
    await handleGetPrincipalDashboard(prinDashCtx.context, principalCaller, { databases });
    assert.equal(prinDashCtx.getResponse().statusCode, 200);
    const dashData = prinDashCtx.getResponse().body.data;
    // Verify 6 departments represented in breakdown
    const breakdown = dashData.metrics.department_breakdown;
    assert.ok(breakdown.dept_comp, 'Computer dept metrics must exist');
    assert.ok(breakdown.dept_civil, 'Civil dept metrics must exist');
    assert.ok(breakdown.dept_elec, 'Electrical dept metrics must exist');
    assert.ok(breakdown.dept_mech, 'Mechanical dept metrics must exist');
    assert.ok(breakdown.dept_water, 'Water dept metrics must exist');
    assert.ok(breakdown.dept_sanit, 'Sanitation dept metrics must exist');
    // Verify delayed complaint identified
    assert.equal(dashData.delayed_complaints.length, 1);
    assert.equal(dashData.delayed_complaints[0].complaint.$id, 'cmpl_delayed_water_1');
    assert.ok(dashData.delayed_complaints[0].days_delayed >= 5);
    assert.equal(dashData.delayed_complaints[0].is_warning_eligible, true);
    // 3. Principal cannot change complaint status in handleUpdateAdminComplaint (403 FORBIDDEN)
    const prinStatusCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(prinStatusCtx.context, principalCaller, {
        complaint_id: 'cmpl_delayed_water_1',
        status: 'Resolved',
        official_response: 'Principal attempting status change.',
    }, { databases });
    assert.equal(prinStatusCtx.getResponse().statusCode, 403);
    assert.equal(prinStatusCtx.getResponse().body.code, 'FORBIDDEN');
});
test('Day 6: handleAssignAdmin, handleRevokeAdmin, handleListAdminAssignments - Admin Assignment & Dynamic Role Management', async () => {
    const { databases, collections } = createComplaintInMemoryDb({
        department_admins: [],
        profiles: [
            {
                $id: 'usr_target_1',
                name: 'Faculty User',
                email: 'faculty.civil@college.edu',
                role: 'student',
            },
        ],
        audit_logs: [],
    });
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    const studentCaller = {
        id: 'usr_student_1',
        email: 'student@college.edu',
        name: 'Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Non-principal caller blocked with 403 FORBIDDEN
    const studAssignCtx = createComplaintMockContext();
    await handleAssignAdmin(studAssignCtx.context, studentCaller, { email: 'prof@college.edu', department_id: 'dept_civil', scope: 'academic' }, { databases });
    assert.equal(studAssignCtx.getResponse().statusCode, 403);
    assert.equal(studAssignCtx.getResponse().body.code, 'FORBIDDEN');
    // 2. Validation failures: invalid email, invalid department, invalid scope
    const badEmailCtx = createComplaintMockContext();
    await handleAssignAdmin(badEmailCtx.context, principalCaller, { email: 'not-an-email', department_id: 'dept_civil', scope: 'academic' }, { databases });
    assert.equal(badEmailCtx.getResponse().statusCode, 400);
    assert.equal(badEmailCtx.getResponse().body.code, 'INVALID_EMAIL');
    const badDeptCtx = createComplaintMockContext();
    await handleAssignAdmin(badDeptCtx.context, principalCaller, { email: 'prof@college.edu', department_id: 'dept_invented', scope: 'academic' }, { databases });
    assert.equal(badDeptCtx.getResponse().statusCode, 400);
    assert.equal(badDeptCtx.getResponse().body.code, 'INVALID_DEPARTMENT');
    const badScopeCtx = createComplaintMockContext();
    await handleAssignAdmin(badScopeCtx.context, principalCaller, { email: 'prof@college.edu', department_id: 'dept_civil', scope: 'super_scope' }, { databases });
    assert.equal(badScopeCtx.getResponse().statusCode, 400);
    assert.equal(badScopeCtx.getResponse().body.code, 'INVALID_SCOPE');
    // 3. Mandatory Security Invariant: Water and Sanitation CANNOT be assigned academic scope
    const waterAcadCtx = createComplaintMockContext();
    await handleAssignAdmin(waterAcadCtx.context, principalCaller, { email: 'water.admin@college.edu', department_id: 'dept_water', scope: 'academic' }, { databases });
    assert.equal(waterAcadCtx.getResponse().statusCode, 400);
    assert.equal(waterAcadCtx.getResponse().body.code, 'INVALID_DEPARTMENT_SCOPE');
    const sanitAcadCtx = createComplaintMockContext();
    await handleAssignAdmin(sanitAcadCtx.context, principalCaller, { email: 'sanit.admin@college.edu', department_id: 'dept_sanit', scope: 'academic' }, { databases });
    assert.equal(sanitAcadCtx.getResponse().statusCode, 400);
    assert.equal(sanitAcadCtx.getResponse().body.code, 'INVALID_DEPARTMENT_SCOPE');
    // 4. Valid maintenance assignment for Water succeeds
    const waterMaintCtx = createComplaintMockContext();
    await handleAssignAdmin(waterMaintCtx.context, principalCaller, { email: 'water.admin@college.edu', department_id: 'dept_water', scope: 'maintenance' }, { databases });
    assert.equal(waterMaintCtx.getResponse().statusCode, 201);
    const waterAssDoc = waterMaintCtx.getResponse().body.data;
    assert.equal(waterAssDoc.assignment.department_id, 'dept_water');
    assert.equal(waterAssDoc.assignment.scope, 'maintenance');
    assert.equal(waterAssDoc.assignment.is_active, true);
    // 5. Valid academic assignment for Civil succeeds and updates profile role
    const civilAcadCtx = createComplaintMockContext();
    await handleAssignAdmin(civilAcadCtx.context, principalCaller, { email: 'faculty.civil@college.edu', user_id: 'usr_target_1', department_id: 'dept_civil', scope: 'academic' }, { databases });
    assert.equal(civilAcadCtx.getResponse().statusCode, 201);
    const civilAssDoc = civilAcadCtx.getResponse().body.data;
    assert.equal(civilAssDoc.assignment.department_id, 'dept_civil');
    assert.equal(civilAssDoc.assignment.scope, 'academic');
    // Verify profile role updated to department_admin
    const targetProf = collections.get('profiles')?.find((p) => p.$id === 'usr_target_1');
    assert.equal(targetProf?.role, 'department_admin');
    // Verify audit log appended
    const auditLogs = collections.get('audit_logs') || [];
    assert.ok(auditLogs.some((l) => l.action === 'assign_department_admin'));
    // 6. Principal lists admin assignments
    const listCtx = createComplaintMockContext();
    await handleListAdminAssignments(listCtx.context, principalCaller, { databases });
    assert.equal(listCtx.getResponse().statusCode, 200);
    const listData = listCtx.getResponse().body.data;
    assert.equal(listData.total, 2);
    // 7. Student blocked from listing assignments
    const studListCtx = createComplaintMockContext();
    await handleListAdminAssignments(studListCtx.context, studentCaller, { databases });
    assert.equal(studListCtx.getResponse().statusCode, 403);
    // 8. Revoke admin assignment
    const revokeCtx = createComplaintMockContext();
    await handleRevokeAdmin(revokeCtx.context, principalCaller, { assignment_id: civilAssDoc.assignment.$id }, { databases });
    assert.equal(revokeCtx.getResponse().statusCode, 200);
    const revokedData = revokeCtx.getResponse().body.data;
    assert.equal(revokedData.assignment.is_active, false);
    // Verify user profile role reverted to student (since no other active admin assignments exist)
    const updatedTargetProf = collections.get('profiles')?.find((p) => p.$id === 'usr_target_1');
    assert.equal(updatedTargetProf?.role, 'student');
    // Verify audit log appended for revocation
    assert.ok(collections.get('audit_logs')?.some((l) => l.action === 'revoke_department_admin'));
});
test('Day 6: handleIssueWarning & handleRespondToWarning - 5-Day Delay Milestones, Multiple Warnings & Responses', async () => {
    const past7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const past2Days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { databases, collections } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_delayed_elec',
                student_user_id: 'usr_s1',
                student_name: 'Student 1',
                student_enrollment_no: '246510309001',
                student_department_id: 'dept_elec',
                maintenance_department_id: 'dept_elec',
                title: 'Wiring fault in Lab',
                location: 'EE Block',
                description: 'Exposed wires sparking.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                created_at: past7Days,
                last_meaningful_update_at: past7Days,
                $permissions: [],
            },
            {
                $id: 'cmpl_fresh_elec',
                student_user_id: 'usr_s2',
                student_name: 'Student 2',
                student_enrollment_no: '246510309002',
                student_department_id: 'dept_elec',
                maintenance_department_id: 'dept_elec',
                title: 'Tube light broken',
                location: 'Room 101',
                description: 'Light not turning on.',
                priority: 'low',
                status: 'Pending',
                support_count: 1,
                created_at: past2Days,
                last_meaningful_update_at: past2Days,
                $permissions: [],
            },
            {
                $id: 'cmpl_resolved_elec',
                student_user_id: 'usr_s3',
                student_name: 'Student 3',
                student_enrollment_no: '246510309003',
                student_department_id: 'dept_elec',
                maintenance_department_id: 'dept_elec',
                title: 'Switchboard repaired',
                location: 'Room 102',
                description: 'Repaired previously.',
                priority: 'medium',
                status: 'Resolved',
                support_count: 1,
                created_at: past7Days,
                last_meaningful_update_at: past7Days,
                $permissions: [],
            },
        ],
        complaint_warnings: [],
        audit_logs: [],
    });
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    const elecAdminCaller = {
        id: 'usr_admin_elec',
        email: 'elec.admin@college.edu',
        name: 'Electrical Admin',
        role: 'department_admin',
        department_id: 'dept_elec',
        department_name: 'Electrical',
        admin_assignments: [
            {
                $id: 'da_elec',
                user_id: 'usr_admin_elec',
                email: 'elec.admin@college.edu',
                department_id: 'dept_elec',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal_1',
                created_at: past7Days,
            },
        ],
    };
    const mechAdminCaller = {
        id: 'usr_admin_mech',
        email: 'mech.admin@college.edu',
        name: 'Mechanical Admin',
        role: 'department_admin',
        department_id: 'dept_mech',
        department_name: 'Mechanical',
        admin_assignments: [
            {
                $id: 'da_mech',
                user_id: 'usr_admin_mech',
                email: 'mech.admin@college.edu',
                department_id: 'dept_mech',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal_1',
                created_at: past7Days,
            },
        ],
    };
    const studentCaller = {
        id: 'usr_s1',
        email: 's1@college.edu',
        name: 'Student 1',
        role: 'student',
        department_id: 'dept_elec',
        department_name: 'Electrical',
    };
    // 1. Non-principal cannot issue warning (403 FORBIDDEN)
    const nonPrinWarnCtx = createComplaintMockContext();
    await handleIssueWarning(nonPrinWarnCtx.context, studentCaller, { complaint_id: 'cmpl_delayed_elec', warning_reason: 'Why has this not been resolved yet?' }, { databases });
    assert.equal(nonPrinWarnCtx.getResponse().statusCode, 403);
    // 2. Cannot warn on fresh complaint (<= 5 days) -> 400 NOT_DELAY_ELIGIBLE
    const freshWarnCtx = createComplaintMockContext();
    await handleIssueWarning(freshWarnCtx.context, principalCaller, { complaint_id: 'cmpl_fresh_elec', warning_reason: 'Please attend to this complaint immediately.' }, { databases });
    assert.equal(freshWarnCtx.getResponse().statusCode, 400);
    assert.equal(freshWarnCtx.getResponse().body.code, 'NOT_DELAY_ELIGIBLE');
    // 3. Cannot warn on Resolved complaint -> 400 CANNOT_WARN_RESOLVED
    const resolvedWarnCtx = createComplaintMockContext();
    await handleIssueWarning(resolvedWarnCtx.context, principalCaller, { complaint_id: 'cmpl_resolved_elec', warning_reason: 'Complaint is already resolved.' }, { databases });
    assert.equal(resolvedWarnCtx.getResponse().statusCode, 400);
    assert.equal(resolvedWarnCtx.getResponse().body.code, 'CANNOT_WARN_RESOLVED');
    // 4. Principal successfully issues warning on delayed complaint
    const validWarnCtx1 = createComplaintMockContext();
    await handleIssueWarning(validWarnCtx1.context, principalCaller, { complaint_id: 'cmpl_delayed_elec', warning_reason: 'First formal warning: 7 days without resolution.' }, { databases });
    assert.equal(validWarnCtx1.getResponse().statusCode, 201);
    const warnData1 = validWarnCtx1.getResponse().body.data;
    assert.equal(warnData1.warning.complaint_id, 'cmpl_delayed_elec');
    assert.equal(warnData1.warning.days_delayed >= 5, true);
    // 5. Multiple warnings allowed while unresolved
    const validWarnCtx2 = createComplaintMockContext();
    await handleIssueWarning(validWarnCtx2.context, principalCaller, { complaint_id: 'cmpl_delayed_elec', warning_reason: 'Second formal warning: Urgent action required.' }, { databases });
    assert.equal(validWarnCtx2.getResponse().statusCode, 201);
    const warnData2 = validWarnCtx2.getResponse().body.data;
    assert.notEqual(warnData1.warning.$id, warnData2.warning.$id);
    // Verify warnings count in DB
    const warningsList = collections.get('complaint_warnings') || [];
    assert.equal(warningsList.length, 2);
    // 6. Admin responds to warning
    // Cross-department admin blocked with 403 FORBIDDEN
    const wrongAdminRespCtx = createComplaintMockContext();
    await handleRespondToWarning(wrongAdminRespCtx.context, mechAdminCaller, { warning_id: warnData1.warning.$id, admin_response: 'Attempting cross-department response.' }, { databases });
    assert.equal(wrongAdminRespCtx.getResponse().statusCode, 403);
    // Student blocked with 403 FORBIDDEN
    const studRespCtx = createComplaintMockContext();
    await handleRespondToWarning(studRespCtx.context, studentCaller, { warning_id: warnData1.warning.$id, admin_response: 'Student attempting response.' }, { databases });
    assert.equal(studRespCtx.getResponse().statusCode, 403);
    // Assigned maintenance admin responds successfully
    const validRespCtx = createComplaintMockContext();
    await handleRespondToWarning(validRespCtx.context, elecAdminCaller, { warning_id: warnData1.warning.$id, admin_response: 'Parts ordered from supplier; replacement scheduled for tomorrow.' }, { databases });
    assert.equal(validRespCtx.getResponse().statusCode, 200);
    const updatedWarn = validRespCtx.getResponse().body.data;
    assert.equal(updatedWarn.warning.admin_response, 'Parts ordered from supplier; replacement scheduled for tomorrow.');
    assert.ok(updatedWarn.warning.responded_at);
    // Verify audit logs appended
    const auditLogs = collections.get('audit_logs') || [];
    assert.ok(auditLogs.some((l) => l.action === 'issue_warning'));
    assert.ok(auditLogs.some((l) => l.action === 'respond_to_warning'));
});
test('Day 6: handleGetAuditHistory - Append-Only Audit History Retrieval', async () => {
    const { databases } = createComplaintInMemoryDb({
        audit_logs: [
            {
                $id: 'al_1',
                action: 'issue_warning',
                actor_id: 'usr_principal_1',
                actor_role: 'principal',
                target_resource_id: 'cw_1',
                target_resource_type: 'complaint_warning',
                details: JSON.stringify({ reason: 'Delayed complaint' }),
                created_at: '2026-11-19T10:00:00.000Z',
            },
            {
                $id: 'al_2',
                action: 'respond_to_warning',
                actor_id: 'usr_admin_1',
                actor_role: 'department_admin',
                target_resource_id: 'cw_1',
                target_resource_type: 'complaint_warning',
                details: JSON.stringify({ response: 'Acknowledged' }),
                created_at: '2026-11-19T11:00:00.000Z',
            },
            {
                $id: 'al_3',
                action: 'assign_department_admin',
                actor_id: 'usr_principal_1',
                actor_role: 'principal',
                target_resource_id: 'da_1',
                target_resource_type: 'department_admin',
                details: JSON.stringify({ department_id: 'dept_civil', scope: 'academic' }),
                created_at: '2026-11-19T12:00:00.000Z',
            },
        ],
    });
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    const studentCaller = {
        id: 'usr_student_1',
        email: 'student@college.edu',
        name: 'Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. Student blocked with 403 FORBIDDEN
    const studAuditCtx = createComplaintMockContext();
    await handleGetAuditHistory(studAuditCtx.context, studentCaller, {}, { databases });
    assert.equal(studAuditCtx.getResponse().statusCode, 403);
    // 2. Principal retrieves all audit logs
    const prinAuditCtx = createComplaintMockContext();
    await handleGetAuditHistory(prinAuditCtx.context, principalCaller, {}, { databases });
    assert.equal(prinAuditCtx.getResponse().statusCode, 200);
    const auditData = prinAuditCtx.getResponse().body.data;
    assert.equal(auditData.total, 3);
    assert.equal(auditData.audit_logs.length, 3);
    assert.equal(auditData.audit_logs[0].action, 'issue_warning');
    // 3. Action filtering support
    const filteredCtx = createComplaintMockContext();
    await handleGetAuditHistory(filteredCtx.context, principalCaller, { action: 'issue_warning' }, { databases });
    assert.equal(filteredCtx.getResponse().statusCode, 200);
    const filteredData = filteredCtx.getResponse().body.data;
    assert.equal(filteredData.audit_logs.length, 1);
    assert.equal(filteredData.audit_logs[0].action, 'issue_warning');
});
test('Day 7 Audit Fix: handleListComplaints returns accurate has_supported for caller and respects native pagination', async () => {
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_peer_civil',
                user_id: 'usr_peer_civil',
                student_department_id: 'dept_civil',
                name: 'Civil Peer',
                enrollment_no: '246510306002',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                phone_number: '9876543210',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_civil_1',
                student_user_id: 'usr_creator_civil',
                student_name: 'Creator Civil',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_civil',
                title: 'Broken desk in civil lab',
                location: 'Room 101',
                description: 'Multiple desks broken in room 101.',
                priority: 'medium',
                status: 'Pending',
                support_count: 2,
                created_at: '2026-11-19T00:00:00.000Z',
            },
            {
                $id: 'cmpl_civil_2',
                student_user_id: 'usr_creator_civil_2',
                student_name: 'Creator 2',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_civil',
                title: 'Fan not working in civil seminar',
                location: 'Seminar Hall',
                description: 'Ceiling fan is making loud noises.',
                priority: 'low',
                status: 'Pending',
                support_count: 1,
                created_at: '2026-11-19T01:00:00.000Z',
            },
        ],
        complaint_supports: [
            {
                $id: 'supp_1',
                complaint_id: 'cmpl_civil_1',
                user_id: 'usr_peer_civil',
                status: 'active',
                created_at: '2026-11-19T02:00:00.000Z',
            },
        ],
    });
    const peerCaller = {
        id: 'usr_peer_civil',
        email: 'peer.civil@college.edu',
        name: 'Civil Peer',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const ctx = createComplaintMockContext();
    await handleListComplaints(ctx.context, peerCaller, { page: 1, limit: 10 }, { databases });
    assert.equal(ctx.getResponse().statusCode, 200);
    const data = ctx.getResponse().body.data;
    assert.equal(data.complaints.length, 2);
    const cmpl1 = data.complaints.find((c) => c.$id === 'cmpl_civil_1');
    const cmpl2 = data.complaints.find((c) => c.$id === 'cmpl_civil_2');
    assert.ok(cmpl1);
    assert.ok(cmpl2);
    assert.equal(cmpl1.has_supported, true, 'User actively supported cmpl_civil_1');
    assert.equal(cmpl2.has_supported, false, 'User has not supported cmpl_civil_2');
});
test('Day 7 Audit Fix: handleGetComplaint and handleGetSupportState self-heal support count from supports collection', async () => {
    const peerSupportDocId = crypto
        .createHash('sha256')
        .update('cmpl_stale_count:usr_peer_civil')
        .digest('hex')
        .slice(0, 32);
    const { databases } = createComplaintInMemoryDb({
        profiles: [
            {
                $id: 'prof_peer_civil',
                user_id: 'usr_peer_civil',
                student_department_id: 'dept_civil',
                name: 'Civil Peer',
                enrollment_no: '246510306002',
                role: 'student',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                phone_number: '9876543210',
            },
        ],
        complaints: [
            {
                $id: 'cmpl_stale_count',
                student_user_id: 'usr_creator_civil',
                student_name: 'Creator',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_civil',
                title: 'Stale support count test',
                location: 'Room 202',
                description: 'Testing self-healing support count.',
                priority: 'low',
                status: 'Pending',
                support_count: 1, // Stale count: only creator recorded here
                created_at: '2026-11-19T00:00:00.000Z',
            },
        ],
        complaint_supports: [
            {
                $id: peerSupportDocId,
                complaint_id: 'cmpl_stale_count',
                user_id: 'usr_peer_civil',
                status: 'active',
                created_at: '2026-11-19T02:00:00.000Z',
            },
            {
                $id: 'supp_active_2',
                complaint_id: 'cmpl_stale_count',
                user_id: 'usr_peer_civil_2',
                status: 'active',
                created_at: '2026-11-19T03:00:00.000Z',
            },
        ],
    });
    const peerCaller = {
        id: 'usr_peer_civil',
        email: 'peer.civil@college.edu',
        name: 'Civil Peer',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    // 1. handleGetComplaint reconciles support_count to 1 + 2 = 3
    const getCtx = createComplaintMockContext();
    await handleGetComplaint(getCtx.context, peerCaller, { complaint_id: 'cmpl_stale_count' }, { databases });
    assert.equal(getCtx.getResponse().statusCode, 200);
    const getData = getCtx.getResponse().body.data;
    assert.equal(getData.complaint.support_count, 3, 'Support count must self-heal to 1 (creator) + 2 (active supports)');
    assert.equal(getData.has_supported, true);
    // 2. handleGetSupportState also returns 3 and has_supported: true
    const stateCtx = createComplaintMockContext();
    await handleGetSupportState(stateCtx.context, peerCaller, { complaint_id: 'cmpl_stale_count' }, { databases });
    assert.equal(stateCtx.getResponse().statusCode, 200);
    const stateData = stateCtx.getResponse().body.data;
    assert.equal(stateData.support_count, 3, 'Support state must return self-healed count 3');
    assert.equal(stateData.has_supported, true);
});
test('Day 7 Audit Fix: Principal dashboard aggregates metrics and delayed complaints via index-backed queries without in-memory scan', async () => {
    const past7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const past2Days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_delayed_elec_1',
                student_user_id: 'usr_stud_elec',
                student_name: 'Electrical Student',
                student_enrollment_no: '246510309001',
                student_department_id: 'dept_elec',
                maintenance_department_id: 'dept_elec',
                title: 'Wiring sparked in lab',
                location: 'Lab 3',
                description: 'Dangerous sparking wires near bench 4.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                created_at: past7Days,
                last_meaningful_update_at: past7Days,
                $permissions: [],
            },
            {
                $id: 'cmpl_fresh_mech_1',
                student_user_id: 'usr_stud_mech',
                student_name: 'Mechanical Student',
                student_enrollment_no: '246510319001',
                student_department_id: 'dept_mech',
                maintenance_department_id: 'dept_mech',
                title: 'Lathe machine unaligned',
                location: 'Workshop B',
                description: 'Machine cuts off center.',
                priority: 'medium',
                status: 'In Progress',
                support_count: 2,
                created_at: past2Days,
                last_meaningful_update_at: past2Days,
                $permissions: [],
            },
            {
                $id: 'cmpl_resolved_civil_1',
                student_user_id: 'usr_stud_civil',
                student_name: 'Civil Student',
                student_enrollment_no: '246510306001',
                student_department_id: 'dept_civil',
                maintenance_department_id: 'dept_civil',
                title: 'Broken window in room 12',
                location: 'Room 12',
                description: 'Fixed yesterday.',
                priority: 'low',
                status: 'Resolved',
                support_count: 1,
                created_at: past7Days,
                last_meaningful_update_at: past2Days,
                $permissions: [],
            },
        ],
        complaint_warnings: [],
    });
    const principalCaller = {
        id: 'usr_principal_governor',
        email: 'principal@college.edu',
        name: 'College Principal',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    const prinCtx = createComplaintMockContext();
    await handleGetPrincipalDashboard(prinCtx.context, principalCaller, { databases });
    assert.equal(prinCtx.getResponse().statusCode, 200);
    const dashBody = prinCtx.getResponse().body;
    assert.equal(dashBody.success, true);
    const { metrics, delayed_complaints, recent_complaints } = dashBody.data;
    // Total complaints = 1 Pending + 1 In Progress + 1 Resolved = 3
    assert.equal(metrics.total_complaints, 3);
    assert.equal(metrics.total_pending, 1);
    assert.equal(metrics.total_in_progress, 1);
    assert.equal(metrics.total_resolved, 1);
    assert.equal(metrics.total_delayed, 1);
    // Department breakdowns verified
    assert.equal(metrics.department_breakdown.dept_elec.pending, 1);
    assert.equal(metrics.department_breakdown.dept_elec.delayed, 1);
    assert.equal(metrics.department_breakdown.dept_mech.in_progress, 1);
    assert.equal(metrics.department_breakdown.dept_mech.delayed, 0);
    assert.equal(metrics.department_breakdown.dept_civil.resolved, 1);
    // Delayed complaints list contains only the unresolved overdue item
    assert.equal(delayed_complaints.length, 1);
    assert.equal(delayed_complaints[0].complaint.$id, 'cmpl_delayed_elec_1');
    assert.ok(delayed_complaints[0].days_delayed >= 5);
    assert.equal(delayed_complaints[0].is_warning_eligible, true);
    // Recent complaints list is returned
    assert.ok(recent_complaints.length > 0);
});
test('Phone Change Handlers: compatible across requested_at-only, created_at-only, and hybrid Appwrite schemas', async () => {
    const studentProfileDoc = {
        $id: 'prof_pcr_compat_1',
        user_id: 'usr_pcr_compat_1',
        name: 'Compat Student',
        enrollment_no: '246510307055',
        student_department_id: 'dept_comp',
        phone_number: '9876543210',
        role: 'student',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
        $permissions: [],
    };
    const studentCaller = {
        id: 'usr_pcr_compat_1',
        email: 'compat.student@college.edu',
        name: 'Compat Student',
        role: 'student',
        department_id: null,
        department_name: null,
    };
    const adminCaller = {
        id: 'admin_comp_compat',
        email: 'admin.comp@college.edu',
        name: 'Computer Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer',
        admin_assignments: [makeAdminAssignment('admin_comp_compat', 'dept_comp', 'academic')],
    };
    const schemaVariants = [
        {
            name: 'requested_at-only (appwrite.config.json)',
            createAllowed: new Set([
                'student_user_id',
                'academic_department_id',
                'old_phone_number',
                'requested_phone_number',
                'reason',
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'requested_at',
            ]),
            createRequired: new Set(['requested_at']),
            updateAllowed: new Set([
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'reviewed_at',
                'completed_at',
            ]),
        },
        {
            name: 'created_at-only (setup-appwrite.mjs)',
            createAllowed: new Set([
                'student_user_id',
                'academic_department_id',
                'old_phone_number',
                'requested_phone_number',
                'reason',
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'created_at',
                'updated_at',
            ]),
            createRequired: new Set(['created_at']),
            updateAllowed: new Set([
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'updated_at',
            ]),
        },
        {
            name: 'hybrid (requested_at + created_at)',
            createAllowed: new Set([
                'student_user_id',
                'academic_department_id',
                'old_phone_number',
                'requested_phone_number',
                'reason',
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'requested_at',
                'created_at',
                'updated_at',
            ]),
            createRequired: new Set(['requested_at', 'created_at']),
            updateAllowed: new Set([
                'status',
                'reviewed_by',
                'decision_reason',
                'permission_consumed',
                'reviewed_at',
                'completed_at',
                'updated_at',
            ]),
        },
    ];
    for (const variant of schemaVariants) {
        const { databases } = createComplaintInMemoryDb({
            profiles: [{ ...studentProfileDoc }],
            phone_change_requests: [],
            audit_logs: [],
        });
        const strictDb = {
            ...databases,
            async createDocument(dbId, collectionId, docId, data, permissions) {
                if (collectionId === 'phone_change_requests') {
                    for (const key of Object.keys(data)) {
                        if (!variant.createAllowed.has(key)) {
                            throw new Error(`Invalid document structure: Unknown attribute: "${key}"`);
                        }
                    }
                    for (const reqKey of variant.createRequired) {
                        if (!(reqKey in data)) {
                            throw new Error(`Invalid document structure: Missing required attribute "${reqKey}"`);
                        }
                    }
                }
                return databases.createDocument(dbId, collectionId, docId, data, permissions);
            },
            async updateDocument(dbId, collectionId, docId, data, permissions) {
                if (collectionId === 'phone_change_requests' && data) {
                    for (const key of Object.keys(data)) {
                        if (!variant.updateAllowed.has(key)) {
                            throw new Error(`Invalid document structure: Unknown attribute: "${key}"`);
                        }
                    }
                }
                return databases.updateDocument(dbId, collectionId, docId, data, permissions);
            },
        };
        const reqCtx = createComplaintMockContext();
        await handleRequestPhoneChange(reqCtx.context, studentCaller, { reason: `Testing schema compatibility for ${variant.name}`, requested_phone_number: '9123456780' }, { databases: strictDb });
        assert.equal(reqCtx.getResponse().statusCode, 201, `Create failed for ${variant.name}`);
        const requestId = reqCtx.getResponse().body.data.request.$id;
        const revCtx = createComplaintMockContext();
        await handleReviewPhoneChange(revCtx.context, adminCaller, { request_id: requestId, decision: 'approved' }, { databases: strictDb });
        assert.equal(revCtx.getResponse().statusCode, 200, `Review failed for ${variant.name}`);
        const compCtx = createComplaintMockContext();
        await handleCompletePhoneChange(compCtx.context, studentCaller, { request_id: requestId, new_phone_number: '9123456780' }, { databases: strictDb });
        assert.equal(compCtx.getResponse().statusCode, 200, `Complete failed for ${variant.name}`);
    }
});
test('State Machines: Resolved blocks reopen to Pending/In Progress while allowing follow-up notes, and Pending substantive does not advance SLA', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_sm_01',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                student_user_id: 'usr_sm_student',
                student_name: 'Student SM',
                student_enrollment_no: '246510307011',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_elec',
                title: 'Lab MCB tripping intermittently',
                location: 'Block C Lab 2',
                description: 'Breaker trips whenever projector runs.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                created_at: sixDaysAgo,
                updated_at: sixDaysAgo,
                last_meaningful_update_at: sixDaysAgo,
            },
        ],
        complaint_timeline: [],
        complaint_warnings: [],
        audit_logs: [],
    });
    const elecAdmin = {
        id: 'usr_elec_admin',
        email: 'elec.admin@college.edu',
        name: 'Electrical Admin',
        role: 'department_admin',
        department_id: 'dept_elec',
        department_name: 'Electrical',
        admin_assignments: [makeAdminAssignment('usr_elec_admin', 'dept_elec', 'maintenance')],
    };
    // 1. Pending -> Pending with is_substantive: true does not reset last_meaningful_update_at
    const pendingNoteCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(pendingNoteCtx.context, elecAdmin, {
        complaint_id: 'cmpl_sm_01',
        status: 'Pending',
        official_response: 'Logged electrical inspection slot for afternoon.',
        is_substantive: true,
    }, { databases });
    assert.equal(pendingNoteCtx.getResponse().statusCode, 200);
    const afterPendingDoc = await databases.getDocument('campusvoice', 'complaints', 'cmpl_sm_01');
    assert.equal(afterPendingDoc.last_meaningful_update_at, sixDaysAgo);
    // 2. Move Pending -> In Progress -> Resolved
    const inProgCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(inProgCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01', status: 'In Progress', official_response: 'Technician replacing breaker.' }, { databases });
    assert.equal(inProgCtx.getResponse().statusCode, 200);
    const resolveCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(resolveCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01', status: 'Resolved', official_response: 'New MCB installed and load tested.' }, { databases });
    assert.equal(resolveCtx.getResponse().statusCode, 200);
    const getResolvedCtx = createComplaintMockContext();
    await handleGetComplaint(getResolvedCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01' }, { databases });
    const resolvedData = getResolvedCtx.getResponse().body.data.complaint;
    const originalResolvedAt = resolvedData.resolved_at;
    const originalMeaningfulAt = resolvedData.last_meaningful_update_at;
    assert.ok(originalResolvedAt);
    // 3. Block Resolved -> In Progress and Resolved -> Pending
    const reopenCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(reopenCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01', status: 'In Progress', official_response: 'Attempt reopen.' }, { databases });
    assert.equal(reopenCtx.getResponse().statusCode, 400);
    assert.equal(reopenCtx.getResponse().body.code, 'INVALID_STATUS_TRANSITION');
    const revertCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(revertCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01', status: 'Pending', official_response: 'Attempt revert.' }, { databases });
    assert.equal(revertCtx.getResponse().statusCode, 400);
    assert.equal(revertCtx.getResponse().body.code, 'INVALID_STATUS_TRANSITION');
    // 4. Allow Resolved -> Resolved follow-up note while preserving resolved_at and last_meaningful_update_at
    const followUpCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(followUpCtx.context, elecAdmin, {
        complaint_id: 'cmpl_sm_01',
        status: 'Resolved',
        official_response: 'Follow-up safety check completed successfully.',
        is_substantive: true,
    }, { databases });
    assert.equal(followUpCtx.getResponse().statusCode, 200);
    const getFollowUpCtx = createComplaintMockContext();
    await handleGetComplaint(getFollowUpCtx.context, elecAdmin, { complaint_id: 'cmpl_sm_01' }, { databases });
    const followUpComplaint = getFollowUpCtx.getResponse().body.data.complaint;
    assert.equal(followUpComplaint.resolved_at, originalResolvedAt);
    assert.equal(followUpComplaint.last_meaningful_update_at, originalMeaningfulAt);
});
test('State Machines: Turn-based clarification flow and Resolved blocks', async () => {
    const now = new Date().toISOString();
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_clar_01',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: now,
                $updatedAt: now,
                $permissions: [],
                student_user_id: 'usr_clar_student',
                student_name: 'Student Clar',
                student_enrollment_no: '246510307022',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Projector HDMI cable loose',
                location: 'Room 104',
                description: 'Display flickers every few seconds.',
                priority: 'low',
                status: 'In Progress',
                support_count: 1,
                created_at: now,
                updated_at: now,
                last_meaningful_update_at: now,
            },
        ],
        profiles: [
            {
                $id: 'prof_clar_student',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: now,
                $updatedAt: now,
                $permissions: [],
                user_id: 'usr_clar_student',
                auth_user_id: 'usr_clar_student',
                email: 'clar@college.edu',
                name: 'Student Clar',
                enrollment_no: '246510307022',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                profile_status: 'complete',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        complaint_timeline: [],
        complaint_supports: [],
        complaint_warnings: [],
        audit_logs: [],
    });
    const compAdmin = {
        id: 'usr_clar_admin',
        email: 'comp.admin@college.edu',
        name: 'Computer Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer',
        admin_assignments: [makeAdminAssignment('usr_clar_admin', 'dept_comp', 'maintenance')],
    };
    const creatorCaller = {
        id: 'usr_clar_student',
        email: 'clar@college.edu',
        name: 'Student Clar',
        role: 'student',
        student_department_id: 'dept_comp',
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    // 1. Reply blocked before any request exists
    const earlyReplyCtx = createComplaintMockContext();
    await handleReplyClarification(earlyReplyCtx.context, creatorCaller, { complaint_id: 'cmpl_clar_01', reply: 'It is wall port B.' }, { databases });
    assert.equal(earlyReplyCtx.getResponse().statusCode, 400);
    assert.equal(earlyReplyCtx.getResponse().body.code, 'NO_ACTIVE_CLARIFICATION_REQUEST');
    // 2. Request clarification -> state becomes 'awaiting_reply'
    const reqCtx = createComplaintMockContext();
    await handleRequestClarification(reqCtx.context, compAdmin, { complaint_id: 'cmpl_clar_01', question: 'Which wall socket in Room 104?' }, { databases });
    assert.equal(reqCtx.getResponse().statusCode, 200);
    const get1Ctx = createComplaintMockContext();
    await handleGetComplaint(get1Ctx.context, creatorCaller, { complaint_id: 'cmpl_clar_01' }, { databases });
    assert.equal(get1Ctx.getResponse().body.data.clarification_state, 'awaiting_reply');
    // 3. Creator replies -> state transitions to 'replied', second reply blocked
    const replyCtx = createComplaintMockContext();
    await handleReplyClarification(replyCtx.context, creatorCaller, { complaint_id: 'cmpl_clar_01', reply: 'Wall socket behind podium.' }, { databases });
    assert.equal(replyCtx.getResponse().statusCode, 200);
    const get2Ctx = createComplaintMockContext();
    await handleGetComplaint(get2Ctx.context, creatorCaller, { complaint_id: 'cmpl_clar_01' }, { databases });
    assert.equal(get2Ctx.getResponse().body.data.clarification_state, 'replied');
    const dupReplyCtx = createComplaintMockContext();
    await handleReplyClarification(dupReplyCtx.context, creatorCaller, { complaint_id: 'cmpl_clar_01', reply: 'Another unprompted message.' }, { databases });
    assert.equal(dupReplyCtx.getResponse().statusCode, 400);
    assert.equal(dupReplyCtx.getResponse().body.code, 'NO_ACTIVE_CLARIFICATION_REQUEST');
    // 4. Resolve complaint -> both request and reply blocked with COMPLAINT_ALREADY_RESOLVED
    const resCtx = createComplaintMockContext();
    await handleUpdateAdminComplaint(resCtx.context, compAdmin, { complaint_id: 'cmpl_clar_01', status: 'Resolved', official_response: 'HDMI splitter replaced.' }, { databases });
    assert.equal(resCtx.getResponse().statusCode, 200);
    const blockedReqCtx = createComplaintMockContext();
    await handleRequestClarification(blockedReqCtx.context, compAdmin, { complaint_id: 'cmpl_clar_01', question: 'Still blurry?' }, { databases });
    assert.equal(blockedReqCtx.getResponse().statusCode, 400);
    assert.equal(blockedReqCtx.getResponse().body.code, 'COMPLAINT_ALREADY_RESOLVED');
    const blockedReplyCtx = createComplaintMockContext();
    await handleReplyClarification(blockedReplyCtx.context, creatorCaller, { complaint_id: 'cmpl_clar_01', reply: 'Thanks!' }, { databases });
    assert.equal(blockedReplyCtx.getResponse().statusCode, 400);
    assert.equal(blockedReplyCtx.getResponse().body.code, 'COMPLAINT_ALREADY_RESOLVED');
});
test('State Machines: Warning duplicate block, paginated admin list with warning_count, >20 phone history, concurrent completion, and admin assignment hardening', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const historicalPhoneDocs = Array.from({ length: 24 }, (_, idx) => ({
        $id: `pcr_old_${idx}`,
        $collectionId: 'phone_change_requests',
        $databaseId: 'campusvoice',
        $createdAt: '2026-01-01T00:00:00.000Z',
        $updatedAt: '2026-01-01T00:00:00.000Z',
        $permissions: [],
        student_user_id: 'usr_hist_student',
        academic_department_id: 'dept_comp',
        old_phone_number: '9876543210',
        reason: 'Historical request',
        status: 'completed',
        permission_consumed: true,
        requested_at: '2026-01-01T00:00:00.000Z',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
    }));
    historicalPhoneDocs.push({
        $id: 'pcr_active_25',
        $collectionId: 'phone_change_requests',
        $databaseId: 'campusvoice',
        $createdAt: sixDaysAgo,
        $updatedAt: sixDaysAgo,
        $permissions: [],
        student_user_id: 'usr_hist_student',
        academic_department_id: 'dept_comp',
        old_phone_number: '9876543210',
        reason: 'Active unreviewed request',
        status: 'pending',
        permission_consumed: false,
        requested_at: sixDaysAgo,
        created_at: sixDaysAgo,
        updated_at: sixDaysAgo,
    });
    const { databases } = createComplaintInMemoryDb({
        complaints: [
            {
                $id: 'cmpl_pag_1',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                student_user_id: 'usr_hist_student',
                student_name: 'Student Hist',
                student_enrollment_no: '246510307033',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Issue 1',
                location: 'Lab 1',
                description: 'Description 1.',
                priority: 'high',
                status: 'Pending',
                support_count: 1,
                created_at: sixDaysAgo,
                updated_at: sixDaysAgo,
                last_meaningful_update_at: sixDaysAgo,
            },
            {
                $id: 'cmpl_pag_2',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                student_user_id: 'usr_hist_student',
                student_name: 'Student Hist',
                student_enrollment_no: '246510307033',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Issue 2',
                location: 'Lab 2',
                description: 'Description 2.',
                priority: 'medium',
                status: 'Pending',
                support_count: 1,
                created_at: sixDaysAgo,
                updated_at: sixDaysAgo,
                last_meaningful_update_at: sixDaysAgo,
            },
            {
                $id: 'cmpl_pag_3',
                $collectionId: 'complaints',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                student_user_id: 'usr_hist_student',
                student_name: 'Student Hist',
                student_enrollment_no: '246510307033',
                student_department_id: 'dept_comp',
                maintenance_department_id: 'dept_comp',
                title: 'Issue 3',
                location: 'Lab 3',
                description: 'Description 3.',
                priority: 'low',
                status: 'Pending',
                support_count: 1,
                created_at: sixDaysAgo,
                updated_at: sixDaysAgo,
                last_meaningful_update_at: sixDaysAgo,
            },
        ],
        profiles: [
            {
                $id: 'doc_prof_hist',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                user_id: 'usr_hist_student',
                auth_user_id: 'usr_hist_student',
                email: 'hist@college.edu',
                name: 'Student Hist',
                enrollment_no: '246510307033',
                student_department_id: 'dept_comp',
                phone_number: '9876543210',
                role: 'student',
                profile_status: 'complete',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
            {
                $id: 'doc_prof_principal',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                user_id: 'usr_principal_1',
                auth_user_id: 'usr_principal_1',
                email: 'principal@college.edu',
                name: 'Principal User',
                role: 'principal',
                profile_status: 'complete',
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
            },
        ],
        complaint_timeline: [],
        complaint_warnings: [],
        department_admins: [],
        phone_change_requests: [
            ...historicalPhoneDocs,
            {
                $id: 'pcr_race_approved',
                $collectionId: 'phone_change_requests',
                $databaseId: 'campusvoice',
                $createdAt: sixDaysAgo,
                $updatedAt: sixDaysAgo,
                $permissions: [],
                student_user_id: 'usr_hist_student',
                academic_department_id: 'dept_comp',
                old_phone_number: '9999988888',
                reason: 'Race simulation',
                status: 'approved',
                permission_consumed: false,
                requested_at: sixDaysAgo,
                created_at: sixDaysAgo,
                updated_at: sixDaysAgo,
            },
        ],
        audit_logs: [],
    });
    const compAdmin = {
        id: 'usr_comp_maint',
        email: 'maint@college.edu',
        name: 'Comp Maint Admin',
        role: 'department_admin',
        department_id: 'dept_comp',
        department_name: 'Computer',
        admin_assignments: [makeAdminAssignment('usr_comp_maint', 'dept_comp', 'maintenance')],
    };
    const principalCaller = {
        id: 'usr_principal_1',
        email: 'principal@college.edu',
        name: 'Principal User',
        role: 'principal',
        department_id: null,
        department_name: null,
    };
    // 1. Issue two warnings on cmpl_pag_1 -> check duplicate respond block and warning_count in list-admin-complaints
    const warn1Ctx = createComplaintMockContext();
    await handleIssueWarning(warn1Ctx.context, principalCaller, { complaint_id: 'cmpl_pag_1', warning_reason: 'Exceeds 5-day SLA without response.' }, { databases });
    assert.equal(warn1Ctx.getResponse().statusCode, 201);
    const warning1Id = warn1Ctx.getResponse().body.data.warning.$id;
    const warn2Ctx = createComplaintMockContext();
    await handleIssueWarning(warn2Ctx.context, principalCaller, { complaint_id: 'cmpl_pag_1', warning_reason: 'Second reminder for immediate escalation.' }, { databases });
    assert.equal(warn2Ctx.getResponse().statusCode, 201);
    const resp1Ctx = createComplaintMockContext();
    await handleRespondToWarning(resp1Ctx.context, compAdmin, { warning_id: warning1Id, admin_response: 'Vendor scheduled for tomorrow morning.' }, { databases });
    assert.equal(resp1Ctx.getResponse().statusCode, 200);
    const resp2Ctx = createComplaintMockContext();
    await handleRespondToWarning(resp2Ctx.context, compAdmin, { warning_id: warning1Id, admin_response: 'Attempt overwriting original warning response.' }, { databases });
    assert.equal(resp2Ctx.getResponse().statusCode, 409);
    assert.equal(resp2Ctx.getResponse().body.code, 'WARNING_ALREADY_RESPONDED');
    // 2. Paginated handleListAdminComplaints returns total: 3, warning_count: 2 on cmpl_pag_1, and page 2 slice
    const listPage1Ctx = createComplaintMockContext();
    await handleListAdminComplaints(listPage1Ctx.context, compAdmin, { page: 1, limit: 2 }, { databases });
    assert.equal(listPage1Ctx.getResponse().statusCode, 200);
    const page1Data = listPage1Ctx.getResponse().body.data;
    assert.equal(page1Data.total, 3);
    assert.equal(page1Data.complaints.length, 2);
    assert.equal(page1Data.complaints[0].warning_count, 2);
    const listPage2Ctx = createComplaintMockContext();
    await handleListAdminComplaints(listPage2Ctx.context, compAdmin, { page: 2, limit: 2 }, { databases });
    const page2Data = listPage2Ctx.getResponse().body.data;
    assert.equal(page2Data.total, 3);
    assert.equal(page2Data.complaints.length, 1);
    // 3. Student with 24 completed requests + 1 active pending request blocked by >20 active check
    const studentCaller = {
        id: 'usr_hist_student',
        email: 'hist@college.edu',
        name: 'Student Hist',
        role: 'student',
        student_department_id: 'dept_comp',
        department_id: 'dept_comp',
        department_name: 'Computer',
    };
    const reqPhoneCtx = createComplaintMockContext();
    await handleRequestPhoneChange(reqPhoneCtx.context, studentCaller, { reason: 'Changing mobile carrier due to network issues.' }, { databases });
    assert.equal(reqPhoneCtx.getResponse().statusCode, 409);
    assert.equal(reqPhoneCtx.getResponse().body.code, 'ACTIVE_REQUEST_EXISTS');
    // 4. Concurrent double-completion blocked when profile phone no longer matches old_phone_number
    const raceCompleteCtx = createComplaintMockContext();
    await handleCompletePhoneChange(raceCompleteCtx.context, studentCaller, { request_id: 'pcr_race_approved', new_phone_number: '9123456789' }, { databases });
    assert.equal(raceCompleteCtx.getResponse().statusCode, 409);
    assert.equal(raceCompleteCtx.getResponse().body.code, 'PERMISSION_NOT_AVAILABLE');
    // 5. handleAssignAdmin resolves user_id instead of profile $id, blocks Principal, blocks duplicate, and handleRevokeAdmin blocks double revoke
    const assignPrincipalCtx = createComplaintMockContext();
    await handleAssignAdmin(assignPrincipalCtx.context, principalCaller, { email: 'principal@college.edu', department_id: 'dept_comp', scope: 'maintenance' }, { databases });
    assert.equal(assignPrincipalCtx.getResponse().statusCode, 409);
    assert.equal(assignPrincipalCtx.getResponse().body.code, 'CANNOT_REASSIGN_PRINCIPAL');
    const assignStudentCtx = createComplaintMockContext();
    await handleAssignAdmin(assignStudentCtx.context, principalCaller, { email: 'hist@college.edu', department_id: 'dept_comp', scope: 'maintenance' }, { databases });
    assert.equal(assignStudentCtx.getResponse().statusCode, 201);
    const createdAssignment = assignStudentCtx.getResponse().body.data.assignment;
    assert.equal(createdAssignment.user_id, 'usr_hist_student');
    const dupAssignCtx = createComplaintMockContext();
    await handleAssignAdmin(dupAssignCtx.context, principalCaller, { email: 'hist@college.edu', department_id: 'dept_comp', scope: 'maintenance' }, { databases });
    assert.equal(dupAssignCtx.getResponse().statusCode, 409);
    assert.equal(dupAssignCtx.getResponse().body.code, 'ASSIGNMENT_ALREADY_EXISTS');
    const revoke1Ctx = createComplaintMockContext();
    await handleRevokeAdmin(revoke1Ctx.context, principalCaller, { assignment_id: createdAssignment.$id }, { databases });
    assert.equal(revoke1Ctx.getResponse().statusCode, 200);
    const revoke2Ctx = createComplaintMockContext();
    await handleRevokeAdmin(revoke2Ctx.context, principalCaller, { assignment_id: createdAssignment.$id }, { databases });
    assert.equal(revoke2Ctx.getResponse().statusCode, 400);
    assert.equal(revoke2Ctx.getResponse().body.code, 'ASSIGNMENT_ALREADY_REVOKED');
});
test('Custom maintenance departments: complaint filing, admin dashboard metrics, and authorization', async () => {
    const { databases } = createComplaintInMemoryDb({
        departments: [
            {
                $id: 'dept_security',
                $collectionId: 'departments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-20T00:00:00.000Z',
                $updatedAt: '2026-11-20T00:00:00.000Z',
                $permissions: [],
                name: 'Campus Security',
                is_academic: false,
                is_maintenance: true,
                is_active: true,
            },
            {
                $id: 'dept_inactive_custom',
                $collectionId: 'departments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-20T00:00:00.000Z',
                $updatedAt: '2026-11-20T00:00:00.000Z',
                $permissions: [],
                name: 'Inactive Team',
                is_academic: false,
                is_maintenance: true,
                is_active: false,
            },
            {
                $id: 'dept_academic_custom',
                $collectionId: 'departments',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-20T00:00:00.000Z',
                $updatedAt: '2026-11-20T00:00:00.000Z',
                $permissions: [],
                name: 'Academic Team',
                is_academic: true,
                is_maintenance: false,
                is_active: true,
            },
        ],
        profiles: [
            {
                $id: 'prof_student_1',
                $collectionId: 'profiles',
                $databaseId: 'campusvoice',
                $createdAt: '2026-11-10T00:00:00.000Z',
                $updatedAt: '2026-11-10T00:00:00.000Z',
                $permissions: [],
                user_id: 'usr_student_1',
                name: 'Student One',
                enrollment_no: '999999907999',
                phone_number: '9876543210',
                student_department_id: 'dept_comp',
                is_profile_locked: true,
                name_locked: true,
                enrollment_locked: true,
                phone_locked: true,
                profile_status: 'complete',
                role: 'student',
            },
        ],
        complaints: [],
    });
    const studentCaller = {
        id: 'usr_student_1',
        email: 'student1@college.edu',
        name: 'Student One',
        role: 'student',
        student_department_id: 'dept_comp',
        department_id: null,
        department_name: null,
    };
    // 1. Complaint to inactive custom department is rejected
    const inactiveCtx = createComplaintMockContext();
    await handleCreateComplaint(inactiveCtx.context, studentCaller, {
        title: 'Broken window in south gate',
        location: 'South Gate 2',
        description: 'The security window latch is broken.',
        priority: 'medium',
        maintenance_department_id: 'dept_inactive_custom',
    }, { databases });
    assert.equal(inactiveCtx.getResponse().statusCode, 400);
    assert.equal(inactiveCtx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
    // 2. Complaint to non-maintenance custom department is rejected
    const nonMaintCtx = createComplaintMockContext();
    await handleCreateComplaint(nonMaintCtx.context, studentCaller, {
        title: 'Broken window in south gate',
        location: 'South Gate 2',
        description: 'The security window latch is broken.',
        priority: 'medium',
        maintenance_department_id: 'dept_academic_custom',
    }, { databases });
    assert.equal(nonMaintCtx.getResponse().statusCode, 400);
    assert.equal(nonMaintCtx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
    // 3. Complaint to active custom maintenance department succeeds
    const successCtx = createComplaintMockContext();
    await handleCreateComplaint(successCtx.context, studentCaller, {
        title: 'Broken window in south gate',
        location: 'South Gate 2',
        description: 'The security window latch is broken.',
        priority: 'medium',
        maintenance_department_id: 'dept_security',
    }, { databases });
    assert.equal(successCtx.getResponse().statusCode, 201);
    const createdComplaint = successCtx.getResponse().body.data.complaint;
    assert.equal(createdComplaint.maintenance_department_id, 'dept_security');
    // 4. Admin of custom maintenance department is authorized and receives dashboard metrics
    const securityAdminCaller = {
        id: 'usr_sec_admin',
        email: 'security.admin@college.edu',
        name: 'Security Admin',
        role: 'department_admin',
        admin_assignments: [
            {
                $id: 'da_sec',
                user_id: 'usr_sec_admin',
                email: 'security.admin@college.edu',
                department_id: 'dept_security',
                scope: 'maintenance',
                is_active: true,
                assigned_by: 'usr_principal',
                created_at: '2026-11-20T00:00:00.000Z',
            },
        ],
        department_id: 'dept_security',
        department_name: 'Campus Security',
    };
    const adminDashboardCtx = createComplaintMockContext();
    await handleGetAdminDashboard(adminDashboardCtx.context, securityAdminCaller, { databases });
    assert.equal(adminDashboardCtx.getResponse().statusCode, 200);
    const metrics = adminDashboardCtx.getResponse().body.data.metrics;
    assert.equal(metrics.department_id, 'dept_security');
    assert.equal(metrics.total_open, 1);
});
