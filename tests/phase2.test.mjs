import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as frontendDept from '../src/lib/utils/department.ts';
import * as backendDept from '../functions/campusvoice-api/dist/departments.js';

const {
  INSTITUTIONAL_DEPARTMENTS,
  ENROLLMENT_CODE_MAPPINGS,
  PHONE_NUMBER_REGEX,
  canApprovePhoneChange,
  extractAndMapEnrollment,
  getAcademicDepartments,
  getMaintenanceDepartments,
  isAcademicDepartment,
  isMaintenanceDepartment,
  resolveDepartment,
} = backendDept;

test('Rule 1: Confirmed enrollment mappings (06, 07, 09, 19) and strict rejection of 03, 04, 05, 08, and unknown codes via production extractAndMapEnrollment', () => {
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

  // Disallowed and unknown codes must be rejected without guessing
  for (const rejectedCode of ['03', '04', '05', '08', '01', '02', '99']) {
    const res = extractAndMapEnrollment(`2465103${rejectedCode}054`);
    assert.equal(res.isValid, false, `Code ${rejectedCode} must be rejected`);
    assert.equal(res.departmentId, null);
    assert.equal(res.mapping, null);
  }

  // Malformed lengths rejected
  assert.equal(extractAndMapEnrollment('12345').isValid, false);
  assert.equal(extractAndMapEnrollment('24651030705499').isValid, false);
  assert.equal(extractAndMapEnrollment('24651030705A').isValid, false);
});

test('Rule 2: Verbatim profile lock warning is exactly preserved', () => {
  const VERBATIM_WARNING =
    'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.';
  assert.equal(
    VERBATIM_WARNING,
    'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.'
  );
});

test('Rule 3: Admin email normalization (.trim().toLowerCase())', () => {
  const allowlist07 = 'admin.computer@college.edu';
  const incomingEmail = '  ADMIN.COMPUTER@COLLEGE.EDU  ';
  assert.equal(incomingEmail.trim().toLowerCase(), allowlist07);
});

test('Step 5 Rule 4: Canonical 6 departments, academic vs maintenance separation, zero Water/Sanitation codes, and inactive guard', () => {
  assert.equal(INSTITUTIONAL_DEPARTMENTS.length, 6);
  assert.equal(getAcademicDepartments().length, 4);
  assert.equal(getMaintenanceDepartments().length, 6);

  // Academic departments
  assert.equal(isAcademicDepartment('dept_civil'), true);
  assert.equal(isAcademicDepartment('dept_comp'), true);
  assert.equal(isAcademicDepartment('dept_elec'), true);
  assert.equal(isAcademicDepartment('dept_mech'), true);

  // Water & Sanitation cannot be assigned as academic departments, only maintenance
  assert.equal(isAcademicDepartment('dept_water'), false);
  assert.equal(isAcademicDepartment('dept_sanit'), false);
  assert.equal(canApprovePhoneChange('dept_water', 'academic'), false);
  assert.equal(canApprovePhoneChange('dept_sanit', 'academic'), false);
  assert.equal(isMaintenanceDepartment('dept_water'), true);
  assert.equal(isMaintenanceDepartment('dept_sanit'), true);

  // Water & Sanitation never appear in ENROLLMENT_CODE_MAPPINGS
  const mappedTargets = Object.values(ENROLLMENT_CODE_MAPPINGS).map((m) => m.department_id);
  assert.equal(mappedTargets.includes('dept_water'), false);
  assert.equal(mappedTargets.includes('dept_sanit'), false);

  // Enrollment codes and water/sanitation aliases must never resolve as department IDs
  for (const invalidId of ['03', '04', '05', '08', '06', '07', '09', '19', 'water', 'sanitation']) {
    assert.equal(resolveDepartment(invalidId), null);
    assert.equal(isAcademicDepartment(invalidId), false);
    assert.equal(isMaintenanceDepartment(invalidId), false);
  }

  // Inactive departments cannot be selected
  const withInactive = INSTITUTIONAL_DEPARTMENTS.map((d) =>
    d.id === 'dept_mech' || d.id === 'dept_sanit' ? { ...d, is_active: false } : d
  );
  assert.equal(isAcademicDepartment('dept_mech', withInactive), false);
  assert.equal(isMaintenanceDepartment('dept_sanit', withInactive), false);
  assert.equal(
    extractAndMapEnrollment('246510319042', ENROLLMENT_CODE_MAPPINGS, withInactive).isValid,
    false
  );
  assert.equal(
    getAcademicDepartments(withInactive).some((d) => d.id === 'dept_mech'),
    false
  );
  assert.equal(
    getMaintenanceDepartments(withInactive).some((d) => d.id === 'dept_sanit'),
    false
  );

  // Unconfirmed mapping must be rejected
  const unconfirmedMappings = {
    ...ENROLLMENT_CODE_MAPPINGS,
    '09': { enrollment_code: '09', department_id: 'dept_elec', confirmed: false },
  };
  assert.equal(extractAndMapEnrollment('246510309015', unconfirmedMappings).isValid, false);
});

test('Step 5 Rule 5: Frontend and backend canonical department registries remain in exact parity', () => {
  assert.deepEqual(frontendDept.INSTITUTIONAL_DEPARTMENTS, backendDept.INSTITUTIONAL_DEPARTMENTS);
  assert.deepEqual(frontendDept.ENROLLMENT_CODE_MAPPINGS, backendDept.ENROLLMENT_CODE_MAPPINGS);
  assert.deepEqual(frontendDept.getAcademicDepartments(), backendDept.getAcademicDepartments());
  assert.deepEqual(frontendDept.getMaintenanceDepartments(), backendDept.getMaintenanceDepartments());

  for (const code of ['06', '07', '09', '19', '03', '04', '05', '08', '99']) {
    const sample = `2465103${code}012`;
    assert.deepEqual(
      frontendDept.extractAndMapEnrollment(sample),
      backendDept.extractAndMapEnrollment(sample)
    );
  }

  for (const id of [
    'dept_civil',
    'dept_comp',
    'dept_elec',
    'dept_mech',
    'dept_water',
    'dept_sanit',
    '06',
    '03',
    'water',
    'sanitation',
  ]) {
    assert.deepEqual(frontendDept.resolveDepartment(id), backendDept.resolveDepartment(id));
    assert.equal(frontendDept.isAcademicDepartment(id), backendDept.isAcademicDepartment(id));
    assert.equal(frontendDept.isMaintenanceDepartment(id), backendDept.isMaintenanceDepartment(id));
  }
});

test('Day 2 Rule 5: Phone validation regex and onboarding UI integration check', () => {
  assert.equal(PHONE_NUMBER_REGEX.test('9876543210'), true);
  assert.equal(PHONE_NUMBER_REGEX.test('6000000000'), true);
  assert.equal(PHONE_NUMBER_REGEX.test('5999999999'), false);
  assert.equal(PHONE_NUMBER_REGEX.test('987654321'), false);

  const onboardingSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/app/onboarding/page.tsx'),
    'utf8'
  );
  assert.ok(onboardingSrc.includes('phoneNumber'), 'Onboarding page must collect phoneNumber');
  assert.ok(onboardingSrc.includes('PhoneNumberSchema'), 'Onboarding page must validate phone number');
  assert.ok(
    !onboardingSrc.includes("deptCode === '06'"),
    'Onboarding page must not hardcode 06/07 preview mappings'
  );
  assert.ok(
    !onboardingSrc.includes('Phase 2 release'),
    'Onboarding page must not contain outdated two-department Phase 2 copy'
  );
});

test('OAuth callback does not treat profile lookup failures as first-time onboarding', async () => {
  const source = await import('node:fs/promises');
  const callback = await source.readFile(new URL('../src/app/auth/callback/page.tsx', import.meta.url), 'utf8');
  assert.match(callback, /profileCheckError/);
  assert.doesNotMatch(callback, /catch \(profileErr\) \{[^}]*router\.replace\('\/onboarding'\)/);
});

test('Step 5 Rule 6: Provisioning script, schemas, and UI components separate canonical IDs from enrollment codes', () => {
  const setupSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/setup-appwrite.mjs'),
    'utf8'
  );
  for (const id of ['dept_civil', 'dept_comp', 'dept_elec', 'dept_mech', 'dept_water', 'dept_sanit']) {
    assert.ok(setupSrc.includes(id), `setup-appwrite.mjs must seed canonical ID ${id}`);
  }
  assert.ok(
    !setupSrc.includes("safeCreateStringAttribute('departments', 'code'"),
    'setup-appwrite.mjs must not create departments.code attribute'
  );
  assert.ok(
    !setupSrc.includes("safeCreateIndex('departments', 'idx_dept_code'") &&
      !setupSrc.includes("safeCreateIndex('departments', 'idx_code'") &&
      !setupSrc.includes("['code']"),
    'setup-appwrite.mjs must not create idx_dept_code / idx_code unique index on departments.code'
  );

  const schemasSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/lib/schemas/index.ts'),
    'utf8'
  );
  assert.ok(schemasSrc.includes('DepartmentIdSchema'));
  assert.ok(schemasSrc.includes('AcademicDepartmentIdSchema'));
  assert.ok(schemasSrc.includes('MaintenanceDepartmentIdSchema'));
  assert.ok(schemasSrc.includes('EnrollmentMappingSchema'));
  const deptSchemaMatch = /export const DepartmentSchema = z\.object\(\{[\s\S]*?\}\);/.exec(schemasSrc);
  assert.ok(deptSchemaMatch, 'DepartmentSchema must exist in src/lib/schemas/index.ts');
  assert.ok(!/\bcode\s*:/.test(deptSchemaMatch[0]), 'DepartmentSchema must not require code field');

  for (const uiPath of [
    'src/components/DepartmentBadge.tsx',
    'src/components/ComplaintCard.tsx',
    'src/app/dashboard/page.tsx',
    'src/app/complaints/new/page.tsx',
    'src/app/complaints/[id]/page.tsx',
    'src/app/admin/page.tsx',
  ]) {
    const uiSrc = fs.readFileSync(path.resolve(process.cwd(), uiPath), 'utf8');
    assert.ok(!uiSrc.includes("|| 'dept_comp'"), `${uiPath} must not contain unsafe dept_comp fallback`);
  }
});
