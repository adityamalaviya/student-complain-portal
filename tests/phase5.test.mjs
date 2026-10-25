import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------
// Phase 5 Domain Logic Simulation for Pure Unit Testing
// ---------------------------------------------------------------------

function evaluateAdminAccess(adminCaller, complaint) {
  // Non-admin check
  if (adminCaller.role !== 'department_admin' || !adminCaller.department_code) {
    return { allowed: false, status: 403, error: 'Forbidden' };
  }

  // Admin jurisdiction: Own department OR Public Issue
  const isOwnDepartment = complaint.department_code === adminCaller.department_code;
  const isPublicIssue = complaint.issue_type === 'public';

  if (isOwnDepartment || isPublicIssue) {
    return { allowed: true, status: 200 };
  }

  // Department B private complaint: Generic 404 Oracle Elimination
  return { allowed: false, status: 404, error: 'Complaint not found.' };
}

function processAdminUpdateComplaint({ adminCaller, complaint, newStatus, officialResponse }) {
  // 1. Role verification
  if (adminCaller.role !== 'department_admin' || !adminCaller.department_code) {
    return {
      status: 403,
      body: { success: false, error: 'Forbidden: Department administrator privileges required.', code: 'FORBIDDEN' },
    };
  }

  // 2. Complaint existence
  if (!complaint) {
    return {
      status: 404,
      body: { success: false, error: 'Complaint not found.', code: 'NOT_FOUND' },
    };
  }

  // 3. Oracle Elimination & Scoped Jurisdiction
  const access = evaluateAdminAccess(adminCaller, complaint);
  if (!access.allowed) {
    return {
      status: access.status,
      body: { success: false, error: access.error, code: access.status === 404 ? 'NOT_FOUND' : 'FORBIDDEN' },
    };
  }

  // 4. Status validation
  if (!['in_progress', 'resolved'].includes(newStatus)) {
    return {
      status: 400,
      body: { success: false, error: "Status must be updated to 'in_progress' or 'resolved'.", code: 'INVALID_STATUS' },
    };
  }

  // 5. Official response length validation (5 to 1000 characters)
  const trimmed = typeof officialResponse === 'string' ? officialResponse.trim() : '';
  if (trimmed.length < 5 || trimmed.length > 1000) {
    return {
      status: 400,
      body: { success: false, error: 'Official response must be between 5 and 1000 characters.', code: 'INVALID_RESPONSE' },
    };
  }

  // 6. Apply updates
  const now = new Date().toISOString();
  complaint.status = newStatus;
  complaint.official_response = trimmed;
  complaint.updated_at = now;
  if (newStatus === 'resolved') {
    complaint.resolved_at = now;
  }

  return {
    status: 200,
    body: {
      success: true,
      data: { complaint },
    },
  };
}

function computeAdminMetrics(adminDeptCode, complaintsDatabase) {
  // Counts open, in_progress, and resolved within admin's jurisdiction
  let totalOpen = 0;
  let totalInProgress = 0;
  let totalResolved = 0;

  for (const c of complaintsDatabase) {
    const isOwnDept = c.department_code === adminDeptCode && c.issue_type === 'department';
    const isPublic = c.issue_type === 'public';

    if (isOwnDept || isPublic) {
      if (c.status === 'open') totalOpen++;
      else if (c.status === 'in_progress') totalInProgress++;
      else if (c.status === 'resolved') totalResolved++;
    }
  }

  return {
    total_open: totalOpen,
    total_in_progress: totalInProgress,
    total_resolved: totalResolved,
    department_code: adminDeptCode,
  };
}

function listAdminComplaints(adminDeptCode, complaintsDatabase, filterStatus) {
  return complaintsDatabase.filter((c) => {
    const isOwnDept = c.department_code === adminDeptCode && c.issue_type === 'department';
    const isPublic = c.issue_type === 'public';
    if (!isOwnDept && !isPublic) return false;

    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Phase 5 Test Suite
// ---------------------------------------------------------------------

test('Phase 5 Exit Criteria: Admin A can manage own department complaints and Public Issues', () => {
  const adminCivil = { id: 'admin_civil_01', role: 'department_admin', department_code: '06' };

  // 1. Own department private complaint (Civil 06)
  const civilComplaint = {
    $id: 'complaint_civil_01',
    department_code: '06',
    issue_type: 'department',
    status: 'open',
    title: 'Survey Lab Theodolite Calibration Defect',
  };

  const updateOwnRes = processAdminUpdateComplaint({
    adminCaller: adminCivil,
    complaint: civilComplaint,
    newStatus: 'in_progress',
    officialResponse: 'Surveying technicians dispatched for recalibration.',
  });

  assert.equal(updateOwnRes.status, 200);
  assert.equal(civilComplaint.status, 'in_progress');
  assert.equal(civilComplaint.official_response, 'Surveying technicians dispatched for recalibration.');

  // 2. Public Issue (even if filed by student in Computer department 07)
  const publicComplaint = {
    $id: 'complaint_pub_library',
    department_code: '07', // Created by computer student
    issue_type: 'public',  // Public issue
    status: 'open',
    title: 'Central Library Air Conditioning Down',
  };

  const updatePubRes = processAdminUpdateComplaint({
    adminCaller: adminCivil,
    complaint: publicComplaint,
    newStatus: 'resolved',
    officialResponse: 'Central Facilities replaced the main chiller pump.',
  });

  assert.equal(updatePubRes.status, 200);
  assert.equal(publicComplaint.status, 'resolved');
  assert.ok(publicComplaint.resolved_at, 'resolved_at timestamp must be set');
});

test('Phase 5 Exit Criteria: Admin A CANNOT read or mutate Department B private complaints (Oracle Elimination: 404)', () => {
  const adminCivil = { id: 'admin_civil_01', role: 'department_admin', department_code: '06' };

  // Computer Department (07) Private Grievance
  const computerPrivateComplaint = {
    $id: 'complaint_comp_secret',
    department_code: '07', // Computer
    issue_type: 'department', // Private to Computer
    status: 'open',
    title: 'High-Performance Computing Cluster Lab 4 Security Keycard Lock Failure',
  };

  // Attempt read check
  const readAccess = evaluateAdminAccess(adminCivil, computerPrivateComplaint);
  assert.equal(readAccess.allowed, false, 'Civil admin must not access Computer private complaint');
  assert.equal(readAccess.status, 404, 'Must return HTTP 404 generic not found (oracle elimination)');

  // Attempt mutation / status update
  const mutateRes = processAdminUpdateComplaint({
    adminCaller: adminCivil,
    complaint: computerPrivateComplaint,
    newStatus: 'resolved',
    officialResponse: 'Unauthorized attempt to resolve cross-department issue.',
  });

  assert.equal(mutateRes.status, 404, 'Mutation attempt must return HTTP 404 generic not found');
  assert.equal(mutateRes.body.code, 'NOT_FOUND');
  assert.equal(computerPrivateComplaint.status, 'open', 'Complaint status must remain unchanged');
  assert.equal(computerPrivateComplaint.official_response, undefined);
});

test('Phase 5 Metrics: Admin dashboard counts department private issues and public issues without cross-department leakage', () => {
  const complaintsDB = [
    // Civil private (06)
    { $id: 'c1', department_code: '06', issue_type: 'department', status: 'open' },
    { $id: 'c2', department_code: '06', issue_type: 'department', status: 'in_progress' },
    { $id: 'c3', department_code: '06', issue_type: 'department', status: 'resolved' },

    // Public issues
    { $id: 'p1', department_code: '06', issue_type: 'public', status: 'open' },
    { $id: 'p2', department_code: '07', issue_type: 'public', status: 'resolved' },

    // Computer private (07) - Must NOT leak into Civil admin metrics
    { $id: 'x1', department_code: '07', issue_type: 'department', status: 'open' },
    { $id: 'x2', department_code: '07', issue_type: 'department', status: 'open' },
    { $id: 'x3', department_code: '07', issue_type: 'department', status: 'in_progress' },
  ];

  // Civil Admin (06)
  const civilMetrics = computeAdminMetrics('06', complaintsDB);
  // Open: c1 (dept 06) + p1 (public) = 2
  assert.equal(civilMetrics.total_open, 2, 'Civil open = c1 (civil) + p1 (public)');
  // In Progress: c2 (dept 06) = 1
  assert.equal(civilMetrics.total_in_progress, 1);
  // Resolved: c3 (dept 06) + p2 (public) = 2
  assert.equal(civilMetrics.total_resolved, 2);

  // Computer Admin (07)
  const compMetrics = computeAdminMetrics('07', complaintsDB);
  // Open: x1 + x2 (dept 07) + p1 (public) = 3
  assert.equal(compMetrics.total_open, 3);
  // In Progress: x3 (dept 07) = 1
  assert.equal(compMetrics.total_in_progress, 1);
  // Resolved: p2 (public) = 1
  assert.equal(compMetrics.total_resolved, 1);
});

test('Phase 5 Scoped Queue: Admin complaints list strictly excludes Department B private issues', () => {
  const complaintsDB = [
    { $id: 'c1', department_code: '06', issue_type: 'department', status: 'open', title: 'Civil private' },
    { $id: 'p1', department_code: '06', issue_type: 'public', status: 'open', title: 'Public issue 1' },
    { $id: 'p2', department_code: '07', issue_type: 'public', status: 'open', title: 'Public issue 2' },
    { $id: 'x1', department_code: '07', issue_type: 'department', status: 'open', title: 'Computer private 1' },
    { $id: 'x2', department_code: '07', issue_type: 'department', status: 'open', title: 'Computer private 2' },
  ];

  const civilList = listAdminComplaints('06', complaintsDB);
  const civilIds = civilList.map((c) => c.$id);

  // Civil list must contain c1, p1, p2
  assert.ok(civilIds.includes('c1'));
  assert.ok(civilIds.includes('p1'));
  assert.ok(civilIds.includes('p2'));

  // Civil list MUST NOT contain Computer private complaints
  assert.ok(!civilIds.includes('x1'), 'Computer private issue x1 must NOT appear in Civil admin queue');
  assert.ok(!civilIds.includes('x2'), 'Computer private issue x2 must NOT appear in Civil admin queue');
});

test('Phase 5 Validation: Status and official response input validation bounds', () => {
  const admin = { id: 'admin_comp_01', role: 'department_admin', department_code: '07' };
  const complaint = {
    $id: 'comp_001',
    department_code: '07',
    issue_type: 'department',
    status: 'open',
  };

  // Reject invalid status
  const resBadStatus = processAdminUpdateComplaint({
    adminCaller: admin,
    complaint,
    newStatus: 'archived', // not allowed
    officialResponse: 'Valid note here.',
  });
  assert.equal(resBadStatus.status, 400);
  assert.equal(resBadStatus.body.code, 'INVALID_STATUS');

  // Reject too short official response (< 5 chars)
  const resShortNote = processAdminUpdateComplaint({
    adminCaller: admin,
    complaint,
    newStatus: 'in_progress',
    officialResponse: 'Ok',
  });
  assert.equal(resShortNote.status, 400);
  assert.equal(resShortNote.body.code, 'INVALID_RESPONSE');

  // Reject non-admin caller
  const studentCaller = { id: 'usr_student_fake', role: 'student', department_code: '07' };
  const resStudent = processAdminUpdateComplaint({
    adminCaller: studentCaller,
    complaint,
    newStatus: 'resolved',
    officialResponse: 'Student attempting admin resolution.',
  });
  assert.equal(resStudent.status, 403);
  assert.equal(resStudent.body.code, 'FORBIDDEN');
});
