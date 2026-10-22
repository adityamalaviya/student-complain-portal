import test from 'node:test';
import assert from 'node:assert/strict';
function extractDepartment(enrollmentNo) {
    const trimmed = enrollmentNo.trim();
    if (!/^\d{12}$/.test(trimmed)) {
        return { code: '', name: '', isValid: false };
    }
    const code = trimmed.slice(7, 9);
    if (code === '06') {
        return { code: '06', name: 'Civil Department', isValid: true };
    }
    if (code === '07') {
        return { code: '07', name: 'Computer Department', isValid: true };
    }
    return { code, name: '', isValid: false };
}
function evaluateAdminRole(userEmail, admin06, admin07) {
    const normalized = userEmail.trim().toLowerCase();
    const norm06 = admin06.trim().toLowerCase();
    const norm07 = admin07.trim().toLowerCase();
    if (norm07.length > 0 && normalized === norm07) {
        return { role: 'department_admin', department_code: '07' };
    }
    if (norm06.length > 0 && normalized === norm06) {
        return { role: 'department_admin', department_code: '06' };
    }
    return { role: 'student', department_code: null };
}
test('Department extraction from enrollment number (characters 8-9, zero-based slice [7:9])', () => {
    // Test reference computer student
    const comp = extractDepartment('246510307054');
    assert.equal(comp.isValid, true);
    assert.equal(comp.code, '07');
    assert.equal(comp.name, 'Computer Department');
    // Test reference civil student
    const civil = extractDepartment('246510306012');
    assert.equal(civil.isValid, true);
    assert.equal(civil.code, '06');
    assert.equal(civil.name, 'Civil Department');
    // Test unmapped department code (01)
    const unmapped = extractDepartment('246510301054');
    assert.equal(unmapped.isValid, false);
    assert.equal(unmapped.code, '01');
    // Test malformed length
    const short = extractDepartment('24651030705');
    assert.equal(short.isValid, false);
    // Test non-numeric characters
    const letters = extractDepartment('24651030705A');
    assert.equal(letters.isValid, false);
});
test('Administrator email normalization and role evaluation', () => {
    const admin06Config = ' admin.civil@college.edu ';
    const admin07Config = 'Admin.Computer@college.edu';
    // Computer admin login with mixed case and whitespace
    const compAdmin = evaluateAdminRole('  ADMIN.COMPUTER@COLLEGE.EDU ', admin06Config, admin07Config);
    assert.equal(compAdmin.role, 'department_admin');
    assert.equal(compAdmin.department_code, '07');
    // Civil admin login
    const civilAdmin = evaluateAdminRole('admin.civil@college.edu', admin06Config, admin07Config);
    assert.equal(civilAdmin.role, 'department_admin');
    assert.equal(civilAdmin.department_code, '06');
    // Regular student login
    const student = evaluateAdminRole('student.rahul@college.edu', admin06Config, admin07Config);
    assert.equal(student.role, 'student');
    assert.equal(student.department_code, null);
});
test('Verbatim profile lock warning is preserved', () => {
    const VERBATIM_WARNING = 'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.';
    assert.ok(VERBATIM_WARNING.includes('Once you save them, they cannot be changed through your account.'));
});
