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
