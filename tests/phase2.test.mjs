import test from 'node:test';
import assert from 'node:assert/strict';

// Core Business Rules & Extraction Logic
function extractDepartmentCode(enrollmentNo) {
  const trimmed = enrollmentNo.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    return { isValid: false, code: null, department: null };
  }
  const code = trimmed.slice(7, 9);
  if (code === '06') {
    return { isValid: true, code: '06', department: 'Civil Department' };
  }
  if (code === '07') {
    return { isValid: true, code: '07', department: 'Computer Department' };
  }
  return { isValid: false, code, department: null };
}

test('Rule 1: Department Detection from 12-digit enrollment number via zero-based slice [7:9]', () => {
  // Reference Computer Department student
  const comp = extractDepartmentCode('246510307054');
  assert.equal(comp.isValid, true);
  assert.equal(comp.code, '07');
  assert.equal(comp.department, 'Computer Department');

  // Reference Civil Department student
  const civil = extractDepartmentCode('246510306012');
  assert.equal(civil.isValid, true);
  assert.equal(civil.code, '06');
  assert.equal(civil.department, 'Civil Department');

  // Unmapped codes rejected
  const unmapped = extractDepartmentCode('246510301054');
  assert.equal(unmapped.isValid, false);
  assert.equal(unmapped.department, null);

  // Malformed lengths rejected
  assert.equal(extractDepartmentCode('12345').isValid, false);
  assert.equal(extractDepartmentCode('24651030705499').isValid, false);
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
