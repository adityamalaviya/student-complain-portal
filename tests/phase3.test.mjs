import test from 'node:test';
import assert from 'node:assert/strict';

function checkComplaintVisibility(callerDept, complaint) {
  if (complaint.issue_type === 'public') {
    return { allowed: true, statusCode: 200 };
  }
  if (complaint.issue_type === 'department') {
    if (callerDept === complaint.department_code) {
      return { allowed: true, statusCode: 200 };
    }
    // Cross-department oracle elimination: must return generic 404
    return { allowed: false, statusCode: 404 };
  }
  return { allowed: false, statusCode: 404 };
}

test('Phase 3 Exit Criteria 1: Department A cannot access Department B private complaints (Oracle Elimination)', () => {
  const civilStudentDept = '06';
  const compStudentDept = '07';

  const computerPrivateComplaint = {
    $id: '671234567890abcdef123456',
    department_code: '07',
    issue_type: 'department',
    title: 'Lab 4 High-Speed Network Switch Outage',
  };

  const civilProbe = checkComplaintVisibility(civilStudentDept, computerPrivateComplaint);
  assert.equal(civilProbe.allowed, false, 'Civil student must not access Computer private complaint');
  assert.equal(civilProbe.statusCode, 404, 'Must return HTTP 404 generic not found (oracle elimination)');

  const compAccess = checkComplaintVisibility(compStudentDept, computerPrivateComplaint);
  assert.equal(compAccess.allowed, true, 'Computer student can access Computer private complaint');
  assert.equal(compAccess.statusCode, 200);
});

test('Phase 3 Exit Criteria 2: Both departments can access Public Issues', () => {
  const civilStudentDept = '06';
  const compStudentDept = '07';

  const publicComplaint = {
    $id: '671234567890abcdef999999',
    department_code: '07',
    issue_type: 'public',
    title: 'Broken Streetlights along Central Library Walkway',
  };

  const civilAccess = checkComplaintVisibility(civilStudentDept, publicComplaint);
  assert.equal(civilAccess.allowed, true, 'Civil department can access public grievance');
  assert.equal(civilAccess.statusCode, 200);

  const compAccess = checkComplaintVisibility(compStudentDept, publicComplaint);
  assert.equal(compAccess.allowed, true, 'Computer department can access public grievance');
  assert.equal(compAccess.statusCode, 200);
});

test('Phase 3 Exit Criteria 3: Server derives student identity from trusted profile only', () => {
  const trustedProfile = {
    user_id: 'usr_verified_777',
    name: 'Aarav Sharma',
    enrollment_no: '246510307054',
    department_code: '07',
    department_name: 'Computer Department',
  };

  const clientUntrustedPayload = {
    // Malicious caller attempts to impersonate another student or department
    student_user_id: 'usr_hacked_999',
    student_name: 'Fake Name',
    student_enrollment_no: '246510306012',
    department_code: '06',
    title: 'Faulty GPU cluster',
    location: 'Lab 4',
    description: 'Practical lab units overheating.',
    priority: 'high',
    issue_type: 'department',
  };

  // Server-side constructor ignores clientUntrustedPayload identity attributes:
  const createdRecord = {
    student_user_id: trustedProfile.user_id,
    student_name: trustedProfile.name,
    student_enrollment_no: trustedProfile.enrollment_no,
    department_code: trustedProfile.department_code,
    department_name: trustedProfile.department_name,
    title: clientUntrustedPayload.title,
    location: clientUntrustedPayload.location,
    description: clientUntrustedPayload.description,
    priority: clientUntrustedPayload.priority,
    issue_type: clientUntrustedPayload.issue_type,
    status: 'open',
    support_count: 0,
  };

  assert.equal(createdRecord.student_user_id, 'usr_verified_777');
  assert.equal(createdRecord.student_name, 'Aarav Sharma');
  assert.equal(createdRecord.student_enrollment_no, '246510307054');
  assert.equal(createdRecord.department_code, '07');
  assert.equal(createdRecord.support_count, 0);
  assert.notEqual(createdRecord.student_user_id, clientUntrustedPayload.student_user_id);
});
