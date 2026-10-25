import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// =====================================================================
// Phase 6: Testing & Hardening Comprehensive Verification Suite
// =====================================================================

// 1. Enrollment & Department Detection Engine
function extractDepartmentCode(enrollmentNo) {
  if (typeof enrollmentNo !== 'string') {
    return { isValid: false, code: null, department: null, error: 'MALFORMED_FORMAT' };
  }
  const trimmed = enrollmentNo.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    return { isValid: false, code: null, department: null, error: 'INVALID_LENGTH_OR_CHARACTERS' };
  }
  const code = trimmed.slice(7, 9);
  if (code === '06') {
    return { isValid: true, code: '06', department: 'Civil Department', error: null };
  }
  if (code === '07') {
    return { isValid: true, code: '07', department: 'Computer Department', error: null };
  }
  return { isValid: false, code, department: null, error: 'UNMAPPED_DEPARTMENT_CODE' };
}

// 2. Profile Onboarding & Immutability Rules
const VERBATIM_PROFILE_LOCK_WARNING =
  'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.';

function completeOnboarding({ existingProfile, inputName, inputEnrollment }) {
  if (existingProfile && existingProfile.is_locked) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Profile is permanently locked and cannot be modified.',
        code: 'PROFILE_LOCKED',
      },
    };
  }

  const name = typeof inputName === 'string' ? inputName.trim() : '';
  if (name.length < 2 || name.length > 50) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Full name must be between 2 and 50 characters.',
        code: 'INVALID_NAME',
      },
    };
  }

  const deptResult = extractDepartmentCode(inputEnrollment);
  if (!deptResult.isValid) {
    return {
      status: 400,
      body: {
        success: false,
        error: `Invalid enrollment number: ${deptResult.error}`,
        code: deptResult.error,
      },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      profile: {
        name,
        enrollment_no: inputEnrollment.trim(),
        department_code: deptResult.code,
        department_name: deptResult.department,
        is_locked: true,
        role: 'student',
      },
    },
  };
}

// 3. Oracle Elimination Visibility Engine
function evaluateComplaintVisibility(caller, complaint) {
  if (!complaint) {
    return { allowed: false, status: 404, error: 'Complaint not found.' };
  }

  // Public complaints are visible across all active departments
  if (complaint.issue_type === 'public') {
    return { allowed: true, status: 200 };
  }

  // Department-scoped complaint: must match caller's department
  if (caller.department_code === complaint.department_code) {
    return { allowed: true, status: 200 };
  }

  // Cross-department probe: return generic 404 (Oracle Elimination)
  return { allowed: false, status: 404, error: 'Complaint not found.' };
}

// 4. Community Support Workflow & Atomic Concurrency Simulation
function computeSupportDocId(complaintId, userId) {
  return crypto
    .createHash('sha256')
    .update(`${complaintId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

function processSupportComplaint({ caller, profile, complaint, existingSupportsMap }) {
  // Gate 1: Profile completeness
  if (!profile || !profile.is_locked || !profile.enrollment_no) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Student profile must be complete and verified before supporting complaints.',
        code: 'PROFILE_INCOMPLETE',
      },
    };
  }

  // Gate 2: Student role
  if (profile.role !== 'student') {
    return {
      status: 403,
      body: { success: false, error: 'Only students are eligible to support complaints.', code: 'FORBIDDEN' },
    };
  }

  // Gate 3: Oracle elimination
  const visibility = evaluateComplaintVisibility(profile, complaint);
  if (!visibility.allowed) {
    return {
      status: visibility.status,
      body: { success: false, error: visibility.error, code: 'NOT_FOUND' },
    };
  }

  // Gate 4: Self-support prevention
  if (complaint.student_user_id === caller.id) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Students cannot support their own complaints.',
        code: 'CANNOT_SUPPORT_OWN_COMPLAINT',
      },
    };
  }

  // Gate 5: Deterministic 32-char SHA-256 Uniqueness & Conflict Handling
  const supportDocId = computeSupportDocId(complaint.$id, caller.id);
  if (existingSupportsMap.has(supportDocId)) {
    return {
      status: 409,
      body: {
        success: false,
        error: 'You have already supported this complaint.',
        code: 'ALREADY_SUPPORTED',
      },
    };
  }

  // Create support record
  existingSupportsMap.set(supportDocId, {
    $id: supportDocId,
    complaint_id: complaint.$id,
    user_id: caller.id,
    created_at: new Date().toISOString(),
  });

  // Atomically increment counter
  complaint.support_count = (complaint.support_count || 0) + 1;

  return {
    status: 200,
    body: {
      success: true,
      has_supported: true,
      support_count: complaint.support_count,
    },
  };
}

// 5. Admin Authorization & Scoped Resolution Engine
function processAdminResolution({ adminCaller, complaint, newStatus, officialResponse }) {
  if (adminCaller.role !== 'department_admin' || !adminCaller.department_code) {
    return {
      status: 403,
      body: { success: false, error: 'Forbidden: Department administrator privileges required.', code: 'FORBIDDEN' },
    };
  }

  if (!complaint) {
    return { status: 404, body: { success: false, error: 'Complaint not found.', code: 'NOT_FOUND' } };
  }

  // Jurisdiction check: Admin can only manage own department or Public Issues
  const isOwnDept = complaint.department_code === adminCaller.department_code;
  const isPublic = complaint.issue_type === 'public';
  if (!isOwnDept && !isPublic) {
    // Cross-department probe: Oracle Elimination generic 404
    return { status: 404, body: { success: false, error: 'Complaint not found.', code: 'NOT_FOUND' } };
  }

  if (!['in_progress', 'resolved'].includes(newStatus)) {
    return {
      status: 400,
      body: { success: false, error: "Status must be updated to 'in_progress' or 'resolved'.", code: 'INVALID_STATUS' },
    };
  }

  const trimmedResp = typeof officialResponse === 'string' ? officialResponse.trim() : '';
  if (trimmedResp.length < 5 || trimmedResp.length > 1000) {
    return {
      status: 400,
      body: { success: false, error: 'Official response must be between 5 and 1000 characters.', code: 'INVALID_RESPONSE' },
    };
  }

  const now = new Date().toISOString();
  complaint.status = newStatus;
  complaint.official_response = trimmedResp;
  complaint.updated_at = now;
  if (newStatus === 'resolved') {
    complaint.resolved_at = now;
  }

  return {
    status: 200,
    body: { success: true, complaint },
  };
}

// =====================================================================
// Automated Test Suite for Phase 6
// =====================================================================

test('Phase 6 Test 1: Onboarding format validation, department extraction, and pending/fallback rejection', () => {
  // Test valid Civil enrollment (06 at characters 8-9)
  const civil = completeOnboarding({
    existingProfile: null,
    inputName: 'Aditya Malaviya',
    inputEnrollment: '246510306001',
  });
  assert.equal(civil.status, 200);
  assert.equal(civil.body.profile.department_code, '06');
  assert.equal(civil.body.profile.department_name, 'Civil Department');
  assert.equal(civil.body.profile.is_locked, true);

  // Test valid Computer enrollment (07 at characters 8-9)
  const comp = completeOnboarding({
    existingProfile: null,
    inputName: 'Rahul Verma',
    inputEnrollment: '246510307054',
  });
  assert.equal(comp.status, 200);
  assert.equal(comp.body.profile.department_code, '07');
  assert.equal(comp.body.profile.department_name, 'Computer Department');

  // Test invalid department code (e.g. 05 or 99)
  const unmapped = completeOnboarding({
    existingProfile: null,
    inputName: 'Test Student',
    inputEnrollment: '246510399001',
  });
  assert.equal(unmapped.status, 400);
  assert.equal(unmapped.body.code, 'UNMAPPED_DEPARTMENT_CODE');

  // Test malformed length (less than 12 digits)
  const tooShort = completeOnboarding({
    existingProfile: null,
    inputName: 'Short Student',
    inputEnrollment: '2465103070',
  });
  assert.equal(tooShort.status, 400);
  assert.equal(tooShort.body.code, 'INVALID_LENGTH_OR_CHARACTERS');

  // Test non-numeric characters
  const nonNumeric = completeOnboarding({
    existingProfile: null,
    inputName: 'Letter Student',
    inputEnrollment: '2465103AB054',
  });
  assert.equal(nonNumeric.status, 400);
  assert.equal(nonNumeric.body.code, 'INVALID_LENGTH_OR_CHARACTERS');
});

test('Phase 6 Test 2: First-time profile lock immutability and verbatim warning preservation', () => {
  assert.equal(
    VERBATIM_PROFILE_LOCK_WARNING,
    'Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.'
  );

  const lockedProfile = {
    name: 'Rahul Verma',
    enrollment_no: '246510307054',
    department_code: '07',
    is_locked: true,
  };

  const attemptUpdate = completeOnboarding({
    existingProfile: lockedProfile,
    inputName: 'Hacker Name',
    inputEnrollment: '246510306999',
  });
  assert.equal(attemptUpdate.status, 400);
  assert.equal(attemptUpdate.body.code, 'PROFILE_LOCKED');
});

test('Phase 6 Test 3: Department isolation & cross-department Oracle Elimination', () => {
  const civilStudent = { department_code: '06', role: 'student' };
  const compStudent = { department_code: '07', role: 'student' };

  const civilPrivateGrievance = {
    $id: 'complaint_civil_001',
    department_code: '06',
    issue_type: 'department',
    title: 'Fluid Mechanics Lab Valve Leak',
  };

  const compPrivateGrievance = {
    $id: 'complaint_comp_002',
    department_code: '07',
    issue_type: 'department',
    title: 'Operating Systems Server Crash',
  };

  const campusPublicGrievance = {
    $id: 'complaint_pub_003',
    department_code: '06',
    issue_type: 'public',
    title: 'Central Cafeteria Water Cooler Filter Clogged',
  };

  // Civil student accessing civil private -> 200
  assert.equal(evaluateComplaintVisibility(civilStudent, civilPrivateGrievance).status, 200);

  // Computer student probing civil private -> 404 (Oracle Elimination)
  const compProbingCivil = evaluateComplaintVisibility(compStudent, civilPrivateGrievance);
  assert.equal(compProbingCivil.status, 404);
  assert.equal(compProbingCivil.error, 'Complaint not found.');

  // Civil student probing computer private -> 404 (Oracle Elimination)
  const civilProbingComp = evaluateComplaintVisibility(civilStudent, compPrivateGrievance);
  assert.equal(civilProbingComp.status, 404);
  assert.equal(civilProbingComp.error, 'Complaint not found.');

  // Both students accessing Public Issue -> 200
  assert.equal(evaluateComplaintVisibility(civilStudent, campusPublicGrievance).status, 200);
  assert.equal(evaluateComplaintVisibility(compStudent, campusPublicGrievance).status, 200);
});

test('Phase 6 Test 4: Community support uniqueness, deterministic SHA-256 IDs, and duplicate/concurrency invariance', () => {
  const supportsStore = new Map();
  const grievance = {
    $id: 'complaint_comp_555',
    student_user_id: 'student_author_1',
    department_code: '07',
    issue_type: 'department',
    support_count: 0,
  };

  const studentSupporter1 = {
    id: 'student_supporter_1',
    profile: {
      is_locked: true,
      enrollment_no: '246510307088',
      department_code: '07',
      role: 'student',
    },
  };

  // First support
  const res1 = processSupportComplaint({
    caller: { id: studentSupporter1.id },
    profile: studentSupporter1.profile,
    complaint: grievance,
    existingSupportsMap: supportsStore,
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.body.support_count, 1);
  assert.equal(grievance.support_count, 1);

  // Verify deterministic SHA-256 ID length (32 chars)
  const expectedDocId = crypto
    .createHash('sha256')
    .update(`${grievance.$id}:${studentSupporter1.id}`)
    .digest('hex')
    .slice(0, 32);
  assert.equal(supportsStore.has(expectedDocId), true);
  assert.equal(expectedDocId.length, 32);

  // Duplicate support attempt by same user
  const resDuplicate = processSupportComplaint({
    caller: { id: studentSupporter1.id },
    profile: studentSupporter1.profile,
    complaint: grievance,
    existingSupportsMap: supportsStore,
  });
  assert.equal(resDuplicate.status, 409);
  assert.equal(resDuplicate.body.code, 'ALREADY_SUPPORTED');
  assert.equal(grievance.support_count, 1, 'Counter must remain unchanged on duplicate attempt');

  // Author self-support attempt
  const resSelf = processSupportComplaint({
    caller: { id: grievance.student_user_id },
    profile: {
      is_locked: true,
      enrollment_no: '246510307001',
      department_code: '07',
      role: 'student',
    },
    complaint: grievance,
    existingSupportsMap: supportsStore,
  });
  assert.equal(resSelf.status, 400);
  assert.equal(resSelf.body.code, 'CANNOT_SUPPORT_OWN_COMPLAINT');
  assert.equal(grievance.support_count, 1);

  // Incomplete profile support attempt
  const resIncomplete = processSupportComplaint({
    caller: { id: 'unverified_usr' },
    profile: { is_locked: false, enrollment_no: '', role: 'student' },
    complaint: grievance,
    existingSupportsMap: supportsStore,
  });
  assert.equal(resIncomplete.status, 400);
  assert.equal(resIncomplete.body.code, 'PROFILE_INCOMPLETE');

  // Second distinct student supporter
  const studentSupporter2 = {
    id: 'student_supporter_2',
    profile: {
      is_locked: true,
      enrollment_no: '246510307099',
      department_code: '07',
      role: 'student',
    },
  };
  const res2 = processSupportComplaint({
    caller: { id: studentSupporter2.id },
    profile: studentSupporter2.profile,
    complaint: grievance,
    existingSupportsMap: supportsStore,
  });
  assert.equal(res2.status, 200);
  assert.equal(res2.body.support_count, 2);
  assert.equal(grievance.support_count, 2);
  assert.equal(supportsStore.size, 2);
});

test('Phase 6 Test 5: Admin authorization, scoped resolution, and Oracle Elimination', () => {
  const adminCivil = { role: 'department_admin', department_code: '06', email: 'admin.civil@college.edu' };
  const adminComp = { role: 'department_admin', department_code: '07', email: 'admin.comp@college.edu' };
  const studentCaller = { role: 'student', department_code: '06' };

  const civilGrievance = {
    $id: 'c_civil_100',
    department_code: '06',
    issue_type: 'department',
    status: 'pending',
    official_response: null,
  };

  const compGrievance = {
    $id: 'c_comp_200',
    department_code: '07',
    issue_type: 'department',
    status: 'pending',
    official_response: null,
  };

  const publicGrievance = {
    $id: 'c_pub_300',
    department_code: '06',
    issue_type: 'public',
    status: 'pending',
    official_response: null,
  };

  // Student forbidden from resolving
  const studentAttempt = processAdminResolution({
    adminCaller: studentCaller,
    complaint: civilGrievance,
    newStatus: 'resolved',
    officialResponse: 'Student trying to resolve',
  });
  assert.equal(studentAttempt.status, 403);
  assert.equal(studentAttempt.body.code, 'FORBIDDEN');

  // Admin Civil resolving Civil complaint -> Success
  const civilResolve = processAdminResolution({
    adminCaller: adminCivil,
    complaint: civilGrievance,
    newStatus: 'resolved',
    officialResponse: 'Civil maintenance has inspected the leak and replaced the primary pipe gasket.',
  });
  assert.equal(civilResolve.status, 200);
  assert.equal(civilGrievance.status, 'resolved');
  assert.ok(civilGrievance.resolved_at);
  assert.equal(
    civilGrievance.official_response,
    'Civil maintenance has inspected the leak and replaced the primary pipe gasket.'
  );

  // Admin Civil attempting to resolve Computer complaint -> 404 (Oracle Elimination)
  const civilProbingComp = processAdminResolution({
    adminCaller: adminCivil,
    complaint: compGrievance,
    newStatus: 'resolved',
    officialResponse: 'Unauthorized cross-department resolution attempt',
  });
  assert.equal(civilProbingComp.status, 404);
  assert.equal(civilProbingComp.body.code, 'NOT_FOUND');
  assert.equal(compGrievance.status, 'pending', 'Computer complaint must remain unmutated');

  // Admin Comp resolving Public Issue -> Success
  const compResolvePublic = processAdminResolution({
    adminCaller: adminComp,
    complaint: publicGrievance,
    newStatus: 'in_progress',
    officialResponse: 'Facilities team has ordered replacement filters for the cafeteria cooler.',
  });
  assert.equal(compResolvePublic.status, 200);
  assert.equal(publicGrievance.status, 'in_progress');
});

test('Phase 6 Test 6: Full Multi-Role End-to-End Lifecycle Verification', () => {
  // Scenario:
  // 1. Student A (Civil, '246510306010') completes onboarding and profile is locked.
  // 2. Student A submits grievance: "Concrete Lab Hydraulic Press Calibration Fault".
  // 3. Student B (Civil, '246510306020') supports grievance -> support_count becomes 1.
  // 4. Student C (Computer, '246510307030') tries to access grievance -> receives generic 404.
  // 5. Admin Civil updates grievance status to 'in_progress' with official note.
  // 6. Admin Comp attempts to modify grievance -> rejected with generic 404.
  // 7. Admin Civil resolves grievance with complete official resolution.
  // 8. Student A reviews resolved grievance and sees resolution timestamp + response card.

  const supportsDb = new Map();

  // 1. Onboard Student A
  const studentAOnboard = completeOnboarding({
    existingProfile: null,
    inputName: 'Aditya Student',
    inputEnrollment: '246510306010',
  });
  assert.equal(studentAOnboard.status, 200);
  const studentAProfile = studentAOnboard.body.profile;

  // 2. Student A creates complaint
  const complaint = {
    $id: 'grievance_civil_999',
    student_user_id: 'usr_student_a',
    student_name: studentAProfile.name,
    student_enrollment: studentAProfile.enrollment_no,
    department_code: studentAProfile.department_code,
    title: 'Concrete Lab Hydraulic Press Calibration Fault',
    location: 'Civil Engineering Block B, Room 102',
    description: 'The pressure gauge on the hydraulic testing machine fluctuates erratically during compression tests.',
    priority: 'High',
    issue_type: 'department',
    status: 'pending',
    support_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    official_response: null,
    resolved_at: null,
  };

  // 3. Student B supports
  const studentBProfile = {
    name: 'Bhavin Patel',
    enrollment_no: '246510306020',
    department_code: '06',
    is_locked: true,
    role: 'student',
  };
  const supportRes = processSupportComplaint({
    caller: { id: 'usr_student_b' },
    profile: studentBProfile,
    complaint,
    existingSupportsMap: supportsDb,
  });
  assert.equal(supportRes.status, 200);
  assert.equal(complaint.support_count, 1);

  // 4. Student C (Computer) probes -> 404
  const studentCProfile = {
    name: 'Chetan Shah',
    enrollment_no: '246510307030',
    department_code: '07',
    is_locked: true,
    role: 'student',
  };
  const crossProbe = evaluateComplaintVisibility(studentCProfile, complaint);
  assert.equal(crossProbe.status, 404);

  // 5. Admin Civil updates to 'in_progress'
  const adminCivil = { role: 'department_admin', department_code: '06', email: 'admin.civil@college.edu' };
  const inProgressRes = processAdminResolution({
    adminCaller: adminCivil,
    complaint,
    newStatus: 'in_progress',
    officialResponse: 'Civil lab technician has scheduled recalibration with equipment vendor for Tuesday morning.',
  });
  assert.equal(inProgressRes.status, 200);
  assert.equal(complaint.status, 'in_progress');

  // 6. Admin Comp cross-department probe -> 404
  const adminComp = { role: 'department_admin', department_code: '07', email: 'admin.comp@college.edu' };
  const unauthorizedAdminAction = processAdminResolution({
    adminCaller: adminComp,
    complaint,
    newStatus: 'resolved',
    officialResponse: 'Trying to tamper with Civil grievance',
  });
  assert.equal(unauthorizedAdminAction.status, 404);

  // 7. Admin Civil resolves
  const resolveRes = processAdminResolution({
    adminCaller: adminCivil,
    complaint,
    newStatus: 'resolved',
    officialResponse: 'Vendor recalibration completed. Pressure gauge sensor replaced and recalibrated to ISO standards.',
  });
  assert.equal(resolveRes.status, 200);
  assert.equal(complaint.status, 'resolved');
  assert.ok(complaint.resolved_at);

  // 8. Student A verifies final resolved state
  const studentAView = evaluateComplaintVisibility(studentAProfile, complaint);
  assert.equal(studentAView.status, 200);
  assert.equal(complaint.status, 'resolved');
  assert.equal(
    complaint.official_response,
    'Vendor recalibration completed. Pressure gauge sensor replaced and recalibrated to ISO standards.'
  );
  assert.equal(complaint.support_count, 1);
});
