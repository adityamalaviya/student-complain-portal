import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  handleCreateComplaint,
  handleGetAdminDashboard,
  handleGetComplaint,
  handleGetComplaintAttachment,
  handleGetSupportState,
  handleListAdminComplaints,
  handleListComplaints,
  handleSupportComplaint,
  handleUpdateAdminComplaint,
} from '../functions/campusvoice-api/dist/handlers/complaints.js';

// =====================================================================
// Test Doubles for Production Handler Invocation
// =====================================================================

function createMockContext() {
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
    log: () => {},
    error: () => {},
  };
  return { context, getResponse: () => captured };
}

function createInMemoryDb(initialCollections = {}) {
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
            docs = docs.filter((d) => parsed.values.includes(d[parsed.attribute]));
          }
        } catch {
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
      const now = new Date().toISOString();
      const doc = {
        $id: documentId === 'unique()' ? `doc_${idSeq++}` : documentId,
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

const VALID_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

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

function makeStudentProfile(userId, name, enrollmentNo, studentDepartmentId, phoneNumber) {
  return {
    $id: `prof_${userId}`,
    $collectionId: 'profiles',
    $databaseId: 'campusvoice',
    $createdAt: '2026-11-10T00:00:00.000Z',
    $updatedAt: '2026-11-10T00:00:00.000Z',
    $permissions: [],
    user_id: userId,
    name,
    enrollment_no: enrollmentNo,
    student_department_id: studentDepartmentId,
    phone_number: phoneNumber,
    role: 'student',
    name_locked: true,
    enrollment_locked: true,
    phone_locked: true,
  };
}

// =====================================================================
// Phase 3 Production Handler Tests (Authoritative Academic/Maintenance Rules)
// =====================================================================

test('Phase 3 Scenarios 1, 2, 5, 6: Same-academic-department peers see complaints across maintenance departments with PII redacted, creator sees full details, and cross-department students receive 404', async () => {
  const { databases, collections } = createInMemoryDb({
    profiles: [
      makeStudentProfile('usr_comp_creator', 'Aarav Patel', '246510307054', 'dept_comp', '9876543210'),
      makeStudentProfile('usr_comp_peer', 'Bhavya Shah', '246510307055', 'dept_comp', '9876543211'),
      makeStudentProfile('usr_civil_peer', 'Chirag Mehta', '246510306012', 'dept_civil', '9876543212'),
    ],
  });

  const { storage, files } = createInMemoryStorage({
    file_priv_elec: {
      meta: {
        $id: 'file_priv_elec',
        bucketId: 'complaint-attachments',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: ['read("user:usr_comp_creator")', 'delete("user:usr_comp_creator")'],
        name: 'switchboard.png',
        signature: 'sig_1',
        mimeType: 'image/png',
        sizeOriginal: VALID_PNG_BYTES.byteLength,
        chunksTotal: 1,
        chunksUploaded: 1,
      },
      bytes: VALID_PNG_BYTES,
    },
  });

  const compCreator = {
    id: 'usr_comp_creator',
    email: 'aarav@college.edu',
    name: 'Aarav Patel',
    role: 'student',
    department_id: null,
    department_name: null,
  };
  const compPeer = {
    id: 'usr_comp_peer',
    email: 'bhavya@college.edu',
    name: 'Bhavya Shah',
    role: 'student',
    department_id: null,
    department_name: null,
  };
  const civilPeer = {
    id: 'usr_civil_peer',
    email: 'chirag@college.edu',
    name: 'Chirag Mehta',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  // Creator submits complaint to Electrical maintenance while attempting identity/status spoofing
  const createElecCtx = createMockContext();
  await handleCreateComplaint(
    createElecCtx.context,
    compCreator,
    {
      title: 'Lab 4 High-Speed Network Switch Power Fault',
      maintenance_department_id: 'dept_elec',
      location: 'Computer Block Lab 4',
      description: 'Main switchboard trips whenever rack UPS starts.',
      priority: 'high',
      attachment_file_id: 'file_priv_elec',
      student_user_id: 'usr_hacked_999',
      student_name: 'Fake Student',
      student_enrollment_no: '246510306999',
      student_department_id: 'dept_civil',
      status: 'Resolved',
      support_count: 99,
    },
    { databases, storage }
  );
  assert.equal(createElecCtx.getResponse().statusCode, 201);
  const elecComplaintId = createElecCtx.getResponse().body.data.complaint.$id;
  assert.deepEqual(files.get('file_priv_elec').meta.$permissions, []);

  // Verify server derived identity strictly from trusted profile
  const storedElec = collections.get('complaints').find((c) => c.$id === elecComplaintId);
  assert.equal(storedElec.student_user_id, 'usr_comp_creator');
  assert.equal(storedElec.student_name, 'Aarav Patel');
  assert.equal(storedElec.student_enrollment_no, '246510307054');
  assert.equal(storedElec.student_department_id, 'dept_comp');
  assert.equal(storedElec.maintenance_department_id, 'dept_elec');
  assert.equal(storedElec.status, 'Pending');
  assert.equal(storedElec.support_count, 1);

  // Also create complaints from same Computer creator routed to Water, Sanitation, and Civil maintenance
  for (const maintId of ['dept_water', 'dept_sanit', 'dept_civil']) {
    const ctx = createMockContext();
    await handleCreateComplaint(
      ctx.context,
      compCreator,
      {
        title: `Computer student complaint for ${maintId}`,
        maintenance_department_id: maintId,
        location: 'Computer Block',
        description: `Issue routed to ${maintId} maintenance department.`,
        priority: 'medium',
      },
      { databases, storage }
    );
    assert.equal(ctx.getResponse().statusCode, 201);
  }

  // Scenario 1: Same-academic-department peer sees all 4 complaints regardless of maintenance department
  const peerListCtx = createMockContext();
  await handleListComplaints(peerListCtx.context, compPeer, {}, { databases });
  assert.equal(peerListCtx.getResponse().statusCode, 200);
  const peerListData = peerListCtx.getResponse().body.data;
  assert.equal(peerListData.total, 4);
  const peerMaintDepts = new Set(peerListData.complaints.map((c) => c.maintenance_department_id));
  assert.deepEqual(peerMaintDepts, new Set(['dept_elec', 'dept_water', 'dept_sanit', 'dept_civil']));

  // Scenario 5: Peer list and detail responses hide creator PII and attachment metadata
  for (const peerItem of peerListData.complaints) {
    assert.equal(peerItem.is_own_complaint, false);
    assert.equal('student_user_id' in peerItem, false);
    assert.equal('student_name' in peerItem, false);
    assert.equal('student_enrollment_no' in peerItem, false);
    assert.equal('student_phone_number' in peerItem, false);
    assert.equal('phone_number' in peerItem, false);
    assert.equal('attachment_file_id' in peerItem, false);
    assert.equal('attachment_url' in peerItem, false);
  }

  const peerGetCtx = createMockContext();
  await handleGetComplaint(
    peerGetCtx.context,
    compPeer,
    { complaint_id: elecComplaintId },
    { databases }
  );
  assert.equal(peerGetCtx.getResponse().statusCode, 200);
  const peerDetail = peerGetCtx.getResponse().body.data.complaint;
  assert.equal(peerDetail.is_own_complaint, false);
  assert.equal('student_user_id' in peerDetail, false);
  assert.equal('student_name' in peerDetail, false);
  assert.equal('student_enrollment_no' in peerDetail, false);
  assert.equal('student_phone_number' in peerDetail, false);
  assert.equal('attachment_file_id' in peerDetail, false);
  assert.equal('attachment_url' in peerDetail, false);

  const peerAttCtx = createMockContext();
  await handleGetComplaintAttachment(
    peerAttCtx.context,
    compPeer,
    { complaint_id: elecComplaintId },
    { databases, storage }
  );
  assert.equal(peerAttCtx.getResponse().statusCode, 404);
  assert.equal(peerAttCtx.getResponse().body.code, 'NOT_FOUND');

  // Scenario 6: Complaint creator accesses own complaint with full identity, phone, and private attachment
  const creatorGetCtx = createMockContext();
  await handleGetComplaint(
    creatorGetCtx.context,
    compCreator,
    { complaint_id: elecComplaintId },
    { databases }
  );
  assert.equal(creatorGetCtx.getResponse().statusCode, 200);
  const creatorDetail = creatorGetCtx.getResponse().body.data.complaint;
  assert.equal(creatorDetail.is_own_complaint, true);
  assert.equal(creatorDetail.student_user_id, 'usr_comp_creator');
  assert.equal(creatorDetail.student_name, 'Aarav Patel');
  assert.equal(creatorDetail.student_enrollment_no, '246510307054');
  assert.equal(creatorDetail.student_phone_number, '9876543210');
  assert.equal(creatorDetail.attachment_file_id, 'file_priv_elec');

  const creatorAttCtx = createMockContext();
  await handleGetComplaintAttachment(
    creatorAttCtx.context,
    compCreator,
    { complaint_id: elecComplaintId },
    { databases, storage }
  );
  assert.equal(creatorAttCtx.getResponse().statusCode, 200);
  assert.equal(
    creatorAttCtx.getResponse().body.data.attachment.content_base64,
    Buffer.from(VALID_PNG_BYTES).toString('base64')
  );

  // Scenario 2: Different-academic-department student (Civil) cannot see Computer complaints (not even one routed to dept_civil maintenance)
  const civilListCtx = createMockContext();
  await handleListComplaints(civilListCtx.context, civilPeer, {}, { databases });
  assert.equal(civilListCtx.getResponse().statusCode, 200);
  assert.equal(civilListCtx.getResponse().body.data.total, 0);

  const civilGetCtx = createMockContext();
  await handleGetComplaint(
    civilGetCtx.context,
    civilPeer,
    { complaint_id: elecComplaintId },
    { databases }
  );
  assert.equal(civilGetCtx.getResponse().statusCode, 404);
  assert.equal(civilGetCtx.getResponse().body.code, 'NOT_FOUND');
  assert.equal(civilGetCtx.getResponse().body.data, undefined);

  const civilSupportStateCtx = createMockContext();
  await handleGetSupportState(
    civilSupportStateCtx.context,
    civilPeer,
    { complaint_id: elecComplaintId },
    { databases }
  );
  assert.equal(civilSupportStateCtx.getResponse().statusCode, 404);

  const civilSupportCtx = createMockContext();
  await handleSupportComplaint(
    civilSupportCtx.context,
    civilPeer,
    { complaint_id: elecComplaintId },
    { databases }
  );
  assert.equal(civilSupportCtx.getResponse().statusCode, 404);
});

test('Phase 3 Scenarios 3 & 4: Public complaint creation, public feed requests, forged issue_type=public, and legacy public DB rows are rejected or blocked across departments', async () => {
  const { databases, collections } = createInMemoryDb({
    profiles: [
      makeStudentProfile('usr_comp_student', 'Aarav Patel', '246510307054', 'dept_comp', '9876543210'),
      makeStudentProfile('usr_civil_student', 'Chirag Mehta', '246510306012', 'dept_civil', '9876543212'),
    ],
    // Simulate a legacy unmigrated DB row tagged issue_type: 'public'
    complaints: [
      {
        $id: 'cmpl_legacy_public',
        $collectionId: 'complaints',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T01:00:00.000Z',
        $updatedAt: '2026-11-10T01:00:00.000Z',
        $permissions: [],
        student_user_id: 'usr_comp_student',
        student_name: 'Aarav Patel',
        student_enrollment_no: '246510307054',
        student_department_id: 'dept_comp',
        maintenance_department_id: 'dept_water',
        title: 'Legacy document with issue_type public field',
        location: 'Central Walkway',
        description: 'Legacy record must never bypass academic department visibility.',
        priority: 'medium',
        issue_type: 'public',
        status: 'Pending',
        support_count: 1,
        created_at: '2026-11-10T01:00:00.000Z',
        updated_at: '2026-11-10T01:00:00.000Z',
      },
    ],
  });

  const compCaller = {
    id: 'usr_comp_student',
    email: 'aarav@college.edu',
    name: 'Aarav Patel',
    role: 'student',
    department_id: null,
    department_name: null,
  };
  const civilCaller = {
    id: 'usr_civil_student',
    email: 'chirag@college.edu',
    name: 'Chirag Mehta',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  // Scenario 3 & 4: Direct or forged issue_type: 'public' creation must be rejected
  const forgedCreateCtx = createMockContext();
  await handleCreateComplaint(
    forgedCreateCtx.context,
    compCaller,
    {
      title: 'Broken Streetlights along Central Library Walkway',
      maintenance_department_id: 'dept_elec',
      location: 'Central Library Walkway',
      description: 'Attempting to create a public complaint across all departments.',
      priority: 'high',
      issue_type: 'public',
    },
    { databases }
  );
  assert.equal(forgedCreateCtx.getResponse().statusCode, 400);
  assert.equal(forgedCreateCtx.getResponse().body.code, 'PUBLIC_COMPLAINTS_REMOVED');
  assert.equal(collections.get('complaints').length, 1);

  // Forged maintenance_department_id: 'public' or legacy codes rejected
  for (const forgedMaint of ['public', 'water', 'sanitation', '03', '06', '07']) {
    const ctx = createMockContext();
    await handleCreateComplaint(
      ctx.context,
      compCaller,
      {
        title: 'Forged maintenance routing attempt',
        maintenance_department_id: forgedMaint,
        location: 'Campus Gate',
        description: 'Attempting invalid or legacy department routing.',
        priority: 'low',
      },
      { databases }
    );
    assert.equal(ctx.getResponse().statusCode, 400);
    assert.equal(ctx.getResponse().body.code, 'INVALID_MAINTENANCE_DEPARTMENT');
  }

  // Public feed request rejected
  const pubFeedCtx = createMockContext();
  await handleListComplaints(
    pubFeedCtx.context,
    compCaller,
    { feed_type: 'public' },
    { databases }
  );
  assert.equal(pubFeedCtx.getResponse().statusCode, 400);
  assert.equal(pubFeedCtx.getResponse().body.code, 'PUBLIC_COMPLAINTS_REMOVED');

  // Even if a legacy DB row has issue_type: 'public', cross-department Civil student gets 404 & empty feed
  const civilListCtx = createMockContext();
  await handleListComplaints(civilListCtx.context, civilCaller, {}, { databases });
  assert.equal(civilListCtx.getResponse().statusCode, 200);
  assert.equal(civilListCtx.getResponse().body.data.total, 0);

  const civilGetLegacyCtx = createMockContext();
  await handleGetComplaint(
    civilGetLegacyCtx.context,
    civilCaller,
    { complaint_id: 'cmpl_legacy_public' },
    { databases }
  );
  assert.equal(civilGetLegacyCtx.getResponse().statusCode, 404);
  assert.equal(civilGetLegacyCtx.getResponse().body.code, 'NOT_FOUND');
});

test('Phase 3 Scenario 7: Only the concerned Maintenance Department Admin can view full queue/details and manage the complaint', async () => {
  const { databases } = createInMemoryDb({
    profiles: [
      makeStudentProfile('usr_comp_creator', 'Aarav Patel', '246510307054', 'dept_comp', '9876543210'),
    ],
    department_admins: [
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
        $id: 'da_comp_maint',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'adm_comp_maint',
        email: 'comp.maint@college.edu',
        department_id: 'dept_comp',
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
    ],
    complaints: [
      {
        $id: 'cmpl_comp_to_elec',
        $collectionId: 'complaints',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T02:00:00.000Z',
        $updatedAt: '2026-11-10T02:00:00.000Z',
        $permissions: [],
        student_user_id: 'usr_comp_creator',
        student_name: 'Aarav Patel',
        student_enrollment_no: '246510307054',
        student_department_id: 'dept_comp',
        maintenance_department_id: 'dept_elec',
        title: 'Projector fuse blown in Room 302',
        location: 'Computer Block Room 302',
        description: 'Projector power circuit breaker fails immediately.',
        priority: 'high',
        status: 'Pending',
        support_count: 1,
        attachment_file_id: 'file_elec_1',
        created_at: '2026-11-10T02:00:00.000Z',
        updated_at: '2026-11-10T02:00:00.000Z',
      },
    ],
  });

  const { storage } = createInMemoryStorage({
    file_elec_1: {
      meta: {
        $id: 'file_elec_1',
        bucketId: 'complaint-attachments',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        name: 'breaker.png',
        signature: 'sig_elec',
        mimeType: 'image/png',
        sizeOriginal: VALID_PNG_BYTES.byteLength,
        chunksTotal: 1,
        chunksUploaded: 1,
      },
      bytes: VALID_PNG_BYTES,
    },
  });

  const elecAdmin = {
    id: 'adm_elec',
    email: 'elec.admin@college.edu',
    name: 'Electrical Admin',
    role: 'department_admin',
    admin_assignments: [
      {
        $id: 'da_elec_maint',
        user_id: 'adm_elec',
        email: 'elec.admin@college.edu',
        department_id: 'dept_elec',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    department_id: 'dept_elec',
    department_name: 'Electrical',
  };
  const waterAdmin = {
    id: 'adm_water',
    email: 'water.admin@college.edu',
    name: 'Water Admin',
    role: 'department_admin',
    admin_assignments: [
      {
        $id: 'da_water_maint',
        user_id: 'adm_water',
        email: 'water.admin@college.edu',
        department_id: 'dept_water',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    department_id: 'dept_water',
    department_name: 'Water',
  };
  const compMaintAdmin = {
    id: 'adm_comp_maint',
    email: 'comp.maint@college.edu',
    name: 'Computer Maint Admin',
    role: 'department_admin',
    admin_assignments: [
      {
        $id: 'da_comp_maint',
        user_id: 'adm_comp_maint',
        email: 'comp.maint@college.edu',
        department_id: 'dept_comp',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    department_id: 'dept_comp',
    department_name: 'Computer',
  };
  const compAcadAdmin = {
    id: 'adm_comp_acad',
    email: 'comp.acad@college.edu',
    name: 'Computer Acad Admin',
    role: 'department_admin',
    admin_assignments: [
      {
        $id: 'da_comp_acad',
        user_id: 'adm_comp_acad',
        email: 'comp.acad@college.edu',
        department_id: 'dept_comp',
        scope: 'academic',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    department_id: 'dept_comp',
    department_name: 'Computer',
  };

  // Concerned Electrical Maintenance Admin succeeds across dashboard, queue, detail, attachment, and update
  const dashCtx = createMockContext();
  await handleGetAdminDashboard(dashCtx.context, elecAdmin, { databases });
  assert.equal(dashCtx.getResponse().statusCode, 200);
  assert.equal(dashCtx.getResponse().body.data.metrics.total_open, 1);

  const queueCtx = createMockContext();
  await handleListAdminComplaints(queueCtx.context, elecAdmin, {}, { databases });
  assert.equal(queueCtx.getResponse().statusCode, 200);
  assert.equal(queueCtx.getResponse().body.data.complaints.length, 1);

  const elecGetCtx = createMockContext();
  await handleGetComplaint(
    elecGetCtx.context,
    elecAdmin,
    { complaint_id: 'cmpl_comp_to_elec' },
    { databases }
  );
  assert.equal(elecGetCtx.getResponse().statusCode, 200);
  assert.equal(elecGetCtx.getResponse().body.data.complaint.student_name, 'Aarav Patel');
  assert.equal(elecGetCtx.getResponse().body.data.complaint.student_phone_number, '9876543210');
  assert.equal(elecGetCtx.getResponse().body.data.complaint.attachment_file_id, 'file_elec_1');

  const elecAttCtx = createMockContext();
  await handleGetComplaintAttachment(
    elecAttCtx.context,
    elecAdmin,
    { complaint_id: 'cmpl_comp_to_elec' },
    { databases, storage }
  );
  assert.equal(elecAttCtx.getResponse().statusCode, 200);

  const elecUpdateCtx = createMockContext();
  await handleUpdateAdminComplaint(
    elecUpdateCtx.context,
    elecAdmin,
    {
      complaint_id: 'cmpl_comp_to_elec',
      status: 'In Progress',
      official_response: 'Electrical technician replacing blown MCB circuit.',
    },
    { databases }
  );
  assert.equal(elecUpdateCtx.getResponse().statusCode, 200);

  // Non-concerned Water Maintenance Admin cannot view or manage Electrical complaint
  const waterQueueCtx = createMockContext();
  await handleListAdminComplaints(waterQueueCtx.context, waterAdmin, {}, { databases });
  assert.equal(waterQueueCtx.getResponse().statusCode, 200);
  assert.equal(waterQueueCtx.getResponse().body.data.complaints.length, 0);

  const waterGetCtx = createMockContext();
  await handleGetComplaint(
    waterGetCtx.context,
    waterAdmin,
    { complaint_id: 'cmpl_comp_to_elec' },
    { databases }
  );
  assert.equal(waterGetCtx.getResponse().statusCode, 404);

  const waterUpdateCtx = createMockContext();
  await handleUpdateAdminComplaint(
    waterUpdateCtx.context,
    waterAdmin,
    {
      complaint_id: 'cmpl_comp_to_elec',
      status: 'Resolved',
      official_response: 'Cross-department admin override attempt.',
    },
    { databases }
  );
  assert.equal(waterUpdateCtx.getResponse().statusCode, 404);

  // Computer Maintenance Admin also gets 404 because maintenance_department_id is dept_elec (not dept_comp)
  const compMaintGetCtx = createMockContext();
  await handleGetComplaint(
    compMaintGetCtx.context,
    compMaintAdmin,
    { complaint_id: 'cmpl_comp_to_elec' },
    { databases }
  );
  assert.equal(compMaintGetCtx.getResponse().statusCode, 404);

  const compMaintUpdateCtx = createMockContext();
  await handleUpdateAdminComplaint(
    compMaintUpdateCtx.context,
    compMaintAdmin,
    {
      complaint_id: 'cmpl_comp_to_elec',
      status: 'Resolved',
      official_response: 'Academic-origin maintenance admin override attempt.',
    },
    { databases }
  );
  assert.equal(compMaintUpdateCtx.getResponse().statusCode, 404);

  // Computer Academic-only Admin cannot access maintenance queues or update complaints
  const acadDashCtx = createMockContext();
  await handleGetAdminDashboard(acadDashCtx.context, compAcadAdmin, { databases });
  assert.equal(acadDashCtx.getResponse().statusCode, 403);

  const acadQueueCtx = createMockContext();
  await handleListAdminComplaints(acadQueueCtx.context, compAcadAdmin, {}, { databases });
  assert.equal(acadQueueCtx.getResponse().statusCode, 403);

  const acadGetCtx = createMockContext();
  await handleGetComplaint(
    acadGetCtx.context,
    compAcadAdmin,
    { complaint_id: 'cmpl_comp_to_elec' },
    { databases }
  );
  assert.equal(acadGetCtx.getResponse().statusCode, 404);

  const acadUpdateCtx = createMockContext();
  await handleUpdateAdminComplaint(
    acadUpdateCtx.context,
    compAcadAdmin,
    {
      complaint_id: 'cmpl_comp_to_elec',
      status: 'Resolved',
      official_response: 'Academic admin trying to resolve maintenance issue.',
    },
    { databases }
  );
  assert.equal(acadUpdateCtx.getResponse().statusCode, 403);
});

test('Phase 3 Scenario 8: Principal can inspect full complaint details and attachments across all departments, cannot change status, and spoofed student->principal escalation is blocked', async () => {
  const { databases } = createInMemoryDb({
    profiles: [
      makeStudentProfile('usr_comp_creator', 'Aarav Patel', '246510307054', 'dept_comp', '9876543210'),
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
        $id: 'cmpl_sanit_1',
        $collectionId: 'complaints',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T03:00:00.000Z',
        $updatedAt: '2026-11-10T03:00:00.000Z',
        $permissions: [],
        student_user_id: 'usr_comp_creator',
        student_name: 'Aarav Patel',
        student_enrollment_no: '246510307054',
        student_department_id: 'dept_comp',
        maintenance_department_id: 'dept_sanit',
        title: 'Sanitation inspection needed in Block C',
        location: 'Block C Washroom',
        description: 'Water drainage blocked on 2nd floor.',
        priority: 'high',
        status: 'Pending',
        support_count: 1,
        attachment_file_id: 'file_sanit_1',
        created_at: '2026-11-10T03:00:00.000Z',
        updated_at: '2026-11-10T03:00:00.000Z',
      },
    ],
  });

  const { storage } = createInMemoryStorage({
    file_sanit_1: {
      meta: {
        $id: 'file_sanit_1',
        bucketId: 'complaint-attachments',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        name: 'drain.png',
        signature: 'sig_sanit',
        mimeType: 'image/png',
        sizeOriginal: VALID_PNG_BYTES.byteLength,
        chunksTotal: 1,
        chunksUploaded: 1,
      },
      bytes: VALID_PNG_BYTES,
    },
  });

  const principalCaller = {
    id: 'usr_principal',
    email: 'principal@college.edu',
    name: 'Dr. Principal',
    role: 'principal',
    department_id: null,
    department_name: null,
  };

  // Principal reads full details across any maintenance department
  const getCtx = createMockContext();
  await handleGetComplaint(
    getCtx.context,
    principalCaller,
    { complaint_id: 'cmpl_sanit_1' },
    { databases }
  );
  assert.equal(getCtx.getResponse().statusCode, 200);
  const complaint = getCtx.getResponse().body.data.complaint;
  assert.equal(complaint.student_name, 'Aarav Patel');
  assert.equal(complaint.student_enrollment_no, '246510307054');
  assert.equal(complaint.student_phone_number, '9876543210');
  assert.equal(complaint.attachment_file_id, 'file_sanit_1');

  const attCtx = createMockContext();
  await handleGetComplaintAttachment(
    attCtx.context,
    principalCaller,
    { complaint_id: 'cmpl_sanit_1' },
    { databases, storage }
  );
  assert.equal(attCtx.getResponse().statusCode, 200);

  const supportStateCtx = createMockContext();
  await handleGetSupportState(
    supportStateCtx.context,
    principalCaller,
    { complaint_id: 'cmpl_sanit_1' },
    { databases }
  );
  assert.equal(supportStateCtx.getResponse().statusCode, 200);

  // Principal cannot mutate complaint status or use student/department-admin endpoints
  const updateCtx = createMockContext();
  await handleUpdateAdminComplaint(
    updateCtx.context,
    principalCaller,
    {
      complaint_id: 'cmpl_sanit_1',
      status: 'Resolved',
      official_response: 'Principal attempting to change complaint status.',
    },
    { databases }
  );
  assert.equal(updateCtx.getResponse().statusCode, 403);
  assert.equal(updateCtx.getResponse().body.code, 'FORBIDDEN');

  const studentFeedCtx = createMockContext();
  await handleListComplaints(studentFeedCtx.context, principalCaller, {}, { databases });
  assert.equal(studentFeedCtx.getResponse().statusCode, 403);

  const adminDashCtx = createMockContext();
  await handleGetAdminDashboard(adminDashCtx.context, principalCaller, { databases });
  assert.equal(adminDashCtx.getResponse().statusCode, 403);

  const adminQueueCtx = createMockContext();
  await handleListAdminComplaints(adminQueueCtx.context, principalCaller, {}, { databases });
  assert.equal(adminQueueCtx.getResponse().statusCode, 403);

  // Spoofed caller claiming principal role when DB profile says student is blocked
  const spoofedPrincipal = {
    id: 'usr_comp_creator',
    email: 'aarav@college.edu',
    name: 'Aarav Patel',
    role: 'principal',
    department_id: null,
    department_name: null,
  };
  const spoofGetCtx = createMockContext();
  await handleGetComplaint(
    spoofGetCtx.context,
    spoofedPrincipal,
    { complaint_id: 'cmpl_sanit_1' },
    { databases }
  );
  assert.equal(spoofGetCtx.getResponse().statusCode, 403);

  const spoofAttCtx = createMockContext();
  await handleGetComplaintAttachment(
    spoofAttCtx.context,
    spoofedPrincipal,
    { complaint_id: 'cmpl_sanit_1' },
    { databases, storage }
  );
  assert.equal(spoofAttCtx.getResponse().statusCode, 403);
});

test('Day 2 Exit Criteria: Public complaint UI/schema/API behavior is removed and maintenance selector is wired', () => {
  const newComplaintSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/complaints/new/page.tsx'),
    'utf8'
  );
  assert.ok(
    newComplaintSrc.includes('maintenanceDepartment'),
    'New complaint form must include maintenance department selector'
  );
  assert.ok(
    newComplaintSrc.includes('apiListDepartments'),
    'New complaint form must load departments from backend'
  );
  assert.ok(
    !newComplaintSrc.includes('Public Issue') && !newComplaintSrc.includes('issue_type'),
    'New complaint form must not expose public issue toggle or issue_type'
  );

  const filterBarSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/SearchAndFilterBar.tsx'),
    'utf8'
  );
  assert.ok(
    !filterBarSrc.includes('Public Issues'),
    'SearchAndFilterBar must not include Public Issues tab'
  );

  const dashboardSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/dashboard/page.tsx'),
    'utf8'
  );
  assert.ok(
    !dashboardSrc.includes("feedType === 'public'") && !dashboardSrc.includes('issue_type'),
    'Student dashboard must not filter or reference public complaints'
  );

  const schemasSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/schemas/index.ts'),
    'utf8'
  );
  assert.ok(
    !schemasSrc.includes("z.enum(['department', 'public'])"),
    'ComplaintCreateSchema must not accept public issue_type'
  );

  const apiClientSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/api/functions.ts'),
    'utf8'
  );
  assert.ok(
    apiClientSrc.includes('phone_number: input.phone_number'),
    'apiCompleteOnboarding must forward phone_number'
  );
  assert.ok(
    !apiClientSrc.includes("feed_type?: 'department' | 'public'"),
    'ListComplaintsParams must not accept public feed_type'
  );
});

test('Day 3 Exit Criteria: Storage bucket hardening, private attachment upload, and authorized-only attachment viewing', () => {
  const setupSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/setup-appwrite.mjs'),
    'utf8'
  );
  assert.ok(
    setupSrc.includes('5242880'),
    'setup-appwrite.mjs must enforce 5MB attachment limit (5242880)'
  );
  assert.ok(
    setupSrc.includes('Permission.create(Role.users())') && setupSrc.includes('fileSecurity: true'),
    'setup-appwrite.mjs must configure fileSecurity: true and user-create-only bucket permissions'
  );
  assert.ok(
    setupSrc.includes('idx_cmpl_attachment'),
    'setup-appwrite.mjs must index attachment_file_id on complaints for linkage verification'
  );

  const schemasSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/schemas/index.ts'),
    'utf8'
  );
  assert.ok(
    schemasSrc.includes('attachment_file_id') && schemasSrc.includes('[a-zA-Z0-9][a-zA-Z0-9._-]'),
    'ComplaintCreateSchema must validate attachment_file_id format'
  );

  const apiClientSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/api/functions.ts'),
    'utf8'
  );
  assert.ok(
    apiClientSrc.includes('apiGetComplaintAttachment') &&
      apiClientSrc.includes("'get-complaint-attachment'"),
    'functions.ts must expose apiGetComplaintAttachment for private attachment retrieval'
  );

  const newComplaintSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/complaints/new/page.tsx'),
    'utf8'
  );
  assert.ok(
    newComplaintSrc.includes('storage.createFile') &&
      newComplaintSrc.includes('Permission.read(Role.user(') &&
      newComplaintSrc.includes('attachment_file_id'),
    'New complaint form must upload attachments privately to Appwrite Storage and forward attachment_file_id'
  );
  assert.ok(
    newComplaintSrc.includes('storage.deleteFile'),
    'New complaint form must clean up orphaned storage upload if complaint creation fails'
  );

  const detailSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/complaints/[id]/page.tsx'),
    'utf8'
  );
  assert.ok(
    detailSrc.includes('apiGetComplaintAttachment'),
    'Complaint detail view must fetch private attachments via apiGetComplaintAttachment'
  );
  assert.ok(
    !detailSrc.includes('getFileView') && !detailSrc.includes('getFileDownload'),
    'Complaint detail view must never use direct public/browser Appwrite Storage URLs'
  );
  assert.ok(
    detailSrc.includes('student_phone_number') && detailSrc.includes('student_enrollment_no'),
    'Complaint detail view must conditionally render authorized submitter details when present'
  );

  const dashboardSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/dashboard/page.tsx'),
    'utf8'
  );
  assert.ok(
    dashboardSrc.includes('is_own_complaint'),
    'Student dashboard must support is_own_complaint so peer student_user_id stays redacted'
  );
});
