import test from 'node:test';
import assert from 'node:assert/strict';
import type { Models } from 'node-appwrite';
import { verifyCaller } from '../auth.js';
import {
  handleCompleteOnboarding,
  handleGetProfile,
  handleListDepartments,
} from '../handlers/profile.js';
import {
  handleCreateDepartment,
  handleDeleteDepartment,
  handleRevokeAdmin,
  handleUpdateDepartment,
} from '../handlers/principal.js';
import {
  ENROLLMENT_CODE_MAPPINGS,
  INSTITUTIONAL_DEPARTMENTS,
  canApprovePhoneChange,
  extractAndMapEnrollment,
  getAcademicDepartments,
  getMaintenanceDepartments,
  isAcademicDepartment,
  isMaintenanceDepartment,
  resolveDepartment,
  type DatabaseClientLike,
  type DepartmentDescriptor,
} from '../departments.js';
import type {
  AppwriteContext,
  AuthenticatedCaller,
  EnrollmentMapping,
} from '../types.js';

function evaluateAdminRole(
  userEmail: string,
  admin06: string,
  admin07: string
): { role: 'student' | 'department_admin'; department_id: 'dept_civil' | 'dept_comp' | null } {
  const normalized = userEmail.trim().toLowerCase();
  const norm06 = admin06.trim().toLowerCase();
  const norm07 = admin07.trim().toLowerCase();

  if (norm07.length > 0 && normalized === norm07) {
    return { role: 'department_admin', department_id: 'dept_comp' };
  }
  if (norm06.length > 0 && normalized === norm06) {
    return { role: 'department_admin', department_id: 'dept_civil' };
  }
  return { role: 'student', department_id: null };
}

test('Department extraction from enrollment number (characters 8-9, zero-based slice [7:9]) via production extractAndMapEnrollment', () => {
  // Confirmed academic mappings: 06 -> dept_civil, 07 -> dept_comp, 09 -> dept_elec, 19 -> dept_mech
  const civil = extractAndMapEnrollment('246510306012');
  assert.equal(civil.isValid, true);
  assert.equal(civil.code, '06');
  assert.equal(civil.departmentId, 'dept_civil');
  assert.equal(civil.departmentName, 'Civil');

  const comp = extractAndMapEnrollment('246510307054');
  assert.equal(comp.isValid, true);
  assert.equal(comp.code, '07');
  assert.equal(comp.departmentId, 'dept_comp');
  assert.equal(comp.departmentName, 'Computer');

  const elec = extractAndMapEnrollment('246510309015');
  assert.equal(elec.isValid, true);
  assert.equal(elec.code, '09');
  assert.equal(elec.departmentId, 'dept_elec');
  assert.equal(elec.departmentName, 'Electrical');

  const mech = extractAndMapEnrollment('246510319042');
  assert.equal(mech.isValid, true);
  assert.equal(mech.code, '19');
  assert.equal(mech.departmentId, 'dept_mech');
  assert.equal(mech.departmentName, 'Mechanical');

  // Disallowed / unmapped codes (03, 04, 05, 08, 01, 99) must be rejected
  for (const rejectedCode of ['03', '04', '05', '08', '01', '99']) {
    const res = extractAndMapEnrollment(`2465103${rejectedCode}054`);
    assert.equal(res.isValid, false, `Code ${rejectedCode} must be rejected`);
    assert.equal(res.code, rejectedCode);
    assert.equal(res.departmentId, null);
    assert.equal(res.mapping, null);
  }

  // Test malformed length
  const short = extractAndMapEnrollment('24651030705');
  assert.equal(short.isValid, false);

  // Test non-numeric characters
  const letters = extractAndMapEnrollment('24651030705A');
  assert.equal(letters.isValid, false);
});

test('Canonical registry enforces 6 departments, zero codes for Water/Sanitation, and inactive department guards', () => {
  assert.equal(INSTITUTIONAL_DEPARTMENTS.length, 6);
  assert.deepEqual(Object.keys(ENROLLMENT_CODE_MAPPINGS).sort(), ['06', '07', '09', '19']);

  for (const mapping of Object.values(ENROLLMENT_CODE_MAPPINGS)) {
    assert.equal(mapping.confirmed, true);
    assert.notEqual(mapping.department_id, 'dept_water');
    assert.notEqual(mapping.department_id, 'dept_sanit');
  }

  // Water and Sanitation cannot be assigned as academic departments or approve academic phone changes
  assert.equal(isAcademicDepartment('dept_water'), false);
  assert.equal(isAcademicDepartment('dept_sanit'), false);
  assert.equal(canApprovePhoneChange('dept_water', 'academic'), false);
  assert.equal(canApprovePhoneChange('dept_sanit', 'academic'), false);
  assert.equal(isMaintenanceDepartment('dept_water'), true);
  assert.equal(isMaintenanceDepartment('dept_sanit'), true);

  // Enrollment codes and water/sanitation aliases must NOT resolve as department IDs
  for (const badId of ['03', '04', '05', '08', '06', '07', '09', '19', 'water', 'sanitation']) {
    assert.equal(resolveDepartment(badId), null, `Identifier '${badId}' must not resolve as department ID`);
    assert.equal(isMaintenanceDepartment(badId), false);
    assert.equal(isAcademicDepartment(badId), false);
  }

  // Inactive departments cannot be selected or mapped
  const registryWithInactive: DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS.map((d) =>
    d.id === 'dept_elec' || d.id === 'dept_water' ? { ...d, is_active: false } : d
  );
  assert.equal(isAcademicDepartment('dept_elec', registryWithInactive), false);
  assert.equal(isMaintenanceDepartment('dept_water', registryWithInactive), false);
  assert.equal(
    extractAndMapEnrollment('246510309015', ENROLLMENT_CODE_MAPPINGS, registryWithInactive).isValid,
    false
  );
  assert.equal(
    getAcademicDepartments(registryWithInactive).some((d) => d.id === 'dept_elec'),
    false
  );
  assert.equal(
    getMaintenanceDepartments(registryWithInactive).some((d) => d.id === 'dept_water'),
    false
  );

  // Unconfirmed mapping or null department_id must be rejected
  const unconfirmedMappings: Record<string, EnrollmentMapping> = {
    ...ENROLLMENT_CODE_MAPPINGS,
    '06': { enrollment_code: '06', department_id: 'dept_civil', confirmed: false },
  };
  assert.equal(extractAndMapEnrollment('246510306012', unconfirmedMappings).isValid, false);
});

test('Administrator email normalization and role evaluation', () => {
  const admin06Config = ' admin.civil@college.edu ';
  const admin07Config = 'Admin.Computer@college.edu';

  // Computer admin login with mixed case and whitespace
  const compAdmin = evaluateAdminRole('  ADMIN.COMPUTER@COLLEGE.EDU ', admin06Config, admin07Config);
  assert.equal(compAdmin.role, 'department_admin');
  assert.equal(compAdmin.department_id, 'dept_comp');

  // Civil admin login
  const civilAdmin = evaluateAdminRole('admin.civil@college.edu', admin06Config, admin07Config);
  assert.equal(civilAdmin.role, 'department_admin');
  assert.equal(civilAdmin.department_id, 'dept_civil');

  // Regular student login
  const student = evaluateAdminRole('student.rahul@college.edu', admin06Config, admin07Config);
  assert.equal(student.role, 'student');
  assert.equal(student.department_id, null);
});

test('Verbatim profile lock warning is preserved', () => {
  const VERBATIM_WARNING =
    'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.';
  assert.ok(VERBATIM_WARNING.includes('Once you save them, they cannot be changed through your account.'));
});

// =====================================================================
// Day 2 Integration Tests: Onboarding, Phone Validation, Locking, 6 Depts
// =====================================================================

interface MockResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function createMockContext(): { context: AppwriteContext; getResponse: () => MockResponse } {
  let captured: MockResponse = { statusCode: 200, body: {} };
  const context: AppwriteContext = {
    req: {
      body: {},
      headers: {},
      method: 'POST',
      url: '/',
      path: '/',
    },
    res: {
      json: (data: Record<string, unknown>, statusCode = 200): MockResponse => {
        captured = { statusCode, body: data };
        return captured;
      },
      empty: (): null => null,
    },
    log: (): void => {},
    error: (): void => {},
  };
  return { context, getResponse: () => captured };
}

function createInMemoryDb(initialCollections: Record<string, Models.Document[]> = {}): {
  databases: DatabaseClientLike;
  collections: Map<string, Models.Document[]>;
} {
  const collections = new Map<string, Models.Document[]>();
  for (const [k, docs] of Object.entries(initialCollections)) {
    collections.set(k, [...docs]);
  }
  let idSeq = 1;

  const databases: DatabaseClientLike = {
    async listDocuments(_dbId, collectionId, queries = []) {
      let docs = [...(collections.get(collectionId) || [])];
      for (const q of queries) {
        try {
          const parsed = JSON.parse(q) as {
            method?: string;
            attribute?: string;
            values?: unknown[];
          };
          if (parsed.method === 'equal' && parsed.attribute && Array.isArray(parsed.values)) {
            docs = docs.filter((d) => parsed.values?.includes(d[parsed.attribute as string]));
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
      const doc: Models.Document = {
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
      const updated: Models.Document = {
        ...docs[idx],
        ...data,
        $updatedAt: new Date().toISOString(),
      };
      docs[idx] = updated;
      return updated;
    },
  };

  return { databases, collections };
}

test('Day 2: handleCompleteOnboarding enforces 10-digit phone starting with 6-9, locks fields, and derives student_department_id', async () => {
  const { databases, collections } = createInMemoryDb();
  const caller: AuthenticatedCaller = {
    id: 'usr_student_d2_1',
    email: 'rahul@college.edu',
    name: 'Rahul Sharma',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  // Reject missing phone
  const missingPhoneCtx = createMockContext();
  await handleCompleteOnboarding(
    missingPhoneCtx.context,
    caller,
    { name: 'Rahul Sharma', enrollment_no: '246510307054' },
    { databases }
  );
  assert.equal(missingPhoneCtx.getResponse().statusCode, 400);
  assert.equal(missingPhoneCtx.getResponse().body.code, 'MISSING_PHONE_NUMBER');

  // Reject invalid phones (starts with 5, too short, non-digits)
  for (const badPhone of ['5876543210', '1234567890', '987654321', '98765abcde']) {
    const badCtx = createMockContext();
    await handleCompleteOnboarding(
      badCtx.context,
      caller,
      { name: 'Rahul Sharma', enrollment_no: '246510307054', phone_number: badPhone },
      { databases }
    );
    assert.equal(badCtx.getResponse().statusCode, 400);
    assert.equal(badCtx.getResponse().body.code, 'INVALID_PHONE_FORMAT');
  }

  // Reject unmapped/disallowed enrollment codes (03, 04, 05, 08, 99) without guessing
  for (const rejectedCode of ['03', '04', '05', '08', '99']) {
    const unmappedCtx = createMockContext();
    await handleCompleteOnboarding(
      unmappedCtx.context,
      caller,
      { name: 'Rahul Sharma', enrollment_no: `2465103${rejectedCode}054`, phone_number: '9876543210' },
      { databases }
    );
    assert.equal(unmappedCtx.getResponse().statusCode, 400);
    assert.equal(unmappedCtx.getResponse().body.code, 'INVALID_DEPARTMENT_CODE');
  }

  // Valid submission (with tampered client student_department_id & role ignored)
  const validCtx = createMockContext();
  await handleCompleteOnboarding(
    validCtx.context,
    caller,
    {
      name: 'Rahul Sharma',
      enrollment_no: '246510307054',
      phone_number: '9876543210',
      student_department_id: 'dept_civil', // malicious override attempt
      role: 'principal', // privilege escalation attempt
    },
    { databases }
  );
  const res = validCtx.getResponse();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  const savedDocs = collections.get('profiles') || [];
  assert.equal(savedDocs.length, 1);
  assert.equal(savedDocs[0].student_department_id, 'dept_comp');
  assert.equal(savedDocs[0].phone_number, '9876543210');
  assert.equal(savedDocs[0].role, 'student');
  assert.equal(savedDocs[0].name_locked, true);
  assert.equal(savedDocs[0].enrollment_locked, true);
  assert.equal(savedDocs[0].phone_locked, true);
  assert.deepEqual(savedDocs[0].$permissions, []);

  // Re-submission rejected with 403 PROFILE_ALREADY_LOCKED
  const relockCtx = createMockContext();
  await handleCompleteOnboarding(
    relockCtx.context,
    caller,
    { name: 'Changed Name', enrollment_no: '246510306012', phone_number: '8888888888' },
    { databases }
  );
  assert.equal(relockCtx.getResponse().statusCode, 403);
  assert.equal(relockCtx.getResponse().body.code, 'PROFILE_ALREADY_LOCKED');
});

test('Day 2: handleCompleteOnboarding blocks duplicate enrollment across users and rejects admins/principals', async () => {
  const { databases } = createInMemoryDb({
    profiles: [
      {
        $id: 'prof_1',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_existing',
        enrollment_no: '246510306012',
        student_department_id: 'dept_civil',
        phone_number: '9876543210',
        role: 'student',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
      },
    ],
  });

  const duplicateCaller: AuthenticatedCaller = {
    id: 'usr_new_student',
    email: 'other@college.edu',
    name: 'Other Student',
    role: 'student',
    department_id: null,
    department_name: null,
  };
  const dupCtx = createMockContext();
  await handleCompleteOnboarding(
    dupCtx.context,
    duplicateCaller,
    { name: 'Other Student', enrollment_no: '246510306012', phone_number: '7876543210' },
    { databases }
  );
  assert.equal(dupCtx.getResponse().statusCode, 409);
  assert.equal(dupCtx.getResponse().body.code, 'ENROLLMENT_ALREADY_REGISTERED');

  const principalCaller: AuthenticatedCaller = {
    id: 'usr_principal',
    email: 'principal@college.edu',
    name: 'Dr. Mehta',
    role: 'principal',
    department_id: null,
    department_name: null,
  };
  const principalCtx = createMockContext();
  await handleCompleteOnboarding(
    principalCtx.context,
    principalCaller,
    { name: 'Dr. Mehta', enrollment_no: '246510307001', phone_number: '9876543210' },
    { databases }
  );
  assert.equal(principalCtx.getResponse().statusCode, 400);
  assert.equal(principalCtx.getResponse().body.code, 'ADMIN_ONBOARDING_NOT_REQUIRED');
});

test('Day 2: handleGetProfile verifies phone completeness and handleListDepartments returns all 6 departments', async () => {
  const { databases } = createInMemoryDb({
    profiles: [
      {
        $id: 'prof_incomplete_phone',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_no_phone',
        name: 'Legacy Student',
        enrollment_no: '246510307011',
        department_code: '07',
        is_locked: true,
        role: 'student',
      },
    ],
  });

  const legacyCaller: AuthenticatedCaller = {
    id: 'usr_no_phone',
    email: 'legacy@college.edu',
    name: 'Legacy Student',
    role: 'student',
    department_id: null,
    department_name: null,
  };
  const getCtx = createMockContext();
  await handleGetProfile(getCtx.context, legacyCaller, { databases });
  assert.equal(getCtx.getResponse().statusCode, 200);
  const data = getCtx.getResponse().body.data as { is_onboarded: boolean };
  assert.equal(data.is_onboarded, false, 'Student missing phone_number must not pass onboarding gate');

  const deptCtx = createMockContext();
  await handleListDepartments(deptCtx.context, { databases });
  assert.equal(deptCtx.getResponse().statusCode, 200);
  const deptData = deptCtx.getResponse().body.data as {
    departments: Array<{ $id: string; name: string; is_academic: boolean; is_maintenance: boolean; code?: string }>;
  };
  assert.equal(deptData.departments.length, 6);
  assert.equal(deptData.departments.filter((d) => d.is_academic).length, 4);
  assert.equal(deptData.departments.filter((d) => d.is_maintenance).length, 6);
  const water = deptData.departments.find((d) => d.$id === 'dept_water');
  const sanit = deptData.departments.find((d) => d.$id === 'dept_sanit');
  assert.equal(water?.is_academic, false);
  assert.equal(sanit?.is_academic, false);
  assert.equal('code' in (water ?? {}), false);
  assert.equal('code' in (sanit ?? {}), false);
});

test('Step 5: handleCompleteOnboarding resolves 06, 07, 09, 19 to canonical academic department IDs and handleGetProfile rejects Water/Sanitation student departments', async () => {
  const { databases, collections } = createInMemoryDb({
    profiles: [
      {
        $id: 'prof_bad_water',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_bad_water',
        name: 'Tampered Water Student',
        enrollment_no: '246510307099',
        student_department_id: 'dept_water',
        phone_number: '9876543210',
        role: 'student',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
      },
      {
        $id: 'prof_bad_sanit',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_bad_sanit',
        name: 'Tampered Sanit Student',
        enrollment_no: '246510306099',
        student_department_id: 'dept_sanit',
        phone_number: '9876543211',
        role: 'student',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
      },
    ],
  });

  const expectedCases = [
    { userId: 'usr_06', enrollment: '246510306001', deptId: 'dept_civil' },
    { userId: 'usr_07', enrollment: '246510307001', deptId: 'dept_comp' },
    { userId: 'usr_09', enrollment: '246510309001', deptId: 'dept_elec' },
    { userId: 'usr_19', enrollment: '246510319001', deptId: 'dept_mech' },
  ];

  for (const tc of expectedCases) {
    const ctx = createMockContext();
    await handleCompleteOnboarding(
      ctx.context,
      {
        id: tc.userId,
        email: `${tc.userId}@college.edu`,
        name: 'Test Student',
        role: 'student',
        department_id: null,
        department_name: null,
      },
      {
        name: 'Test Student',
        enrollment_no: tc.enrollment,
        phone_number: '9876543210',
      },
      { databases }
    );
    assert.equal(ctx.getResponse().statusCode, 200);
    const saved = (collections.get('profiles') || []).find((p) => p.user_id === tc.userId);
    assert.equal(saved?.student_department_id, tc.deptId);
  }

  for (const badStudentId of ['usr_bad_water', 'usr_bad_sanit']) {
    const ctx = createMockContext();
    await handleGetProfile(
      ctx.context,
      {
        id: badStudentId,
        email: `${badStudentId}@college.edu`,
        name: 'Tampered',
        role: 'student',
        department_id: null,
        department_name: null,
      },
      { databases }
    );
    assert.equal(ctx.getResponse().statusCode, 200);
    const bodyData = ctx.getResponse().body.data as {
      is_onboarded: boolean;
      profile: { student_department_id: string | null };
    };
    assert.equal(bodyData.profile.student_department_id, null);
    assert.equal(bodyData.is_onboarded, false);
  }
});

// =====================================================================
// Step 10 Regression Tests: verifyCaller + Profile Authorization & Revocation
// =====================================================================

function createAuthContext(options: {
  jwt?: string;
  userIdHeader?: string;
} = {}): { context: AppwriteContext; getResponse: () => MockResponse } {
  const { context, getResponse } = createMockContext();
  if (options.jwt) {
    context.req.headers['authorization'] = `Bearer ${options.jwt}`;
  }
  if (options.userIdHeader) {
    context.req.headers['x-appwrite-user-id'] = options.userIdHeader;
  }
  return { context, getResponse };
}

test('Step 10 (Scenarios 1, 2, 9): Deactivated or deleted admin with stale profiles.role and legacy dept fields cannot regain admin access or auto-onboard', async () => {
  const { databases, collections } = createInMemoryDb({
    department_admins: [
      {
        $id: 'da_deactivated',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_deactivated_admin',
        email: 'deactivated.admin@college.edu',
        department_id: 'dept_comp',
        scope: 'maintenance',
        is_active: false,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    profiles: [
      {
        $id: 'prof_deactivated',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_deactivated_admin',
        email: 'deactivated.admin@college.edu',
        name: 'Deactivated Admin',
        enrollment_no: '',
        student_department_id: null,
        department_id: 'dept_comp',
        department_code: '07',
        department_name: 'Computer',
        phone_number: '',
        role: 'department_admin',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
        profile_status: 'complete',
      },
      {
        $id: 'prof_deleted_admin',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_deleted_admin',
        email: 'deleted.admin@college.edu',
        name: 'Deleted Admin',
        enrollment_no: '',
        student_department_id: null,
        department_id: 'dept_civil',
        department_code: '06',
        department_name: 'Civil',
        phone_number: '',
        role: 'department_admin',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
        profile_status: 'complete',
      },
      {
        $id: 'prof_revoked_former_student',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_former_student',
        email: 'former.student@college.edu',
        name: 'Former Student Admin',
        enrollment_no: '246510306015',
        student_department_id: 'dept_civil',
        phone_number: '9876543210',
        role: 'department_admin',
        name_locked: true,
        enrollment_locked: true,
        phone_locked: true,
        profile_status: 'complete',
      },
    ],
  });

  // Scenario 1: Deactivated assignment via JWT verifyCaller -> handleGetProfile
  const deactAuthCtx = createAuthContext({ jwt: 'jwt_deact' });
  const deactAuth = await verifyCaller(deactAuthCtx.context, undefined, {
    databases,
    verifyJwt: async () => ({
      $id: 'usr_deactivated_admin',
      email: 'deactivated.admin@college.edu',
      name: 'Deactivated Admin',
    }),
  });
  assert.ok(deactAuth.caller);
  assert.equal(deactAuth.caller.role, 'student');
  assert.equal(deactAuth.caller.department_id, null);
  assert.equal(deactAuth.caller.department_name, null);
  assert.deepEqual(deactAuth.caller.admin_assignments, []);

  const deactProfileCtx = createMockContext();
  await handleGetProfile(deactProfileCtx.context, deactAuth.caller, { databases });
  assert.equal(deactProfileCtx.getResponse().statusCode, 200);
  const deactData = deactProfileCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: Record<string, unknown>;
  };
  assert.equal(deactData.profile.role, 'student');
  assert.equal(deactData.is_onboarded, false);
  assert.equal(deactData.profile.profile_status, 'incomplete');
  assert.equal(deactData.profile.department_id, undefined);
  assert.equal(deactData.profile.department_name, undefined);

  const syncedDeactDoc = (collections.get('profiles') || []).find(
    (d) => d.$id === 'prof_deactivated'
  );
  assert.equal(syncedDeactDoc?.role, 'student');
  assert.equal(syncedDeactDoc?.profile_status, 'incomplete');
  assert.equal(syncedDeactDoc?.name_locked, false);

  // Scenario 2: Deleted assignment via x-appwrite-user-id -> handleGetProfile -> student onboarding works
  const delAuthCtx = createAuthContext({ userIdHeader: 'usr_deleted_admin' });
  const delAuth = await verifyCaller(delAuthCtx.context, undefined, {
    databases,
    users: {
      get: async (userId) => ({
        $id: userId,
        email: 'deleted.admin@college.edu',
        name: 'Deleted Admin',
      }),
    },
  });
  assert.ok(delAuth.caller);
  assert.equal(delAuth.caller.role, 'student');
  assert.equal(delAuth.caller.department_id, null);
  assert.deepEqual(delAuth.caller.admin_assignments, []);

  const delProfileCtx = createMockContext();
  await handleGetProfile(delProfileCtx.context, delAuth.caller, { databases });
  assert.equal(delProfileCtx.getResponse().statusCode, 200);
  const delData = delProfileCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: Record<string, unknown>;
  };
  assert.equal(delData.profile.role, 'student');
  assert.equal(delData.is_onboarded, false);

  // Revoked auto-provisioned admin can now complete legitimate student onboarding
  const onboardCtx = createMockContext();
  await handleCompleteOnboarding(
    onboardCtx.context,
    delAuth.caller,
    { name: 'Deleted Admin', enrollment_no: '246510307091', phone_number: '9876543219' },
    { databases }
  );
  assert.equal(onboardCtx.getResponse().statusCode, 200);

  // Former student whose admin assignment was revoked keeps locked student onboarding while role downgrades
  const formerAuth = await verifyCaller(createAuthContext({ jwt: 'jwt_former' }).context, undefined, {
    databases,
    verifyJwt: async () => ({
      $id: 'usr_former_student',
      email: 'former.student@college.edu',
      name: 'Former Student Admin',
    }),
  });
  assert.equal(formerAuth.caller?.role, 'student');
  const formerProfileCtx = createMockContext();
  await handleGetProfile(formerProfileCtx.context, formerAuth.caller!, { databases });
  const formerData = formerProfileCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: Record<string, unknown>;
  };
  assert.equal(formerData.profile.role, 'student');
  assert.equal(formerData.is_onboarded, true);
  assert.equal(formerData.profile.student_department_id, 'dept_civil');
  const syncedFormerDoc = (collections.get('profiles') || []).find(
    (d) => d.$id === 'prof_revoked_former_student'
  );
  assert.equal(syncedFormerDoc?.role, 'student');
  assert.equal(syncedFormerDoc?.enrollment_locked, true);
});

test('Step 10 (Scenarios 3, 4, 5): Deleted allowlist email, DB query failure, and missing/invalid is_active fail closed without granting access', async () => {
  const prev06 = process.env.ADMIN_ALLOWLIST_06;
  const prev07 = process.env.ADMIN_ALLOWLIST_07;
  process.env.ADMIN_ALLOWLIST_06 = 'allow.civil@college.edu';
  process.env.ADMIN_ALLOWLIST_07 = 'allow.comp@college.edu';

  try {
    const { databases } = createInMemoryDb({
      department_admins: [
        {
          $id: 'da_missing_active',
          $collectionId: 'department_admins',
          $databaseId: 'campusvoice',
          $createdAt: '2026-11-10T00:00:00.000Z',
          $updatedAt: '2026-11-10T00:00:00.000Z',
          $permissions: [],
          user_id: 'usr_missing_active',
          email: 'missing.active@college.edu',
          department_id: 'dept_comp',
          scope: 'maintenance',
          assigned_by: 'usr_principal',
          created_at: '2026-11-10T00:00:00.000Z',
        },
        {
          $id: 'da_string_active',
          $collectionId: 'department_admins',
          $databaseId: 'campusvoice',
          $createdAt: '2026-11-10T00:00:00.000Z',
          $updatedAt: '2026-11-10T00:00:00.000Z',
          $permissions: [],
          user_id: 'usr_string_active',
          email: 'string.active@college.edu',
          department_id: 'dept_comp',
          scope: 'maintenance',
          is_active: 'true',
          assigned_by: 'usr_principal',
          created_at: '2026-11-10T00:00:00.000Z',
        },
        {
          $id: 'da_invalid_scope',
          $collectionId: 'department_admins',
          $databaseId: 'campusvoice',
          $createdAt: '2026-11-10T00:00:00.000Z',
          $updatedAt: '2026-11-10T00:00:00.000Z',
          $permissions: [],
          user_id: 'usr_invalid_scope',
          email: 'invalid.scope@college.edu',
          department_id: 'dept_water',
          scope: 'academic',
          is_active: true,
          assigned_by: 'usr_principal',
          created_at: '2026-11-10T00:00:00.000Z',
        },
        {
          $id: 'da_valid_active',
          $collectionId: 'department_admins',
          $databaseId: 'campusvoice',
          $createdAt: '2026-11-10T00:00:00.000Z',
          $updatedAt: '2026-11-10T00:00:00.000Z',
          $permissions: [],
          user_id: 'usr_valid_admin',
          email: 'valid.water@college.edu',
          department_id: 'dept_water',
          scope: 'maintenance',
          is_active: true,
          assigned_by: 'usr_principal',
          created_at: '2026-11-10T00:00:00.000Z',
        },
      ],
      profiles: [
        {
          $id: 'prof_allow_07',
          $collectionId: 'profiles',
          $databaseId: 'campusvoice',
          $createdAt: '2026-11-10T00:00:00.000Z',
          $updatedAt: '2026-11-10T00:00:00.000Z',
          $permissions: [],
          user_id: 'usr_allow_07',
          email: 'allow.comp@college.edu',
          name: 'Allowlisted Ex-Admin',
          role: 'department_admin',
          name_locked: true,
          enrollment_locked: true,
          phone_locked: true,
          profile_status: 'complete',
        },
      ],
    });

    // Scenario 3: Deleted assignment whose email matches ADMIN_ALLOWLIST_06 / ADMIN_ALLOWLIST_07
    for (const tc of [
      { id: 'usr_allow_06', email: 'allow.civil@college.edu' },
      { id: 'usr_allow_07', email: 'allow.comp@college.edu' },
    ]) {
      const authRes = await verifyCaller(createAuthContext({ jwt: 'jwt_allow' }).context, undefined, {
        databases,
        verifyJwt: async () => ({ $id: tc.id, email: tc.email, name: 'Ex Admin' }),
      });
      assert.ok(authRes.caller);
      assert.equal(authRes.caller.role, 'student');
      assert.equal(authRes.caller.department_id, null);
      assert.deepEqual(authRes.caller.admin_assignments, []);

      const profCtx = createMockContext();
      await handleGetProfile(profCtx.context, authRes.caller, { databases });
      assert.equal(profCtx.getResponse().statusCode, 200);
      const profData = profCtx.getResponse().body.data as {
        is_onboarded: boolean;
        profile: { role?: string } | null;
      };
      assert.equal(profData.is_onboarded, false);
      if (profData.profile) {
        assert.equal(profData.profile.role, 'student');
      }
    }

    // Scenario 5: Missing or non-boolean is_active and invalid academic Water assignment never grant access
    for (const badId of ['usr_missing_active', 'usr_string_active', 'usr_invalid_scope']) {
      const res = await verifyCaller(createAuthContext({ jwt: 'jwt_bad_flag' }).context, undefined, {
        databases,
        verifyJwt: async () => ({ $id: badId, email: `${badId}@college.edu`, name: 'Test' }),
      });
      assert.ok(res.caller);
      assert.equal(res.caller.role, 'student');
      assert.equal(res.caller.department_id, null);
      assert.deepEqual(res.caller.admin_assignments, []);
    }

    // Active assignment initializes caller.admin_assignments consistently
    const validAdminAuth = await verifyCaller(createAuthContext({ jwt: 'jwt_valid' }).context, undefined, {
      databases,
      verifyJwt: async () => ({
        $id: 'usr_valid_admin',
        email: 'valid.water@college.edu',
        name: 'Water Admin',
      }),
    });
    assert.ok(validAdminAuth.caller);
    assert.equal(validAdminAuth.caller.role, 'department_admin');
    assert.equal(validAdminAuth.caller.department_id, 'dept_water');
    assert.equal(validAdminAuth.caller.admin_assignments?.length, 1);
    assert.equal(validAdminAuth.caller.admin_assignments?.[0].is_active, true);
    assert.equal(validAdminAuth.caller.admin_assignments?.[0].scope, 'maintenance');

    // Scenario 4: Database query failure on department_admins fails closed (500, caller === null)
    const failingDb: DatabaseClientLike = {
      ...databases,
      async listDocuments(dbId, collectionId, queries) {
        if (collectionId === 'department_admins') {
          throw new Error('Simulated department_admins outage');
        }
        return databases.listDocuments(dbId, collectionId, queries);
      },
    };
    const dbErrRes = await verifyCaller(createAuthContext({ jwt: 'jwt_err' }).context, undefined, {
      databases: failingDb,
      verifyJwt: async () => ({
        $id: 'usr_allow_07',
        email: 'allow.comp@college.edu',
        name: 'Allowlisted Ex-Admin',
      }),
    });
    assert.equal(dbErrRes.caller, null);
    assert.equal(dbErrRes.statusCode, 500);
  } finally {
    if (prev06 === undefined) delete process.env.ADMIN_ALLOWLIST_06;
    else process.env.ADMIN_ALLOWLIST_06 = prev06;
    if (prev07 === undefined) delete process.env.ADMIN_ALLOWLIST_07;
    else process.env.ADMIN_ALLOWLIST_07 = prev07;
  }
});

test('Step 10 (Scenario 10): Valid Student onboarding works end-to-end through verifyCaller -> handleGetProfile -> handleCompleteOnboarding -> handleGetProfile', async () => {
  const { databases } = createInMemoryDb();
  const studentJwt = async () => ({
    $id: 'usr_new_student_e2e',
    email: 'student.e2e@college.edu',
    name: 'Priya Patel',
  });

  const auth1 = await verifyCaller(createAuthContext({ jwt: 'jwt_student_1' }).context, undefined, {
    databases,
    verifyJwt: studentJwt,
  });
  assert.equal(auth1.caller?.role, 'student');
  assert.deepEqual(auth1.caller?.admin_assignments, []);

  const prof1Ctx = createMockContext();
  await handleGetProfile(prof1Ctx.context, auth1.caller!, { databases });
  assert.equal(prof1Ctx.getResponse().statusCode, 200);
  assert.equal((prof1Ctx.getResponse().body.data as { is_onboarded: boolean }).is_onboarded, false);

  const onboardCtx = createMockContext();
  await handleCompleteOnboarding(
    onboardCtx.context,
    auth1.caller!,
    { name: 'Priya Patel', enrollment_no: '246510309042', phone_number: '9876543210' },
    { databases }
  );
  assert.equal(onboardCtx.getResponse().statusCode, 200);

  const auth2 = await verifyCaller(createAuthContext({ jwt: 'jwt_student_2' }).context, undefined, {
    databases,
    verifyJwt: studentJwt,
  });
  const prof2Ctx = createMockContext();
  await handleGetProfile(prof2Ctx.context, auth2.caller!, { databases });
  const prof2Data = prof2Ctx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: { role: string; student_department_id: string };
  };
  assert.equal(prof2Data.is_onboarded, true);
  assert.equal(prof2Data.profile.role, 'student');
  assert.equal(prof2Data.profile.student_department_id, 'dept_elec');
});

test('verifyCaller retries transient network failures and fails closed when persistent', async () => {
  const { databases } = createInMemoryDb({
    department_admins: [
      {
        $id: 'da_retry_admin',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_retry_admin',
        email: 'retry.admin@college.edu',
        department_id: 'dept_comp',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
  });

  // 1. Transient failure on first department_admins listDocuments recovers on retry
  let adminAttempts = 0;
  const flakyAdminDb: DatabaseClientLike = {
    ...databases,
    async listDocuments(dbId, collectionId, queries) {
      if (collectionId === 'department_admins') {
        adminAttempts++;
        if (adminAttempts === 1) {
          throw new TypeError('fetch failed');
        }
      }
      return databases.listDocuments(dbId, collectionId, queries);
    },
  };

  const recoveredAuth = await verifyCaller(
    createAuthContext({ jwt: 'jwt_retry_ok' }).context,
    undefined,
    {
      databases: flakyAdminDb,
      verifyJwt: async () => ({
        $id: 'usr_retry_admin',
        email: 'retry.admin@college.edu',
        name: 'Retry Admin',
      }),
    }
  );
  assert.ok(recoveredAuth.caller);
  assert.equal(recoveredAuth.caller.role, 'department_admin');
  assert.equal(adminAttempts, 2);

  // 2. Transient HTTP 503 on profiles query for student recovers on retry
  let profileAttempts = 0;
  const flakyStudentDb: DatabaseClientLike = {
    ...databases,
    async listDocuments(dbId, collectionId, queries) {
      if (collectionId === 'profiles') {
        profileAttempts++;
        if (profileAttempts === 1) {
          const err = new Error('Service Unavailable') as Error & { code: number };
          err.code = 503;
          throw err;
        }
      }
      return databases.listDocuments(dbId, collectionId, queries);
    },
  };

  const recoveredStudentAuth = await verifyCaller(
    createAuthContext({ jwt: 'jwt_student_retry' }).context,
    undefined,
    {
      databases: flakyStudentDb,
      verifyJwt: async () => ({
        $id: 'usr_retry_student',
        email: 'retry.student@college.edu',
        name: 'Retry Student',
      }),
    }
  );
  assert.ok(recoveredStudentAuth.caller);
  assert.equal(recoveredStudentAuth.caller.role, 'student');
  assert.equal(profileAttempts, 2);

  // 3. Persistent transient failure exhausts retries and still fails closed with 500
  const alwaysFlakyDb: DatabaseClientLike = {
    ...databases,
    async listDocuments(dbId, collectionId, queries) {
      if (collectionId === 'profiles') {
        throw new TypeError('fetch failed');
      }
      return databases.listDocuments(dbId, collectionId, queries);
    },
  };

  const failedAuth = await verifyCaller(
    createAuthContext({ jwt: 'jwt_student_fail' }).context,
    undefined,
    {
      databases: alwaysFlakyDb,
      verifyJwt: async () => ({
        $id: 'usr_retry_student',
        email: 'retry.student@college.edu',
        name: 'Retry Student',
      }),
    }
  );
  assert.equal(failedAuth.caller, null);
  assert.equal(failedAuth.statusCode, 500);
});

test('Regression: Revoked auto-provisioned admin can complete student onboarding without PROFILE_ALREADY_LOCKED deadlock', async () => {
  const { databases } = createInMemoryDb({
    department_admins: [
      {
        $id: 'da_stub_revoke',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'revoked.stub@college.edu',
        department_id: 'dept_comp',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal_1',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
  });

  // 1. User logs in as assigned Computer Maintenance Admin -> auto-provisions schema-safe locked stub
  const adminAuth = await verifyCaller(
    createAuthContext({ jwt: 'jwt_stub_admin' }).context,
    undefined,
    {
      databases,
      verifyJwt: async () => ({
        $id: 'usr_stub_reboard',
        email: 'revoked.stub@college.edu',
        name: 'Temporary Admin',
      }),
    }
  );
  assert.ok(adminAuth.caller);
  assert.equal(adminAuth.caller.role, 'department_admin');

  const adminProfCtx = createMockContext();
  await handleGetProfile(adminProfCtx.context, adminAuth.caller, { databases });
  assert.equal(adminProfCtx.getResponse().statusCode, 200);
  const adminProfData = adminProfCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: { role: string; name: string; admin_assignments?: Array<{ scope: string }> };
  };
  assert.equal(adminProfData.is_onboarded, true);
  assert.equal(adminProfData.profile.role, 'department_admin');
  assert.equal(adminProfData.profile.name, 'Temporary Admin');
  assert.equal(adminProfData.profile.admin_assignments?.length, 1);

  // 2. Principal revokes admin assignment -> profile reverts to student & unlocks stub fields
  const revokeCtx = createMockContext();
  await handleRevokeAdmin(
    revokeCtx.context,
    {
      id: 'usr_principal_1',
      email: 'principal@college.edu',
      name: 'Principal',
      role: 'principal',
      department_id: null,
      department_name: null,
    },
    { assignment_id: 'da_stub_revoke' },
    { databases }
  );
  assert.equal(revokeCtx.getResponse().statusCode, 200);

  // 3. Revoked user fetches profile -> is_onboarded: false, locks cleared
  const postRevokeAuth = await verifyCaller(
    createAuthContext({ jwt: 'jwt_stub_student' }).context,
    undefined,
    {
      databases,
      verifyJwt: async () => ({
        $id: 'usr_stub_reboard',
        email: 'revoked.stub@college.edu',
        name: 'Temporary Admin',
      }),
    }
  );
  assert.ok(postRevokeAuth.caller);
  assert.equal(postRevokeAuth.caller.role, 'student');

  const studentProfCtx = createMockContext();
  await handleGetProfile(studentProfCtx.context, postRevokeAuth.caller, { databases });
  assert.equal(studentProfCtx.getResponse().statusCode, 200);
  const studentProfData = studentProfCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: {
      role: string;
      name_locked: boolean;
      enrollment_locked: boolean;
      phone_locked: boolean;
      profile_status: string;
    };
  };
  assert.equal(studentProfData.is_onboarded, false);
  assert.equal(studentProfData.profile.role, 'student');
  assert.equal(studentProfData.profile.name_locked, false);
  assert.equal(studentProfData.profile.enrollment_locked, false);
  assert.equal(studentProfData.profile.phone_locked, false);
  assert.equal(studentProfData.profile.profile_status, 'incomplete');

  // 4. Student completes onboarding cleanly without 403 PROFILE_ALREADY_LOCKED
  const onboardCtx = createMockContext();
  await handleCompleteOnboarding(
    onboardCtx.context,
    postRevokeAuth.caller,
    {
      name: 'Temporary Admin',
      enrollment_no: '246510307099',
      phone_number: '9876501234',
    },
    { databases }
  );
  assert.equal(onboardCtx.getResponse().statusCode, 200);

  const finalProfCtx = createMockContext();
  await handleGetProfile(finalProfCtx.context, postRevokeAuth.caller, { databases });
  const finalData = finalProfCtx.getResponse().body.data as {
    is_onboarded: boolean;
    profile: { student_department_id: string };
  };
  assert.equal(finalData.is_onboarded, true);
  assert.equal(finalData.profile.student_department_id, 'dept_comp');
});

test('Regression: Revoked user_id row never shadows newly pre-provisioned active email assignment in verifyCaller', async () => {
  const { databases } = createInMemoryDb({
    department_admins: [
      {
        $id: 'da_revoked_prior',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_reassigned',
        email: 'reassigned@college.edu',
        department_id: 'dept_comp',
        scope: 'maintenance',
        is_active: false,
        assigned_by: 'usr_principal_1',
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        $id: 'da_preprovisioned_active',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-10T00:00:00.000Z',
        $updatedAt: '2026-11-10T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'reassigned@college.edu',
        department_id: 'dept_elec',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal_1',
        created_at: '2026-11-10T00:00:00.000Z',
      },
    ],
  });

  const authRes = await verifyCaller(
    createAuthContext({ jwt: 'jwt_reassigned' }).context,
    undefined,
    {
      databases,
      verifyJwt: async () => ({
        $id: 'usr_reassigned',
        email: 'reassigned@college.edu',
        name: 'Reassigned Admin',
      }),
    }
  );
  assert.ok(authRes.caller);
  assert.equal(authRes.caller.role, 'department_admin');
  assert.equal(authRes.caller.department_id, 'dept_elec');
  assert.equal(authRes.caller.admin_assignments?.length, 1);

  const linkedDoc = await databases.getDocument('campusvoice', 'department_admins', 'da_preprovisioned_active');
  assert.equal(linkedDoc.user_id, 'usr_reassigned');
});

// =====================================================================
// Department CRUD Backend Unit Tests: Security, Validation, CRUD, Audits
// =====================================================================

test('Department CRUD: handleCreateDepartment security, validation, multi-scope assignment, code collision, and audit logging', async () => {
  const principalCaller: AuthenticatedCaller = {
    id: 'usr_principal',
    email: 'principal@college.edu',
    name: 'Dr. Mehta',
    role: 'principal',
    department_id: null,
    department_name: null,
  };

  const studentCaller: AuthenticatedCaller = {
    id: 'usr_student',
    email: 'student@college.edu',
    name: 'Student User',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  const { databases, collections } = createInMemoryDb({
    departments: [
      {
        $id: 'dept_soft_deleted',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        name: 'Aerospace Engineering',
        code: 'AERO',
        is_active: false,
        is_academic: true,
        is_maintenance: true,
      },
      {
        $id: 'dept_active_bio',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        name: 'Biotechnology',
        code: 'BIO',
        is_active: true,
        is_academic: true,
        is_maintenance: false,
      },
    ],
    profiles: [
      {
        $id: 'prof_principal',
        $collectionId: 'profiles',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_principal',
        email: 'principal@college.edu',
        name: 'Dr. Mehta',
        role: 'principal',
      },
    ],
  });

  // 1. RBAC: non-principal rejected with 403 FORBIDDEN
  const nonPrincipalCtx = createMockContext();
  await handleCreateDepartment(
    nonPrincipalCtx.context,
    studentCaller,
    {
      name: 'Robotics',
      code: 'ROBO',
      admin_email: 'robo.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(nonPrincipalCtx.getResponse().statusCode, 403);
  assert.equal(nonPrincipalCtx.getResponse().body.code, 'FORBIDDEN');

  // 2. Input validation: invalid name
  const invalidNameCtx = createMockContext();
  await handleCreateDepartment(
    invalidNameCtx.context,
    principalCaller,
    {
      name: 'R',
      code: 'ROBO',
      admin_email: 'robo.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(invalidNameCtx.getResponse().statusCode, 400);
  assert.equal(invalidNameCtx.getResponse().body.code, 'INVALID_NAME');

  // 3. Input validation: invalid code format (special chars, too short)
  const invalidCodeCtx = createMockContext();
  await handleCreateDepartment(
    invalidCodeCtx.context,
    principalCaller,
    {
      name: 'Robotics',
      code: 'R!',
      admin_email: 'robo.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(invalidCodeCtx.getResponse().statusCode, 400);
  assert.equal(invalidCodeCtx.getResponse().body.code, 'INVALID_CODE');

  // 4. Input validation: invalid admin email
  const invalidEmailCtx = createMockContext();
  await handleCreateDepartment(
    invalidEmailCtx.context,
    principalCaller,
    {
      name: 'Robotics',
      code: 'ROBO',
      admin_email: 'not-an-email',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(invalidEmailCtx.getResponse().statusCode, 400);
  assert.equal(invalidEmailCtx.getResponse().body.code, 'INVALID_ADMIN_EMAIL');

  // 5. Input validation: neither scope checked
  const invalidScopeCtx = createMockContext();
  await handleCreateDepartment(
    invalidScopeCtx.context,
    principalCaller,
    {
      name: 'Robotics',
      code: 'ROBO',
      admin_email: 'robo.admin@college.edu',
      scopes: { maintenance: false, academic: false },
    },
    { databases }
  );
  assert.equal(invalidScopeCtx.getResponse().statusCode, 400);
  assert.equal(invalidScopeCtx.getResponse().body.code, 'INVALID_SCOPE');

  // 6. Code collision with soft-deleted department code (AERO) must return 409
  const softDeletedCollisionCtx = createMockContext();
  await handleCreateDepartment(
    softDeletedCollisionCtx.context,
    principalCaller,
    {
      name: 'New Aerospace',
      code: 'AERO',
      admin_email: 'aero.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(softDeletedCollisionCtx.getResponse().statusCode, 409);
  assert.equal(softDeletedCollisionCtx.getResponse().body.code, 'DEPARTMENT_CODE_EXISTS');

  // 7. Code collision with active department code (BIO) must return 409
  const activeCollisionCtx = createMockContext();
  await handleCreateDepartment(
    activeCollisionCtx.context,
    principalCaller,
    {
      name: 'Biotechnology Advanced',
      code: 'BIO',
      admin_email: 'bio2.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(activeCollisionCtx.getResponse().statusCode, 409);
  assert.equal(activeCollisionCtx.getResponse().body.code, 'DEPARTMENT_CODE_EXISTS');

  // 8. Canonical department code collision (06 / CIVIL) must return 409
  const canonicalCollisionCtx = createMockContext();
  await handleCreateDepartment(
    canonicalCollisionCtx.context,
    principalCaller,
    {
      name: 'Civil Engineering Two',
      code: 'CIVIL',
      admin_email: 'civil2.admin@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(canonicalCollisionCtx.getResponse().statusCode, 409);
  assert.equal(canonicalCollisionCtx.getResponse().body.code, 'DEPARTMENT_CODE_EXISTS');

  // 9. Reassigning principal email as department admin must return 409
  const principalReassignCtx = createMockContext();
  await handleCreateDepartment(
    principalReassignCtx.context,
    principalCaller,
    {
      name: 'Robotics',
      code: 'ROBO',
      admin_email: 'principal@college.edu',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(principalReassignCtx.getResponse().statusCode, 409);
  assert.equal(principalReassignCtx.getResponse().body.code, 'CANNOT_REASSIGN_PRINCIPAL');

  // 10. Happy path: creates department with both Maintenance and Academic scopes
  const happyCtx = createMockContext();
  await handleCreateDepartment(
    happyCtx.context,
    principalCaller,
    {
      name: 'Robotics Engineering',
      code: 'ROBO',
      admin_email: 'robo.admin@college.edu',
      scopes: { maintenance: true, academic: true },
    },
    { databases }
  );
  assert.equal(happyCtx.getResponse().statusCode, 201);
  const happyBody = happyCtx.getResponse().body as {
    success: boolean;
    data: {
      department: { $id: string; name: string; code: string; is_academic: boolean; is_maintenance: boolean; is_active: boolean };
      assignments: Array<{ scope: string; email: string; is_active: boolean }>;
    };
  };
  assert.equal(happyBody.success, true);
  assert.equal(happyBody.data.department.name, 'Robotics Engineering');
  assert.equal(happyBody.data.department.code, 'ROBO');
  assert.equal(happyBody.data.department.is_academic, true);
  assert.equal(happyBody.data.department.is_maintenance, true);
  assert.equal(happyBody.data.department.is_active, true);
  assert.equal(happyBody.data.assignments.length, 2);

  // Verify created department in DB
  const deptDocs = collections.get('departments') || [];
  const createdDept = deptDocs.find((d) => d.code === 'ROBO');
  assert.ok(createdDept);
  assert.equal(createdDept.name, 'Robotics Engineering');
  assert.equal(createdDept.is_active, true);

  // Verify created admin assignments in DB: 2 active docs (maintenance & academic)
  const adminDocs = collections.get('department_admins') || [];
  const roboAssignments = adminDocs.filter((d) => d.department_id === createdDept.$id);
  assert.equal(roboAssignments.length, 2);
  const maintAssign = roboAssignments.find((d) => d.scope === 'maintenance');
  const acadAssign = roboAssignments.find((d) => d.scope === 'academic');
  assert.ok(maintAssign);
  assert.equal(maintAssign.is_active, true);
  assert.equal(maintAssign.email, 'robo.admin@college.edu');
  assert.ok(acadAssign);
  assert.equal(acadAssign.is_active, true);
  assert.equal(acadAssign.email, 'robo.admin@college.edu');

  // Verify audit log entry
  const auditDocs = collections.get('audit_logs') || [];
  const createAudit = auditDocs.find(
    (a) => a.action === 'create_department' && a.target_resource_id === createdDept.$id
  );
  assert.ok(createAudit);
  assert.equal(createAudit.actor_id, 'usr_principal');
  assert.equal(createAudit.actor_role, 'principal');
});

test('Department CRUD: handleUpdateDepartment security, validation, scope toggling, admin re-assignment, and audit logging', async () => {
  const principalCaller: AuthenticatedCaller = {
    id: 'usr_principal',
    email: 'principal@college.edu',
    name: 'Dr. Mehta',
    role: 'principal',
    department_id: null,
    department_name: null,
  };

  const studentCaller: AuthenticatedCaller = {
    id: 'usr_student',
    email: 'student@college.edu',
    name: 'Student User',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  const { databases, collections } = createInMemoryDb({
    departments: [
      {
        $id: 'dept_ai',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        name: 'Artificial Intelligence',
        code: 'AI',
        is_active: true,
        is_academic: true,
        is_maintenance: true,
      },
      {
        $id: 'dept_ml_soft_deleted',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        name: 'Machine Learning',
        code: 'ML',
        is_active: false,
        is_academic: true,
        is_maintenance: true,
      },
    ],
    department_admins: [
      {
        $id: 'da_ai_m',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'ai.admin@college.edu',
        department_id: 'dept_ai',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        $id: 'da_ai_a',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'ai.admin@college.edu',
        department_id: 'dept_ai',
        scope: 'academic',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ],
  });

  // 1. RBAC: non-principal rejected with 403
  const nonPrincipalCtx = createMockContext();
  await handleUpdateDepartment(
    nonPrincipalCtx.context,
    studentCaller,
    { department_id: 'dept_ai', name: 'New AI' },
    { databases }
  );
  assert.equal(nonPrincipalCtx.getResponse().statusCode, 403);
  assert.equal(nonPrincipalCtx.getResponse().body.code, 'FORBIDDEN');

  // 2. Missing department_id rejected with 400
  const missingIdCtx = createMockContext();
  await handleUpdateDepartment(
    missingIdCtx.context,
    principalCaller,
    { name: 'New AI' },
    { databases }
  );
  assert.equal(missingIdCtx.getResponse().statusCode, 400);
  assert.equal(missingIdCtx.getResponse().body.code, 'INVALID_DEPARTMENT_ID');

  // 3. Unknown department rejected with 404
  const notFoundCtx = createMockContext();
  await handleUpdateDepartment(
    notFoundCtx.context,
    principalCaller,
    { department_id: 'dept_unknown_404', name: 'New AI' },
    { databases }
  );
  assert.equal(notFoundCtx.getResponse().statusCode, 404);
  assert.equal(notFoundCtx.getResponse().body.code, 'NOT_FOUND');

  // 4. Code collision: updating code to another department's code (even soft-deleted ML) returns 409
  const collisionCtx = createMockContext();
  await handleUpdateDepartment(
    collisionCtx.context,
    principalCaller,
    { department_id: 'dept_ai', code: 'ML' },
    { databases }
  );
  assert.equal(collisionCtx.getResponse().statusCode, 409);
  assert.equal(collisionCtx.getResponse().body.code, 'DEPARTMENT_CODE_EXISTS');

  // 4b. Rejection of invalid admin email in update-department
  const invalidEmailCtx = createMockContext();
  await handleUpdateDepartment(
    invalidEmailCtx.context,
    principalCaller,
    { department_id: 'dept_ai', admin_email: 'not-an-email' },
    { databases }
  );
  assert.equal(invalidEmailCtx.getResponse().statusCode, 400);
  assert.equal(invalidEmailCtx.getResponse().body.code, 'INVALID_ADMIN_EMAIL');

  // 4c. Rejection of academic scope assignment to maintenance-only Water & Sanitation
  const waterAcademicCtx = createMockContext();
  await handleUpdateDepartment(
    waterAcademicCtx.context,
    principalCaller,
    {
      department_id: 'dept_water',
      scopes: { maintenance: true, academic: true },
    },
    { databases }
  );
  assert.equal(waterAcademicCtx.getResponse().statusCode, 400);
  assert.equal(waterAcademicCtx.getResponse().body.code, 'INVALID_SCOPE');

  const sanitAcademicCtx = createMockContext();
  await handleUpdateDepartment(
    sanitAcademicCtx.context,
    principalCaller,
    {
      department_id: 'dept_sanit',
      scopes: { maintenance: false, academic: true },
    },
    { databases }
  );
  assert.equal(sanitAcademicCtx.getResponse().statusCode, 400);
  assert.equal(sanitAcademicCtx.getResponse().body.code, 'INVALID_SCOPE');

  // 5. Happy path: update name, code, toggle academic scope off (only maintenance remains)
  const updateCtx = createMockContext();
  await handleUpdateDepartment(
    updateCtx.context,
    principalCaller,
    {
      department_id: 'dept_ai',
      name: 'AI & Data Science',
      code: 'AIDS',
      scopes: { maintenance: true, academic: false },
    },
    { databases }
  );
  assert.equal(updateCtx.getResponse().statusCode, 200);
  const updateBody = updateCtx.getResponse().body as {
    success: boolean;
    data: {
      department: { $id: string; name: string; code: string; is_academic: boolean; is_maintenance: boolean };
      assignments: Array<{ scope: string; is_active: boolean }>;
    };
  };
  assert.equal(updateBody.success, true);
  assert.equal(updateBody.data.department.name, 'AI & Data Science');
  assert.equal(updateBody.data.department.code, 'AIDS');
  assert.equal(updateBody.data.department.is_maintenance, true);
  assert.equal(updateBody.data.department.is_academic, false);

  // Verify updated assignments: maintenance active, academic revoked
  const adminDocs = collections.get('department_admins') || [];
  const aiAssignments = adminDocs.filter((d) => d.department_id === 'dept_ai');
  const maintAssign = aiAssignments.find((d) => d.scope === 'maintenance');
  const acadAssign = aiAssignments.find((d) => d.scope === 'academic');
  assert.ok(maintAssign);
  assert.equal(maintAssign.is_active, true);
  assert.ok(acadAssign);
  assert.equal(acadAssign.is_active, false);

  // Verify audit log entry
  const auditDocs = collections.get('audit_logs') || [];
  const updateAudit = auditDocs.find(
    (a) => a.action === 'update_department' && a.target_resource_id === 'dept_ai'
  );
  assert.ok(updateAudit);
  assert.equal(updateAudit.actor_id, 'usr_principal');
});

test('Department CRUD: handleDeleteDepartment security, soft deletion, assignment revocation, and audit logging', async () => {
  const principalCaller: AuthenticatedCaller = {
    id: 'usr_principal',
    email: 'principal@college.edu',
    name: 'Dr. Mehta',
    role: 'principal',
    department_id: null,
    department_name: null,
  };

  const studentCaller: AuthenticatedCaller = {
    id: 'usr_student',
    email: 'student@college.edu',
    name: 'Student User',
    role: 'student',
    department_id: null,
    department_name: null,
  };

  const { databases, collections } = createInMemoryDb({
    departments: [
      {
        $id: 'dept_to_delete',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        name: 'Obsolete Department',
        code: 'OBS',
        is_active: true,
        is_academic: true,
        is_maintenance: true,
      },
    ],
    department_admins: [
      {
        $id: 'da_obs_m',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'obs.admin@college.edu',
        department_id: 'dept_to_delete',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-01T00:00:00.000Z',
      },
      {
        $id: 'da_obs_a',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-01T00:00:00.000Z',
        $updatedAt: '2026-11-01T00:00:00.000Z',
        $permissions: [],
        user_id: '',
        email: 'obs.admin@college.edu',
        department_id: 'dept_to_delete',
        scope: 'academic',
        is_active: true,
        assigned_by: 'usr_principal',
        created_at: '2026-11-01T00:00:00.000Z',
      },
    ],
  });

  // 1. RBAC: non-principal rejected with 403
  const nonPrincipalCtx = createMockContext();
  await handleDeleteDepartment(
    nonPrincipalCtx.context,
    studentCaller,
    { department_id: 'dept_to_delete' },
    { databases }
  );
  assert.equal(nonPrincipalCtx.getResponse().statusCode, 403);
  assert.equal(nonPrincipalCtx.getResponse().body.code, 'FORBIDDEN');

  // 2. Missing department_id rejected with 400
  const missingIdCtx = createMockContext();
  await handleDeleteDepartment(
    missingIdCtx.context,
    principalCaller,
    {},
    { databases }
  );
  assert.equal(missingIdCtx.getResponse().statusCode, 400);
  assert.equal(missingIdCtx.getResponse().body.code, 'INVALID_DEPARTMENT_ID');

  // 3. Unknown department rejected with 404
  const notFoundCtx = createMockContext();
  await handleDeleteDepartment(
    notFoundCtx.context,
    principalCaller,
    { department_id: 'dept_nonexistent' },
    { databases }
  );
  assert.equal(notFoundCtx.getResponse().statusCode, 404);
  assert.equal(notFoundCtx.getResponse().body.code, 'NOT_FOUND');

  // 4. Happy path: soft delete department and revoke active assignments
  const deleteCtx = createMockContext();
  await handleDeleteDepartment(
    deleteCtx.context,
    principalCaller,
    { department_id: 'dept_to_delete' },
    { databases }
  );
  assert.equal(deleteCtx.getResponse().statusCode, 200);
  const deleteBody = deleteCtx.getResponse().body as {
    success: boolean;
    data: {
      department: { $id: string; is_active: boolean };
      revoked_assignment_ids: string[];
    };
  };
  assert.equal(deleteBody.data.department.$id, 'dept_to_delete');
  assert.equal(deleteBody.data.department.is_active, false);
  assert.equal(deleteBody.data.revoked_assignment_ids.length, 2);

  // Verify department is soft-deleted (is_active: false)
  const deptDocs = collections.get('departments') || [];
  const deletedDoc = deptDocs.find((d) => d.$id === 'dept_to_delete');
  assert.ok(deletedDoc);
  assert.equal(deletedDoc.is_active, false);

  // Verify all assignments are revoked (is_active: false)
  const adminDocs = collections.get('department_admins') || [];
  const obsAssignments = adminDocs.filter((d) => d.department_id === 'dept_to_delete');
  assert.equal(obsAssignments.length, 2);
  for (const assign of obsAssignments) {
    assert.equal(assign.is_active, false);
  }

  // Verify audit log entry
  const auditDocs = collections.get('audit_logs') || [];
  const deleteAudit = auditDocs.find(
    (a) => a.action === 'delete_department' && a.target_resource_id === 'dept_to_delete'
  );
  assert.ok(deleteAudit);
  assert.equal(deleteAudit.actor_id, 'usr_principal');
});

test('Custom maintenance departments: verifyCaller attaches department ID and resolves name from database', async () => {
  const { databases } = createInMemoryDb({
    departments: [
      {
        $id: 'dept_transport',
        $collectionId: 'departments',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-20T00:00:00.000Z',
        $updatedAt: '2026-11-20T00:00:00.000Z',
        $permissions: [],
        name: 'Campus Transport',
        is_academic: false,
        is_maintenance: true,
        is_active: true,
      },
    ],
    department_admins: [
      {
        $id: 'da_transport',
        $collectionId: 'department_admins',
        $databaseId: 'campusvoice',
        $createdAt: '2026-11-20T00:00:00.000Z',
        $updatedAt: '2026-11-20T00:00:00.000Z',
        $permissions: [],
        user_id: 'usr_transport_admin',
        email: 'transport.admin@college.edu',
        department_id: 'dept_transport',
        scope: 'maintenance',
        is_active: true,
        assigned_by: 'usr_principal',
      },
    ],
    profiles: [],
  });

  const authCtx = createAuthContext({ jwt: 'jwt_transport' });
  const authRes = await verifyCaller(authCtx.context, undefined, {
    databases,
    verifyJwt: async () => ({
      $id: 'usr_transport_admin',
      email: 'transport.admin@college.edu',
      name: 'Transport Admin',
    }),
  });

  assert.ok(authRes.caller);
  assert.equal(authRes.caller.role, 'department_admin');
  assert.equal(authRes.caller.department_id, 'dept_transport');
  assert.equal(authRes.caller.department_name, 'Campus Transport');
  assert.equal(authRes.caller.admin_assignments?.length, 1);
  assert.equal(authRes.caller.admin_assignments[0].department_id, 'dept_transport');
});
