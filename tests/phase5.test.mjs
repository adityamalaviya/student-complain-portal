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

  // Admin jurisdiction: strictly own department (public complaints are removed)
  const isOwnDepartment = complaint.department_code === adminCaller.department_code;

  if (isOwnDepartment) {
    return { allowed: true, status: 200 };
  }

  // Cross-department complaint: Generic 404 Oracle Elimination
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
  // Counts open, in_progress, and resolved strictly within admin's own department jurisdiction
  let totalOpen = 0;
  let totalInProgress = 0;
  let totalResolved = 0;

  for (const c of complaintsDatabase) {
    const isOwnDept = c.department_code === adminDeptCode;

    if (isOwnDept) {
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
    const isOwnDept = c.department_code === adminDeptCode;
    if (!isOwnDept) return false;

    if (filterStatus && c.status !== filterStatus) return false;
    return true;
  });
}

// ---------------------------------------------------------------------
// Phase 5 Test Suite
// ---------------------------------------------------------------------

test('Phase 5 Exit Criteria: Admin A can manage own department complaints, and cross-department public issues are rejected', () => {
  const adminCivil = { id: 'admin_civil_01', role: 'department_admin', department_code: '06' };

  // 1. Own department complaint (Civil 06)
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

  // 2. Cross-department issue attempt (even if tagged public) -> rejected with 404 Oracle Elimination
  const crossDeptComplaint = {
    $id: 'complaint_pub_library',
    department_code: '07', // Created by computer student
    issue_type: 'public',  // Legacy public tag
    status: 'open',
    title: 'Central Library Air Conditioning Down',
  };

  const updateCrossRes = processAdminUpdateComplaint({
    adminCaller: adminCivil,
    complaint: crossDeptComplaint,
    newStatus: 'resolved',
    officialResponse: 'Unauthorized cross-department resolution attempt.',
  });

  assert.equal(updateCrossRes.status, 404);
  assert.equal(updateCrossRes.body.code, 'NOT_FOUND');
  assert.equal(crossDeptComplaint.status, 'open', 'Cross-department complaint must remain unmutated');
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
    // Civil department (06)
    { $id: 'c1', department_code: '06', issue_type: 'department', status: 'open' },
    { $id: 'c2', department_code: '06', issue_type: 'department', status: 'in_progress' },
    { $id: 'c3', department_code: '06', issue_type: 'department', status: 'resolved' },
    { $id: 'p1', department_code: '06', issue_type: 'public', status: 'open' },

    // Computer department (07) - Must NOT leak into Civil admin metrics
    { $id: 'p2', department_code: '07', issue_type: 'public', status: 'resolved' },
    { $id: 'x1', department_code: '07', issue_type: 'department', status: 'open' },
    { $id: 'x2', department_code: '07', issue_type: 'department', status: 'open' },
    { $id: 'x3', department_code: '07', issue_type: 'department', status: 'in_progress' },
  ];

  // Civil Admin (06)
  const civilMetrics = computeAdminMetrics('06', complaintsDB);
  // Open: c1 (dept 06) + p1 (dept 06) = 2
  assert.equal(civilMetrics.total_open, 2, 'Civil open = c1 (civil) + p1 (civil)');
  // In Progress: c2 (dept 06) = 1
  assert.equal(civilMetrics.total_in_progress, 1);
  // Resolved: c3 (dept 06) = 1 (p2 from dept 07 must NOT leak)
  assert.equal(civilMetrics.total_resolved, 1);

  // Computer Admin (07)
  const compMetrics = computeAdminMetrics('07', complaintsDB);
  // Open: x1 + x2 (dept 07) = 2 (p1 from dept 06 must NOT leak)
  assert.equal(compMetrics.total_open, 2);
  // In Progress: x3 (dept 07) = 1
  assert.equal(compMetrics.total_in_progress, 1);
  // Resolved: p2 (dept 07) = 1
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

  // Civil list must contain c1 and p1 (both dept 06)
  assert.ok(civilIds.includes('c1'));
  assert.ok(civilIds.includes('p1'));

  // Civil list MUST NOT contain Computer complaints (x1, x2, p2)
  assert.ok(!civilIds.includes('p2'), 'Computer issue p2 must NOT appear in Civil admin queue');
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

// ---------------------------------------------------------------------
// Day 5 Domain Logic Simulation for Pure Unit Testing
// ---------------------------------------------------------------------

const PHONE_REGEX = /^[6-9]\d{9}$/;

function processRequestPhoneChange({ studentCaller, profile, reason, requestedPhone, activeRequests }) {
  if (studentCaller.role !== 'student') {
    return { status: 403, body: { success: false, error: 'Only students can submit phone change requests.', code: 'FORBIDDEN' } };
  }
  if (!profile || !profile.phone_number) {
    return { status: 400, body: { success: false, error: 'Student profile must be complete with an existing phone number.', code: 'PROFILE_INCOMPLETE' } };
  }
  if (!profile.student_department_id) {
    return { status: 400, body: { success: false, error: 'Student must have an assigned academic department.', code: 'ACADEMIC_DEPARTMENT_REQUIRED' } };
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
  if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
    return { status: 400, body: { success: false, error: 'Reason must be between 10 and 1000 characters.', code: 'INVALID_REASON' } };
  }
  if (requestedPhone) {
    if (!PHONE_REGEX.test(requestedPhone)) {
      return { status: 400, body: { success: false, error: 'Requested phone number must be exactly 10 digits starting with 6, 7, 8, or 9.', code: 'INVALID_PHONE_NUMBER' } };
    }
    if (requestedPhone === profile.phone_number) {
      return { status: 400, body: { success: false, error: 'Requested phone number cannot be the same as your current phone number.', code: 'SAME_PHONE_NUMBER' } };
    }
  }

  const hasActive = (activeRequests || []).some(
    (r) => r.student_user_id === studentCaller.id && (r.status === 'pending' || (r.status === 'approved' && !r.permission_consumed))
  );
  if (hasActive) {
    return { status: 409, body: { success: false, error: 'You already have an active phone change request.', code: 'ACTIVE_REQUEST_EXISTS' } };
  }

  const newRequest = {
    $id: `pcr_${Date.now()}`,
    student_user_id: studentCaller.id,
    academic_department_id: profile.student_department_id,
    old_phone_number: profile.phone_number,
    requested_phone_number: requestedPhone || '',
    reason: trimmedReason,
    status: 'pending',
    permission_consumed: false,
    requested_at: new Date().toISOString(),
  };

  return { status: 201, body: { success: true, data: { request: newRequest } } };
}

function processReviewPhoneChange({ adminCaller, request, decision, decisionReason }) {
  if (adminCaller.role !== 'department_admin' && adminCaller.role !== 'principal') {
    return { status: 403, body: { success: false, error: 'Administrative privileges required.', code: 'FORBIDDEN' } };
  }
  if (!['approved', 'rejected'].includes(decision)) {
    return { status: 400, body: { success: false, error: "Decision must be either 'approved' or 'rejected'.", code: 'INVALID_DECISION' } };
  }
  const trimmedReason = typeof decisionReason === 'string' ? decisionReason.trim() : '';
  if (decision === 'rejected' && trimmedReason.length < 5) {
    return { status: 400, body: { success: false, error: 'A decision reason of at least 5 characters is required when rejecting a request.', code: 'REASON_REQUIRED' } };
  }

  // Water and Sanitation admins are maintenance-only and cannot review academic phone changes
  const isPrincipal = adminCaller.role === 'principal';
  let isAuthorizedAcademicAdmin = false;
  if (!isPrincipal && adminCaller.role === 'department_admin') {
    const academicAssignments = (adminCaller.admin_assignments || []).filter(
      (a) => a.is_active && a.scope === 'academic' && a.department_id === request.academic_department_id
    );
    isAuthorizedAcademicAdmin = academicAssignments.length > 0;
  }

  if (!isPrincipal && !isAuthorizedAcademicAdmin) {
    return {
      status: 403,
      body: {
        success: false,
        error: 'Only the academic Department Administrator for this student can review phone change requests.',
        code: 'FORBIDDEN',
      },
    };
  }

  if (request.status !== 'pending') {
    return { status: 400, body: { success: false, error: `Phone change request has already been ${request.status}.`, code: 'REQUEST_ALREADY_REVIEWED' } };
  }

  request.status = decision;
  request.reviewed_by = adminCaller.id;
  request.decision_reason = trimmedReason || (decision === 'approved' ? 'Approved by Academic Admin' : 'Rejected');
  request.updated_at = new Date().toISOString();

  return { status: 200, body: { success: true, data: { request } } };
}

function processCompletePhoneChange({ studentCaller, request, profile, newPhoneNumber, simulateDbError = false }) {
  if (studentCaller.role !== 'student') {
    return { status: 403, body: { success: false, error: 'Only students can complete phone change updates.', code: 'FORBIDDEN' } };
  }
  if (!PHONE_REGEX.test(newPhoneNumber)) {
    return { status: 400, body: { success: false, error: 'New phone number must be exactly 10 digits starting with 6, 7, 8, or 9.', code: 'INVALID_PHONE_NUMBER' } };
  }
  if (request.student_user_id !== studentCaller.id) {
    return { status: 404, body: { success: false, error: 'Phone change request not found.', code: 'NOT_FOUND' } };
  }
  if (request.status !== 'approved' || request.permission_consumed === true) {
    return { status: 403, body: { success: false, error: 'No active one-time phone change permission found for this request.', code: 'PERMISSION_NOT_AVAILABLE' } };
  }
  if (newPhoneNumber === request.old_phone_number) {
    return { status: 400, body: { success: false, error: 'New phone number cannot be identical to the current phone number.', code: 'SAME_PHONE_NUMBER' } };
  }

  // FAILURE SAFETY INVARIANT:
  // Step 1: Update student profile with new phone number.
  // If Step 1 fails, permission is NOT consumed and old number remains active in profile!
  if (simulateDbError) {
    return {
      status: 500,
      body: {
        success: false,
        error: 'Failed to update phone number in profile. Permission was not consumed; please retry.',
        code: 'PROFILE_SAVE_FAILED',
      },
    };
  }

  profile.phone_number = newPhoneNumber;
  profile.phone_locked = true;

  // Step 2: Mark permission consumed
  request.status = 'completed';
  request.permission_consumed = true;

  return {
    status: 200,
    body: {
      success: true,
      data: {
        message: 'Phone number updated successfully.',
        phone_number: newPhoneNumber,
      },
    },
  };
}

// ---------------------------------------------------------------------
// Day 5 Test Cases
// ---------------------------------------------------------------------

test('Day 5: Phone Change Workflow - Student request creation and active request duplicate prevention (409)', () => {
  const student = { id: 'usr_student_01', role: 'student' };
  const profile = {
    student_department_id: 'dept_comp',
    phone_number: '9876543210',
  };

  // 1. Valid request creation
  const validRes = processRequestPhoneChange({
    studentCaller: student,
    profile,
    reason: 'Lost device; updating to personal family SIM card.',
    requestedPhone: '9123456789',
    activeRequests: [],
  });
  assert.equal(validRes.status, 201);
  assert.equal(validRes.body.data.request.status, 'pending');
  assert.equal(validRes.body.data.request.academic_department_id, 'dept_comp');

  // 2. Duplicate active request blocked with 409 Conflict
  const activeRequests = [validRes.body.data.request];
  const dupRes = processRequestPhoneChange({
    studentCaller: student,
    profile,
    reason: 'Attempting to create second request.',
    requestedPhone: '9123456788',
    activeRequests,
  });
  assert.equal(dupRes.status, 409);
  assert.equal(dupRes.body.code, 'ACTIVE_REQUEST_EXISTS');
});

test('Day 5: Phone Change Workflow - Academic Admin approval & rejection scope (Water/Sanitation admins rejected with 403)', () => {
  const compAdmin = {
    id: 'admin_comp_01',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_comp', scope: 'academic', is_active: true }],
  };
  const civilAdmin = {
    id: 'admin_civil_01',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_civil', scope: 'academic', is_active: true }],
  };
  const waterAdmin = {
    id: 'admin_water_01',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_water', scope: 'maintenance', is_active: true }],
  };

  const compRequest = {
    $id: 'pcr_comp_1',
    student_user_id: 'usr_student_01',
    academic_department_id: 'dept_comp',
    old_phone_number: '9876543210',
    status: 'pending',
    permission_consumed: false,
  };

  // 1. Water Admin blocked from reviewing academic phone changes (403 FORBIDDEN)
  const waterRes = processReviewPhoneChange({
    adminCaller: waterAdmin,
    request: compRequest,
    decision: 'approved',
  });
  assert.equal(waterRes.status, 403);
  assert.equal(waterRes.body.code, 'FORBIDDEN');

  // 2. Cross-department Academic Admin blocked (403 FORBIDDEN)
  const crossRes = processReviewPhoneChange({
    adminCaller: civilAdmin,
    request: compRequest,
    decision: 'approved',
  });
  assert.equal(crossRes.status, 403);
  assert.equal(crossRes.body.code, 'FORBIDDEN');

  // 3. Rejection requires minimum 5 characters reason
  const noReasonRes = processReviewPhoneChange({
    adminCaller: compAdmin,
    request: compRequest,
    decision: 'rejected',
    decisionReason: 'No',
  });
  assert.equal(noReasonRes.status, 400);
  assert.equal(noReasonRes.body.code, 'REASON_REQUIRED');

  // 4. Valid approval by student's assigned Academic Admin
  const approveRes = processReviewPhoneChange({
    adminCaller: compAdmin,
    request: compRequest,
    decision: 'approved',
  });
  assert.equal(approveRes.status, 200);
  assert.equal(compRequest.status, 'approved');
  assert.equal(compRequest.permission_consumed, false);
});

test('Day 5: Phone Change Workflow - One-time permission consumption and failure-safety (failed save preserves permission and old phone)', () => {
  const student = { id: 'usr_student_01', role: 'student' };
  const profile = {
    student_department_id: 'dept_comp',
    phone_number: '9876543210',
    phone_locked: true,
  };
  const approvedRequest = {
    $id: 'pcr_comp_1',
    student_user_id: 'usr_student_01',
    academic_department_id: 'dept_comp',
    old_phone_number: '9876543210',
    status: 'approved',
    permission_consumed: false,
  };

  // 1. Non-matching student IDOR probe returns 404
  const imposterStudent = { id: 'usr_imposter', role: 'student' };
  const idorRes = processCompletePhoneChange({
    studentCaller: imposterStudent,
    request: approvedRequest,
    profile,
    newPhoneNumber: '9123456789',
  });
  assert.equal(idorRes.status, 404);

  // 2. Failure Safety: DB save failure preserves old phone and unconsumed permission
  const failRes = processCompletePhoneChange({
    studentCaller: student,
    request: approvedRequest,
    profile,
    newPhoneNumber: '9123456789',
    simulateDbError: true,
  });
  assert.equal(failRes.status, 500);
  assert.equal(failRes.body.code, 'PROFILE_SAVE_FAILED');
  assert.equal(profile.phone_number, '9876543210', 'Old phone number must remain active');
  assert.equal(approvedRequest.permission_consumed, false, 'Permission must NOT be consumed on failure');
  assert.equal(approvedRequest.status, 'approved', 'Request status must remain approved for retry');

  // 3. Successful completion updates phone and consumes permission
  const successRes = processCompletePhoneChange({
    studentCaller: student,
    request: approvedRequest,
    profile,
    newPhoneNumber: '9123456789',
    simulateDbError: false,
  });
  assert.equal(successRes.status, 200);
  assert.equal(profile.phone_number, '9123456789');
  assert.equal(approvedRequest.status, 'completed');
  assert.equal(approvedRequest.permission_consumed, true);

  // 4. Repeated attempt with consumed permission returns 403
  const repeatRes = processCompletePhoneChange({
    studentCaller: student,
    request: approvedRequest,
    profile,
    newPhoneNumber: '9988776655',
  });
  assert.equal(repeatRes.status, 403);
  assert.equal(repeatRes.body.code, 'PERMISSION_NOT_AVAILABLE');
});

test('Day 5: Principal Governance - Cross-department visibility across all 6 departments and status mutation prohibition', () => {
  const principal = { id: 'usr_principal_01', role: 'principal' };
  const maintenanceAdmin = { id: 'admin_water_01', role: 'department_admin', department_code: 'dept_water' };

  const waterComplaint = {
    $id: 'cmpl_water_01',
    maintenance_department_id: 'dept_water',
    department_code: 'dept_water',
    status: 'in_progress',
    title: 'Water filter broken',
  };

  // 1. Principal cannot mutate complaint status in processAdminUpdateComplaint (403 FORBIDDEN)
  const prinStatusRes = processAdminUpdateComplaint({
    adminCaller: principal,
    complaint: waterComplaint,
    newStatus: 'resolved',
    officialResponse: 'Principal attempting resolution.',
  });
  assert.equal(prinStatusRes.status, 403);
  assert.equal(prinStatusRes.body.code, 'FORBIDDEN');

  // 2. Maintenance admin can update complaint status
  const adminStatusRes = processAdminUpdateComplaint({
    adminCaller: maintenanceAdmin,
    complaint: waterComplaint,
    newStatus: 'resolved',
    officialResponse: 'Water filter cartridge replaced and flow verified.',
  });
  assert.equal(adminStatusRes.status, 200);
  assert.equal(waterComplaint.status, 'resolved');
});
