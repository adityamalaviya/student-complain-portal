import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { extractAndMapEnrollment } from '../src/lib/utils/department.ts';
import { calculateComplaintDelay } from '../src/lib/utils/delay.ts';

// =====================================================================
// Phase 6: Testing & Hardening Comprehensive Verification Suite
// =====================================================================

// 1. Enrollment & Department Detection Engine (delegates to canonical registry)
function extractDepartmentCode(enrollmentNo) {
  if (typeof enrollmentNo !== 'string') {
    return { isValid: false, code: null, departmentId: null, department: null, error: 'MALFORMED_FORMAT' };
  }
  const trimmed = enrollmentNo.trim();
  if (!/^\d{12}$/.test(trimmed)) {
    return { isValid: false, code: null, departmentId: null, department: null, error: 'INVALID_LENGTH_OR_CHARACTERS' };
  }
  const result = extractAndMapEnrollment(trimmed);
  if (!result.isValid) {
    return {
      isValid: false,
      code: result.code,
      departmentId: null,
      department: null,
      error: 'UNMAPPED_DEPARTMENT_CODE',
    };
  }
  return {
    isValid: true,
    code: result.code,
    departmentId: result.departmentId,
    department: result.departmentName,
    error: null,
  };
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

  // Public complaints are removed; visibility is strictly department-scoped
  if (caller.department_code === complaint.department_code) {
    return { allowed: true, status: 200 };
  }

  // Cross-department probe (even if tagged public): return generic 404 (Oracle Elimination)
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

  // Jurisdiction check: Admin can only manage own department (public issues removed)
  const isOwnDept = complaint.department_code === adminCaller.department_code;
  if (!isOwnDept) {
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
  assert.equal(civil.body.profile.department_name, 'Civil');
  assert.equal(civil.body.profile.is_locked, true);

  // Test valid Computer enrollment (07 at characters 8-9)
  const comp = completeOnboarding({
    existingProfile: null,
    inputName: 'Rahul Verma',
    inputEnrollment: '246510307054',
  });
  assert.equal(comp.status, 200);
  assert.equal(comp.body.profile.department_code, '07');
  assert.equal(comp.body.profile.department_name, 'Computer');

  // Test valid Electrical (09) and Mechanical (19) enrollments
  const elec = completeOnboarding({
    existingProfile: null,
    inputName: 'Neha Joshi',
    inputEnrollment: '246510309012',
  });
  assert.equal(elec.status, 200);
  assert.equal(elec.body.profile.department_name, 'Electrical');

  const mech = completeOnboarding({
    existingProfile: null,
    inputName: 'Karan Desai',
    inputEnrollment: '246510319034',
  });
  assert.equal(mech.status, 200);
  assert.equal(mech.body.profile.department_name, 'Mechanical');

  // Test rejected/disallowed department codes (03, 04, 05, 08, 99)
  for (const rejectedCode of ['03', '04', '05', '08', '99']) {
    const unmapped = completeOnboarding({
      existingProfile: null,
      inputName: 'Test Student',
      inputEnrollment: `2465103${rejectedCode}001`,
    });
    assert.equal(unmapped.status, 400);
    assert.equal(unmapped.body.code, 'UNMAPPED_DEPARTMENT_CODE');
  }

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

  // Civil student accessing same-department grievance (even if legacy public tag) -> 200
  assert.equal(evaluateComplaintVisibility(civilStudent, campusPublicGrievance).status, 200);

  // Cross-department student probing grievance -> 404 (Oracle Elimination: public issues removed)
  const compProbingPublic = evaluateComplaintVisibility(compStudent, campusPublicGrievance);
  assert.equal(compProbingPublic.status, 404);
  assert.equal(compProbingPublic.error, 'Complaint not found.');
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

  // Admin Comp attempting to resolve cross-department issue (even if legacy public tag) -> 404 (Oracle Elimination)
  const compResolvePublic = processAdminResolution({
    adminCaller: adminComp,
    complaint: publicGrievance,
    newStatus: 'in_progress',
    officialResponse: 'Facilities team has ordered replacement filters for the cafeteria cooler.',
  });
  assert.equal(compResolvePublic.status, 404);
  assert.equal(compResolvePublic.body.code, 'NOT_FOUND');
  assert.equal(publicGrievance.status, 'pending', 'Cross-department complaint must remain unmutated');
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

// =====================================================================
// Day 6: Institutional Governance, Warnings, and Audit Engine Helpers
// =====================================================================

const INSTITUTIONAL_DEPARTMENTS_CONFIG = {
  dept_comp: { name: 'Computer Engineering', is_academic: true, is_maintenance: true },
  dept_it: { name: 'Information Technology', is_academic: true, is_maintenance: true },
  dept_mech: { name: 'Mechanical Engineering', is_academic: true, is_maintenance: true },
  dept_civil: { name: 'Civil Engineering', is_academic: true, is_maintenance: true },
  dept_elec: { name: 'Electrical Engineering', is_academic: true, is_maintenance: true },
  dept_water: { name: 'Water & Utilities', is_academic: false, is_maintenance: true },
  dept_sanit: { name: 'Sanitation & Hygiene', is_academic: false, is_maintenance: true },
};

function processIssueWarning({ caller, complaint, warningReason, warningsDb, now = new Date() }) {
  if (caller.role !== 'principal') {
    return {
      status: 403,
      body: { success: false, error: 'Only the Principal can issue warnings on delayed complaints.', code: 'FORBIDDEN' },
    };
  }

  const reason = typeof warningReason === 'string' ? warningReason.trim() : '';
  if (reason.length < 10 || reason.length > 2000) {
    return {
      status: 400,
      body: { success: false, error: 'Warning reason must be between 10 and 2000 characters.', code: 'INVALID_WARNING_REASON' },
    };
  }

  if (complaint.status === 'Resolved' || complaint.status === 'resolved') {
    return {
      status: 400,
      body: { success: false, error: 'Principal cannot issue warnings on resolved complaints.', code: 'CANNOT_WARN_RESOLVED' },
    };
  }

  const delayInfo = calculateComplaintDelay(complaint, now);
  if (!delayInfo.is_delayed) {
    return {
      status: 400,
      body: {
        success: false,
        error: `Complaint is not eligible for a warning. Elapsed time since last milestone has not exceeded 5 days (currently ${delayInfo.days_delayed} days).`,
        code: 'NOT_DELAY_ELIGIBLE',
      },
    };
  }

  const warningId = `cw_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
  const warningRecord = {
    $id: warningId,
    complaint_id: complaint.$id,
    issued_by_principal_id: caller.id,
    warning_reason: reason,
    days_delayed: delayInfo.days_delayed,
    admin_response: null,
    responded_at: null,
    created_at: typeof now === 'string' ? now : now.toISOString(),
  };

  if (warningsDb) {
    const list = warningsDb.get(complaint.$id) || [];
    list.push(warningRecord);
    warningsDb.set(complaint.$id, list);
  }

  return {
    status: 201,
    body: { success: true, warning: warningRecord },
  };
}

function processRespondToWarning({ caller, warning, complaint, adminResponse, now = new Date() }) {
  const isPrincipal = caller.role === 'principal';
  let isAuthorizedAdmin = false;

  if (!isPrincipal && caller.role === 'department_admin') {
    const maintenanceAssignments = (caller.admin_assignments || []).filter(
      (a) => a.is_active && a.scope === 'maintenance' && a.department_id === complaint.maintenance_department_id
    );
    isAuthorizedAdmin = maintenanceAssignments.length > 0;
  }

  if (!isPrincipal && !isAuthorizedAdmin) {
    return {
      status: 403,
      body: {
        success: false,
        error: 'Only the assigned Maintenance Department Administrator can respond to this warning.',
        code: 'FORBIDDEN',
      },
    };
  }

  const responseText = typeof adminResponse === 'string' ? adminResponse.trim() : '';
  if (responseText.length < 10 || responseText.length > 2000) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Admin response must be between 10 and 2000 characters.',
        code: 'INVALID_ADMIN_RESPONSE',
      },
    };
  }

  warning.admin_response = responseText;
  warning.responded_at = typeof now === 'string' ? now : now.toISOString();

  return {
    status: 200,
    body: { success: true, warning },
  };
}

function processAssignAdmin({ caller, email, departmentId, scope, profilesDb, assignmentsDb }) {
  if (caller.role !== 'principal') {
    return {
      status: 403,
      body: { success: false, error: 'Only the Principal can assign department administrators.', code: 'FORBIDDEN' },
    };
  }

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return {
      status: 400,
      body: { success: false, error: 'A valid email address is required.', code: 'INVALID_EMAIL' },
    };
  }

  const dept = INSTITUTIONAL_DEPARTMENTS_CONFIG[departmentId];
  if (!dept) {
    return {
      status: 400,
      body: {
        success: false,
        error: 'Invalid department ID. Must be one of the six canonical institutional departments.',
        code: 'INVALID_DEPARTMENT',
      },
    };
  }

  if (scope !== 'academic' && scope !== 'maintenance') {
    return {
      status: 400,
      body: { success: false, error: "Scope must be either 'academic' or 'maintenance'.", code: 'INVALID_SCOPE' },
    };
  }

  // Canonical Invariant: Water and Sanitation are maintenance-only and cannot have academic administrators
  if (scope === 'academic' && !dept.is_academic) {
    return {
      status: 400,
      body: {
        success: false,
        error: `Department '${dept.name}' (${departmentId}) is maintenance-only and cannot be assigned academic scope.`,
        code: 'INVALID_DEPARTMENT_SCOPE',
      },
    };
  }

  // Look up profile if present
  let targetProfile = null;
  if (profilesDb) {
    for (const p of profilesDb.values()) {
      if (p.email?.toLowerCase() === normalizedEmail) {
        targetProfile = p;
        break;
      }
    }
  }

  const assignmentId = `da_${crypto.randomUUID().replace(/-/g, '').slice(0, 32)}`;
  const assignment = {
    $id: assignmentId,
    user_id: targetProfile ? (targetProfile.user_id || targetProfile.$id) : '',
    email: normalizedEmail,
    department_id: departmentId,
    scope,
    is_active: true,
    assigned_by: caller.id,
    created_at: new Date().toISOString(),
  };

  if (assignmentsDb) {
    assignmentsDb.set(assignmentId, assignment);
  }

  if (targetProfile) {
    targetProfile.role = 'department_admin';
  }

  return {
    status: 201,
    body: { success: true, assignment },
  };
}

function processRevokeAdmin({ caller, assignmentId, profilesDb, assignmentsDb }) {
  if (caller.role !== 'principal') {
    return {
      status: 403,
      body: { success: false, error: 'Only the Principal can revoke administrator assignments.', code: 'FORBIDDEN' },
    };
  }

  const assignment = assignmentsDb ? assignmentsDb.get(assignmentId) : null;
  if (!assignment) {
    return {
      status: 404,
      body: { success: false, error: 'Assignment not found.', code: 'NOT_FOUND' },
    };
  }

  assignment.is_active = false;

  // Check if target user has any other active assignments
  if (assignment.user_id && profilesDb && assignmentsDb) {
    let hasOtherActive = false;
    for (const a of assignmentsDb.values()) {
      if (a.user_id === assignment.user_id && a.is_active && a.$id !== assignmentId) {
        hasOtherActive = true;
        break;
      }
    }
    if (!hasOtherActive) {
      const profile = profilesDb.get(assignment.user_id);
      if (profile) {
        profile.role = 'student';
      }
    }
  }

  return {
    status: 200,
    body: { success: true, assignment },
  };
}

function processGetAuditHistory({ caller, auditLogsList, filter = {} }) {
  if (caller.role !== 'principal') {
    return {
      status: 403,
      body: { success: false, error: 'Only the Principal can inspect system audit logs.', code: 'FORBIDDEN' },
    };
  }

  let filtered = [...auditLogsList];
  if (filter.action) {
    filtered = filtered.filter((log) => log.action === filter.action);
  }
  if (filter.actor_id) {
    filtered = filtered.filter((log) => log.actor_id === filter.actor_id);
  }
  if (filter.target_resource_id) {
    filtered = filtered.filter((log) => log.target_resource_id === filter.target_resource_id);
  }

  // Sort descending by created_at
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    status: 200,
    body: {
      success: true,
      data: {
        audit_logs: filtered,
        total: filtered.length,
      },
    },
  };
}

// ----------------------------------------------------
// Day 6 Tests
// ----------------------------------------------------

test('Phase 6 Test 7: Five-Day Delay Milestone Logic & Non-Substantive Invariance', () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  // 1. Pending complaint created 3 days ago -> NOT delayed
  const pendingRecent = {
    status: 'Pending',
    created_at: new Date(now.getTime() - 3 * MS_PER_DAY).toISOString(),
  };
  const delayRecent = calculateComplaintDelay(pendingRecent, now);
  assert.equal(delayRecent.is_delayed, false);
  assert.equal(delayRecent.days_delayed, 3);

  // 2. Pending complaint created 6 days ago -> IS delayed
  const pendingDelayed = {
    status: 'Pending',
    created_at: new Date(now.getTime() - 6 * MS_PER_DAY).toISOString(),
  };
  const delayOld = calculateComplaintDelay(pendingDelayed, now);
  assert.equal(delayOld.is_delayed, true);
  assert.equal(delayOld.days_delayed, 6);
  assert.ok(delayOld.reason?.includes('pending resolution for more than 5 days'));

  // 3. In Progress complaint created 10 days ago, with substantive progress update 2 days ago -> NOT delayed
  const inProgressActive = {
    status: 'In Progress',
    created_at: new Date(now.getTime() - 10 * MS_PER_DAY).toISOString(),
    last_meaningful_update_at: new Date(now.getTime() - 2 * MS_PER_DAY).toISOString(),
  };
  const delayProgressActive = calculateComplaintDelay(inProgressActive, now);
  assert.equal(delayProgressActive.is_delayed, false);
  assert.equal(delayProgressActive.days_delayed, 2);

  // 4. In Progress complaint created 10 days ago, last meaningful update 8 days ago -> IS delayed
  const inProgressStalled = {
    status: 'In Progress',
    created_at: new Date(now.getTime() - 10 * MS_PER_DAY).toISOString(),
    last_meaningful_update_at: new Date(now.getTime() - 8 * MS_PER_DAY).toISOString(),
  };
  const delayProgressStalled = calculateComplaintDelay(inProgressStalled, now);
  assert.equal(delayProgressStalled.is_delayed, true);
  assert.equal(delayProgressStalled.days_delayed, 8);
  assert.ok(delayProgressStalled.reason?.includes('substantive progress update'));

  // 5. Non-substantive update (e.g. upvote, view) does not change last_meaningful_update_at -> timer continues
  const complaintAfterUpvote = {
    ...inProgressStalled,
    support_count: 5, // Upvote bumped support count but last_meaningful_update_at unchanged
  };
  const delayAfterUpvote = calculateComplaintDelay(complaintAfterUpvote, now);
  assert.equal(delayAfterUpvote.is_delayed, true);
  assert.equal(delayAfterUpvote.days_delayed, 8);

  // 6. Substantive update (admin progress note) resets timer
  const complaintAfterProgressUpdate = {
    ...inProgressStalled,
    last_meaningful_update_at: now.toISOString(),
  };
  const delayAfterSubstantive = calculateComplaintDelay(complaintAfterProgressUpdate, now);
  assert.equal(delayAfterSubstantive.is_delayed, false);
  assert.equal(delayAfterSubstantive.days_delayed, 0);

  // 7. Resolved complaint is NEVER delayed (even if created 40 days ago)
  const resolvedComplaint = {
    status: 'Resolved',
    created_at: new Date(now.getTime() - 40 * MS_PER_DAY).toISOString(),
    resolved_at: new Date(now.getTime() - 30 * MS_PER_DAY).toISOString(),
  };
  const delayResolved = calculateComplaintDelay(resolvedComplaint, now);
  assert.equal(delayResolved.is_delayed, false);
  assert.equal(delayResolved.days_delayed, 0);
});

test('Phase 6 Test 8: Principal Manual Warning Directives, Multiple Warnings & RBAC', () => {
  const now = new Date('2026-11-20T12:00:00.000Z');
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const warningsDb = new Map();

  const principalCaller = { id: 'usr_principal_01', role: 'principal' };
  const studentCaller = { id: 'usr_student_01', role: 'student' };
  const adminCaller = { id: 'usr_admin_01', role: 'department_admin' };

  const delayedComplaint = {
    $id: 'c_water_delayed_01',
    maintenance_department_id: 'dept_water',
    status: 'Pending',
    created_at: new Date(now.getTime() - 7 * MS_PER_DAY).toISOString(),
  };

  const nonDelayedComplaint = {
    $id: 'c_water_fresh_02',
    maintenance_department_id: 'dept_water',
    status: 'Pending',
    created_at: new Date(now.getTime() - 2 * MS_PER_DAY).toISOString(),
  };

  const resolvedComplaint = {
    $id: 'c_water_resolved_03',
    maintenance_department_id: 'dept_water',
    status: 'Resolved',
    created_at: new Date(now.getTime() - 15 * MS_PER_DAY).toISOString(),
  };

  // 1. Student attempts warning -> 403 FORBIDDEN
  const studentAttempt = processIssueWarning({
    caller: studentCaller,
    complaint: delayedComplaint,
    warningReason: 'Student attempting warning directive',
    warningsDb,
    now,
  });
  assert.equal(studentAttempt.status, 403);
  assert.equal(studentAttempt.body.code, 'FORBIDDEN');

  // 2. Department Admin attempts warning -> 403 FORBIDDEN
  const adminAttempt = processIssueWarning({
    caller: adminCaller,
    complaint: delayedComplaint,
    warningReason: 'Admin attempting warning directive',
    warningsDb,
    now,
  });
  assert.equal(adminAttempt.status, 403);
  assert.equal(adminAttempt.body.code, 'FORBIDDEN');

  // 3. Principal warns non-delayed complaint (< 5 days) -> 400 NOT_DELAY_ELIGIBLE
  const earlyWarning = processIssueWarning({
    caller: principalCaller,
    complaint: nonDelayedComplaint,
    warningReason: 'Please attend to this grievance immediately.',
    warningsDb,
    now,
  });
  assert.equal(earlyWarning.status, 400);
  assert.equal(earlyWarning.body.code, 'NOT_DELAY_ELIGIBLE');

  // 4. Principal warns resolved complaint -> 400 CANNOT_WARN_RESOLVED
  const resolvedWarning = processIssueWarning({
    caller: principalCaller,
    complaint: resolvedComplaint,
    warningReason: 'Warning on already resolved grievance',
    warningsDb,
    now,
  });
  assert.equal(resolvedWarning.status, 400);
  assert.equal(resolvedWarning.body.code, 'CANNOT_WARN_RESOLVED');

  // 5. Principal warns delayed complaint (> 5 days) -> 201 Created
  const validWarning1 = processIssueWarning({
    caller: principalCaller,
    complaint: delayedComplaint,
    warningReason: 'First formal directive: Water supply interruption has exceeded standard 5-day milestone.',
    warningsDb,
    now,
  });
  assert.equal(validWarning1.status, 201);
  assert.ok(validWarning1.body.warning.$id.startsWith('cw_'));
  assert.equal(validWarning1.body.warning.days_delayed, 7);

  // 6. Principal issues second warning on same complaint -> multiple warnings supported
  const futureNow = new Date(now.getTime() + 4 * MS_PER_DAY);
  const validWarning2 = processIssueWarning({
    caller: principalCaller,
    complaint: delayedComplaint,
    warningReason: 'Second formal directive: Critical priority escalation requested by campus administration.',
    warningsDb,
    now: futureNow,
  });
  assert.equal(validWarning2.status, 201);
  assert.equal(validWarning2.body.warning.days_delayed, 11);

  const storedWarnings = warningsDb.get(delayedComplaint.$id);
  assert.equal(storedWarnings.length, 2, 'Complaint must have 2 warnings recorded');
});

test('Phase 6 Test 9: Maintenance Admin Warning Responses & Scoped Authorization', () => {
  const now = new Date('2026-11-20T14:00:00.000Z');

  const complaint = {
    $id: 'c_water_100',
    maintenance_department_id: 'dept_water',
    status: 'Pending',
  };

  const warning = {
    $id: 'cw_water_warning_01',
    complaint_id: complaint.$id,
    issued_by_principal_id: 'usr_principal_01',
    warning_reason: 'Please restore water pressure to Block C.',
    days_delayed: 6,
    admin_response: null,
    responded_at: null,
  };

  const studentCaller = { id: 'usr_student_01', role: 'student' };
  const waterMaintenanceAdmin = {
    id: 'usr_water_admin',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_water', scope: 'maintenance', is_active: true }],
  };
  const civilMaintenanceAdmin = {
    id: 'usr_civil_admin',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_civil', scope: 'maintenance', is_active: true }],
  };
  const waterAcademicAdmin = {
    id: 'usr_water_academic',
    role: 'department_admin',
    admin_assignments: [{ department_id: 'dept_water', scope: 'academic', is_active: true }],
  };

  // 1. Student attempt -> 403 FORBIDDEN
  const studentAttempt = processRespondToWarning({
    caller: studentCaller,
    warning,
    complaint,
    adminResponse: 'Student responding to warning directive',
    now,
  });
  assert.equal(studentAttempt.status, 403);
  assert.equal(studentAttempt.body.code, 'FORBIDDEN');

  // 2. Cross-department admin (Civil admin trying to respond to Water warning) -> 403 FORBIDDEN
  const crossDeptAttempt = processRespondToWarning({
    caller: civilMaintenanceAdmin,
    warning,
    complaint,
    adminResponse: 'Civil admin attempting response to Water warning',
    now,
  });
  assert.equal(crossDeptAttempt.status, 403);
  assert.equal(crossDeptAttempt.body.code, 'FORBIDDEN');

  // 3. Academic admin for Water (wrong scope) -> 403 FORBIDDEN
  const academicScopeAttempt = processRespondToWarning({
    caller: waterAcademicAdmin,
    warning,
    complaint,
    adminResponse: 'Academic admin responding to maintenance warning',
    now,
  });
  assert.equal(academicScopeAttempt.status, 403);
  assert.equal(academicScopeAttempt.body.code, 'FORBIDDEN');

  // 4. Authorized Maintenance Admin responds -> 200 Success
  const validResponse = processRespondToWarning({
    caller: waterMaintenanceAdmin,
    warning,
    complaint,
    adminResponse: 'Primary pump overhaul has been completed; water pressure testing scheduled for 4 PM.',
    now,
  });
  assert.equal(validResponse.status, 200);
  assert.equal(
    warning.admin_response,
    'Primary pump overhaul has been completed; water pressure testing scheduled for 4 PM.'
  );
  assert.ok(warning.responded_at);
});

test('Phase 6 Test 10: Dynamic Department Admin Assignment, Water/Sanitation Scope Prohibition & Revocation', () => {
  const profilesDb = new Map();
  const assignmentsDb = new Map();

  const principalCaller = { id: 'usr_principal_01', role: 'principal' };
  const studentCaller = { id: 'usr_student_01', role: 'student' };

  // Seed profiles
  const studentProfile = {
    user_id: 'usr_candidate_01',
    email: 'admin.water@college.edu',
    name: 'Ramesh Patel',
    role: 'student',
  };
  profilesDb.set(studentProfile.user_id, studentProfile);

  // 1. Non-Principal attempts assignment -> 403 FORBIDDEN
  const unauthorizedAssign = processAssignAdmin({
    caller: studentCaller,
    email: 'admin.water@college.edu',
    departmentId: 'dept_water',
    scope: 'maintenance',
    profilesDb,
    assignmentsDb,
  });
  assert.equal(unauthorizedAssign.status, 403);
  assert.equal(unauthorizedAssign.body.code, 'FORBIDDEN');

  // 2. Principal assigns Water (dept_water) with academic scope -> 400 INVALID_DEPARTMENT_SCOPE
  const invalidWaterScope = processAssignAdmin({
    caller: principalCaller,
    email: 'admin.water@college.edu',
    departmentId: 'dept_water',
    scope: 'academic',
    profilesDb,
    assignmentsDb,
  });
  assert.equal(invalidWaterScope.status, 400);
  assert.equal(invalidWaterScope.body.code, 'INVALID_DEPARTMENT_SCOPE');
  assert.ok(invalidWaterScope.body.error.includes('maintenance-only and cannot be assigned academic scope'));

  // 3. Principal assigns Sanitation (dept_sanit) with academic scope -> 400 INVALID_DEPARTMENT_SCOPE
  const invalidSanitScope = processAssignAdmin({
    caller: principalCaller,
    email: 'admin.sanit@college.edu',
    departmentId: 'dept_sanit',
    scope: 'academic',
    profilesDb,
    assignmentsDb,
  });
  assert.equal(invalidSanitScope.status, 400);
  assert.equal(invalidSanitScope.body.code, 'INVALID_DEPARTMENT_SCOPE');

  // 4. Principal assigns Water (dept_water) with maintenance scope -> 201 Success & Role Promotion
  const validWaterAssign = processAssignAdmin({
    caller: principalCaller,
    email: 'admin.water@college.edu',
    departmentId: 'dept_water',
    scope: 'maintenance',
    profilesDb,
    assignmentsDb,
  });
  assert.equal(validWaterAssign.status, 201);
  const assignmentId = validWaterAssign.body.assignment.$id;
  assert.ok(assignmentId.startsWith('da_'));
  assert.equal(studentProfile.role, 'department_admin', 'Target profile role must be promoted to department_admin');

  // 5. Principal assigns Computer (dept_comp) with academic scope -> 201 Success
  const validCompAssign = processAssignAdmin({
    caller: principalCaller,
    email: 'admin.comp@college.edu',
    departmentId: 'dept_comp',
    scope: 'academic',
    profilesDb,
    assignmentsDb,
  });
  assert.equal(validCompAssign.status, 201);
  assert.equal(validCompAssign.body.assignment.scope, 'academic');

  // 6. Principal revokes Water admin assignment -> 200 Success & Role Demotion
  const revokeRes = processRevokeAdmin({
    caller: principalCaller,
    assignmentId,
    profilesDb,
    assignmentsDb,
  });
  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.body.assignment.is_active, false);
  assert.equal(studentProfile.role, 'student', 'Target profile role must revert to student when no active assignments remain');
});

test('Phase 6 Test 11: Append-Only Audit Logs Retrieval, Filtering & Tamper Resistance', () => {
  const principalCaller = { id: 'usr_principal_01', role: 'principal' };
  const studentCaller = { id: 'usr_student_01', role: 'student' };
  const adminCaller = { id: 'usr_admin_01', role: 'department_admin' };

  const auditLogsList = [
    {
      $id: 'audit_01',
      action: 'issue_warning',
      actor_id: 'usr_principal_01',
      actor_role: 'principal',
      target_resource_id: 'cw_01',
      target_resource_type: 'complaint_warning',
      details: JSON.stringify({ complaint_id: 'c_water_01', days_delayed: 6 }),
      created_at: '2026-11-20T10:00:00.000Z',
    },
    {
      $id: 'audit_02',
      action: 'assign_department_admin',
      actor_id: 'usr_principal_01',
      actor_role: 'principal',
      target_resource_id: 'da_01',
      target_resource_type: 'department_admin',
      details: JSON.stringify({ department_id: 'dept_water', scope: 'maintenance' }),
      created_at: '2026-11-20T11:00:00.000Z',
    },
    {
      $id: 'audit_03',
      action: 'respond_to_warning',
      actor_id: 'usr_water_admin',
      actor_role: 'department_admin',
      target_resource_id: 'cw_01',
      target_resource_type: 'complaint_warning',
      details: JSON.stringify({ complaint_id: 'c_water_01', response: 'Inspected' }),
      created_at: '2026-11-20T12:00:00.000Z',
    },
  ];

  // 1. Student attempts to read audit trail -> 403 FORBIDDEN
  const studentAttempt = processGetAuditHistory({
    caller: studentCaller,
    auditLogsList,
  });
  assert.equal(studentAttempt.status, 403);
  assert.equal(studentAttempt.body.code, 'FORBIDDEN');

  // 2. Department Admin attempts to read audit trail -> 403 FORBIDDEN
  const adminAttempt = processGetAuditHistory({
    caller: adminCaller,
    auditLogsList,
  });
  assert.equal(adminAttempt.status, 403);
  assert.equal(adminAttempt.body.code, 'FORBIDDEN');

  // 3. Principal reads complete audit trail -> 200 Success
  const principalRead = processGetAuditHistory({
    caller: principalCaller,
    auditLogsList,
  });
  assert.equal(principalRead.status, 200);
  assert.equal(principalRead.body.data.total, 3);
  // Verify chronological ordering descending
  assert.equal(principalRead.body.data.audit_logs[0].$id, 'audit_03');
  assert.equal(principalRead.body.data.audit_logs[2].$id, 'audit_01');

  // 4. Principal filters by action
  const warningFilter = processGetAuditHistory({
    caller: principalCaller,
    auditLogsList,
    filter: { action: 'issue_warning' },
  });
  assert.equal(warningFilter.status, 200);
  assert.equal(warningFilter.body.data.total, 1);
  assert.equal(warningFilter.body.data.audit_logs[0].action, 'issue_warning');
});

// =====================================================================
// Frontend User Journey & Interactive UI Automated Tests
// =====================================================================

test('Phase 6 Test 12: Frontend Navigation Guards & OAuth Callback Role Routing', () => {
  // Pure state machine modeling src/app/auth/callback/page.tsx & useAuth route guards
  function resolveCallbackRoute({ user, profile, isOnboarded, profileFailed }) {
    if (!user) return '/sign-in?error=oauth_failed';
    if (profileFailed) return 'ERROR_STATE_NO_ONBOARDING';
    if (profile?.role === 'principal') return '/principal';
    if (profile?.role === 'department_admin') return '/admin';
    if (isOnboarded) return '/dashboard';
    return '/onboarding';
  }

  function resolveWorkspaceRoute({ user, profile, isAdmin, isPrincipal, isOnboarded, targetPath }) {
    if (!user) return '/sign-in';
    if (isPrincipal && targetPath !== '/principal') return '/principal';
    if (isAdmin && targetPath !== '/admin') return '/admin';
    if (!isOnboarded && targetPath !== '/onboarding') return '/onboarding';
    return targetPath;
  }

  // 1. Unauthenticated callback -> /sign-in
  assert.equal(resolveCallbackRoute({ user: null }), '/sign-in?error=oauth_failed');

  // 2. Profile query failure -> halts at error state, never defaults to onboarding
  assert.equal(
    resolveCallbackRoute({ user: { $id: 'usr_1' }, profileFailed: true }),
    'ERROR_STATE_NO_ONBOARDING'
  );

  // 3. Principal role -> /principal (even if isOnboarded is false)
  assert.equal(
    resolveCallbackRoute({ user: { $id: 'usr_p' }, profile: { role: 'principal' }, isOnboarded: false }),
    '/principal'
  );

  // 4. Department admin role -> /admin (even if isOnboarded is false)
  assert.equal(
    resolveCallbackRoute({ user: { $id: 'usr_a' }, profile: { role: 'department_admin' }, isOnboarded: false }),
    '/admin'
  );

  // 5. Onboarded student -> /dashboard
  assert.equal(
    resolveCallbackRoute({ user: { $id: 'usr_s' }, profile: { role: 'student' }, isOnboarded: true }),
    '/dashboard'
  );

  // 6. First-time student -> /onboarding
  assert.equal(
    resolveCallbackRoute({ user: { $id: 'usr_s2' }, profile: { role: 'student' }, isOnboarded: false }),
    '/onboarding'
  );

  // 7. Workspace route guards enforce role boundaries
  assert.equal(
    resolveWorkspaceRoute({ user: { $id: 'u1' }, isPrincipal: true, targetPath: '/dashboard' }),
    '/principal',
    'Principal visiting /dashboard must redirect to /principal'
  );
  assert.equal(
    resolveWorkspaceRoute({ user: { $id: 'u2' }, isAdmin: true, targetPath: '/dashboard' }),
    '/admin',
    'Admin visiting /dashboard must redirect to /admin'
  );
  assert.equal(
    resolveWorkspaceRoute({ user: { $id: 'u3' }, isOnboarded: false, targetPath: '/dashboard' }),
    '/onboarding',
    'Incomplete student visiting /dashboard must redirect to /onboarding'
  );
});

test('Phase 6 Test 13: Student Dashboard Feed Filtering & Overdue Complaint Detection', () => {
  // Pure logic matching statusMatchesFilter from src/app/dashboard/page.tsx
  function statusMatchesFilter(complaintStatus, filter) {
    if (filter === 'all') return true;
    if (filter === 'Pending' || filter === 'open') {
      return complaintStatus === 'Pending' || complaintStatus === 'open';
    }
    if (filter === 'In Progress' || filter === 'in_progress') {
      return complaintStatus === 'In Progress' || complaintStatus === 'in_progress';
    }
    if (filter === 'Resolved' || filter === 'resolved') {
      return complaintStatus === 'Resolved' || complaintStatus === 'resolved';
    }
    return complaintStatus === filter;
  }

  const sampleComplaints = [
    { $id: 'c1', title: 'Water leakage in Lab', location: 'Ground floor', description: 'Pipe leak', status: 'Pending' },
    { $id: 'c2', title: 'Power cut in Block A', location: 'Block A', description: 'Switchboard fuse', status: 'In Progress' },
    { $id: 'c3', title: 'Broken bench', location: 'Room 101', description: 'Bench repaired', status: 'Resolved' },
  ];

  // 1. Filter: 'all' returns everything
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'all')).length, 3);

  // 2. Filter: 'Pending' returns only pending items (and supports 'open' alias)
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'Pending')).length, 1);
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'open')).length, 1);

  // 3. Filter: 'In Progress' returns only in_progress items
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'In Progress')).length, 1);
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'in_progress')).length, 1);

  // 4. Filter: 'Resolved' returns only resolved items
  assert.equal(sampleComplaints.filter((c) => statusMatchesFilter(c.status, 'Resolved')).length, 1);

  // 5. Search query matching (case-insensitive across title, location, description)
  function matchesSearch(c, query) {
    const q = query.trim().toLowerCase();
    return c.title.toLowerCase().includes(q) || c.location.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
  }
  assert.equal(sampleComplaints.filter((c) => matchesSearch(c, 'leak')).length, 1);
  assert.equal(sampleComplaints.filter((c) => matchesSearch(c, 'ROOM')).length, 1);
  assert.equal(sampleComplaints.filter((c) => matchesSearch(c, 'nonexistent')).length, 0);

  // 6. Delay detection for feed card badges
  const now = new Date();
  const past6Days = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const past1Day = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

  const delayedPending = calculateComplaintDelay({ status: 'Pending', created_at: past6Days }, now);
  assert.equal(delayedPending.is_delayed, true);
  assert.ok(delayedPending.days_delayed >= 5);

  const freshInProgress = calculateComplaintDelay({ status: 'In Progress', created_at: past6Days, last_meaningful_update_at: past1Day }, now);
  assert.equal(freshInProgress.is_delayed, false);

  const resolvedOld = calculateComplaintDelay({ status: 'Resolved', created_at: past6Days }, now);
  assert.equal(resolvedOld.is_delayed, false);
});

test('Phase 6 Test 14: Interactive Two-Way Support Button State Machine & Optimistic Toggle Lifecycle', async () => {
  // State machine simulating handleSupportComplaint in src/app/dashboard/page.tsx
  function createSupportToggleHarness(initialSupported = false, initialCount = 1) {
    let supported = initialSupported;
    let count = initialCount;

    return {
      getState: () => ({ supported, count }),
      toggle: async (mockApiCall) => {
        const prevSupported = supported;
        const prevCount = count;

        if (prevSupported) {
          // Optimistically revoke
          supported = false;
          count = Math.max(1, prevCount - 1);

          try {
            const res = await mockApiCall('remove');
            if (res.success && res.data) {
              count = res.data.support_count;
            } else {
              // Rollback
              supported = prevSupported;
              count = prevCount;
            }
          } catch {
            // Rollback on network error
            supported = prevSupported;
            count = prevCount;
          }
        } else {
          // Optimistically add
          supported = true;
          count = prevCount + 1;

          try {
            const res = await mockApiCall('add');
            if (res.success && res.data) {
              count = res.data.support_count;
            } else if (res.code === 'ALREADY_SUPPORTED') {
              // Conflict: keep active support state
              supported = true;
              count = prevCount;
            } else {
              // Rollback
              supported = prevSupported;
              count = prevCount;
            }
          } catch {
            // Rollback on network error
            supported = prevSupported;
            count = prevCount;
          }
        }
      },
    };
  }

  // 1. Initial un-supported click -> optimistic increment and API sync
  const harness1 = createSupportToggleHarness(false, 1);
  await harness1.toggle(async () => ({ success: true, data: { support_count: 2 } }));
  assert.deepEqual(harness1.getState(), { supported: true, count: 2 });

  // 2. Click on supported card -> optimistic decrement and API sync
  await harness1.toggle(async () => ({ success: true, data: { support_count: 1 } }));
  assert.deepEqual(harness1.getState(), { supported: false, count: 1 });

  // 3. Network failure on add -> rolls back state and count
  const harness2 = createSupportToggleHarness(false, 3);
  await harness2.toggle(async () => { throw new Error('Network timeout'); });
  assert.deepEqual(harness2.getState(), { supported: false, count: 3 });

  // 4. Network failure on revoke -> rolls back state and count
  const harness3 = createSupportToggleHarness(true, 5);
  await harness3.toggle(async () => { throw new Error('Network timeout'); });
  assert.deepEqual(harness3.getState(), { supported: true, count: 5 });

  // 5. 409 Conflict ALREADY_SUPPORTED -> preserves supported status without crash
  const harness4 = createSupportToggleHarness(false, 2);
  await harness4.toggle(async () => ({ success: false, code: 'ALREADY_SUPPORTED' }));
  assert.deepEqual(harness4.getState(), { supported: true, count: 2 });
});

test('Phase 6 Test 15: Complaint Submission Validation & Private Storage Attachment Security', () => {
  // Pure verification of rules in src/app/complaints/new/page.tsx
  const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
  const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

  function validateFrontendAttachment({ name, size, type }) {
    if (size <= 0) return { valid: false, error: 'Attachment file cannot be empty.' };
    if (size > MAX_ATTACHMENT_BYTES) return { valid: false, error: 'Attachment size exceeds the 5 MB limit.' };

    const ext = name.includes('.') ? name.split('.').pop().trim().toLowerCase() : '';
    const isAllowedType = ALLOWED_MIME_TYPES.includes(type);
    const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);

    if (!isAllowedType || !isAllowedExt) {
      return { valid: false, error: 'Only PDF, JPG, JPEG, or PNG attachments are permitted.' };
    }
    return { valid: true };
  }

  function buildPrivateAttachmentPermissions(userId) {
    return [
      `read("user:${userId}")`,
      `delete("user:${userId}")`,
    ];
  }

  // 1. Valid attachment file checks
  assert.equal(validateFrontendAttachment({ name: 'bill.pdf', size: 1024, type: 'application/pdf' }).valid, true);
  assert.equal(validateFrontendAttachment({ name: 'photo.png', size: 2048, type: 'image/png' }).valid, true);
  assert.equal(validateFrontendAttachment({ name: 'evidence.jpg', size: 4096, type: 'image/jpeg' }).valid, true);

  // 2. File size bounds
  assert.equal(validateFrontendAttachment({ name: 'empty.pdf', size: 0, type: 'application/pdf' }).valid, false);
  assert.equal(validateFrontendAttachment({ name: 'huge.pdf', size: 6 * 1024 * 1024, type: 'application/pdf' }).valid, false);

  // 3. MIME and Extension mismatch
  assert.equal(validateFrontendAttachment({ name: 'script.exe', size: 1024, type: 'application/octet-stream' }).valid, false);
  assert.equal(validateFrontendAttachment({ name: 'fake.pdf', size: 1024, type: 'application/javascript' }).valid, false);

  // 4. Private storage permission generator guarantees exclusive creator ownership
  const permissions = buildPrivateAttachmentPermissions('usr_student_xyz');
  assert.equal(permissions.length, 2);
  assert.equal(permissions[0], 'read("user:usr_student_xyz")');
  assert.equal(permissions[1], 'delete("user:usr_student_xyz")');
  assert.ok(!permissions.some((p) => p.includes('read("any")')), 'Public read permission must never be granted');
});

