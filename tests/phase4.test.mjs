import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------
// Phase 4 Domain Logic Simulation for Pure Unit Testing
// ---------------------------------------------------------------------

function computeSupportDocId(complaintId, userId) {
  return crypto
    .createHash('sha256')
    .update(`${complaintId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

function processSupportComplaint({
  caller,
  profile,
  complaint,
  existingSupports, // Map<string, { complaint_id: string, user_id: string }>
}) {
  // 1. Profile completeness gate
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

  // 2. Student role gate
  if (profile.role !== 'student') {
    return {
      status: 403,
      body: {
        success: false,
        error: 'Only students are eligible to support complaints.',
        code: 'FORBIDDEN',
      },
    };
  }

  // 3. Complaint existence
  if (!complaint) {
    return {
      status: 404,
      body: {
        success: false,
        error: 'Complaint not found.',
        code: 'NOT_FOUND',
      },
    };
  }

  // 4. Prevent self-support
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

  // 5. Oracle Elimination: Check department visibility
  if (complaint.issue_type === 'department') {
    if (profile.department_code !== complaint.department_code) {
      return {
        status: 404,
        body: {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
      };
    }
  }

  // 6. Deterministic SHA-256 Key Uniqueness
  const docId = computeSupportDocId(complaint.$id, caller.id);

  if (existingSupports.has(docId)) {
    // 409 Conflict: Duplicate support attempt
    return {
      status: 409,
      body: {
        success: false,
        error: 'You have already supported this complaint.',
        code: 'ALREADY_SUPPORTED',
      },
    };
  }

  // 7. Persist support record
  existingSupports.set(docId, {
    complaint_id: complaint.$id,
    user_id: caller.id,
    supported_at: new Date().toISOString(),
  });

  const updatedSupportCount = complaint.support_count + 1;
  complaint.support_count = updatedSupportCount;

  return {
    status: 200,
    body: {
      success: true,
      data: {
        support_count: updatedSupportCount,
        has_supported: true,
      },
    },
  };
}

// ---------------------------------------------------------------------
// Phase 4 Test Suite
// ---------------------------------------------------------------------

test('Phase 4 Criterion 1: Deterministic 32-character SHA-256 support document ID', () => {
  const complaintId = 'complaint_xyz_123';
  const userIdA = 'usr_student_alpha';
  const userIdB = 'usr_student_beta';

  const docIdA1 = computeSupportDocId(complaintId, userIdA);
  const docIdA2 = computeSupportDocId(complaintId, userIdA);
  const docIdB = computeSupportDocId(complaintId, userIdB);

  // Exactly 32 hex characters
  assert.equal(docIdA1.length, 32);
  assert.match(docIdA1, /^[a-f0-9]{32}$/);

  // Purely deterministic (same inputs yield same hash)
  assert.equal(docIdA1, docIdA2);

  // Distinct users on same complaint produce distinct IDs
  assert.notEqual(docIdA1, docIdB);
});

test('Phase 4 Criterion 2: Repeated support attempts do not increase the count (Conflict 409)', () => {
  const caller = { id: 'usr_student_01' };
  const profile = {
    user_id: 'usr_student_01',
    role: 'student',
    is_locked: true,
    enrollment_no: '246510307054',
    department_code: '07',
  };
  const complaint = {
    $id: 'complaint_777',
    student_user_id: 'usr_author_99',
    department_code: '07',
    issue_type: 'department',
    support_count: 0,
  };
  const supports = new Map();

  // First support: succeeds, count becomes 1
  const res1 = processSupportComplaint({ caller, profile, complaint, existingSupports: supports });
  assert.equal(res1.status, 200);
  assert.equal(res1.body.success, true);
  assert.equal(res1.body.data.support_count, 1);
  assert.equal(complaint.support_count, 1);
  assert.equal(supports.size, 1);

  // Second support by same student on same complaint: rejected with 409 ALREADY_SUPPORTED
  const res2 = processSupportComplaint({ caller, profile, complaint, existingSupports: supports });
  assert.equal(res2.status, 409);
  assert.equal(res2.body.success, false);
  assert.equal(res2.body.code, 'ALREADY_SUPPORTED');

  // CRITICAL INVARIANT: support_count remains 1, supports map still has 1 record
  assert.equal(complaint.support_count, 1, 'support_count must NOT increase on repeated attempt');
  assert.equal(supports.size, 1, 'Total persisted supports must equal exactly 1');

  // Third repeated support: still rejected, count still 1
  const res3 = processSupportComplaint({ caller, profile, complaint, existingSupports: supports });
  assert.equal(res3.status, 409);
  assert.equal(complaint.support_count, 1);
});

test('Phase 4 Criterion 3: Support action creates a support record and does NOT create a complaint document', () => {
  const complaintsDatabase = [
    {
      $id: 'complaint_101',
      student_user_id: 'usr_student_original',
      department_code: '07',
      issue_type: 'department',
      title: 'Lab 4 AC leak',
      support_count: 3,
    },
  ];
  const supports = new Map();

  const caller = { id: 'usr_voter_02' };
  const profile = {
    user_id: 'usr_voter_02',
    role: 'student',
    is_locked: true,
    enrollment_no: '246510307088',
    department_code: '07',
  };

  const initialComplaintCount = complaintsDatabase.length;
  const targetComplaint = complaintsDatabase[0];

  const res = processSupportComplaint({
    caller,
    profile,
    complaint: targetComplaint,
    existingSupports: supports,
  });

  assert.equal(res.status, 200);
  // Total complaints collection count MUST remain unchanged
  assert.equal(complaintsDatabase.length, initialComplaintCount, 'No new complaint document created');
  // Support count on original complaint incremented
  assert.equal(targetComplaint.support_count, 4);
  // Support record created in supports collection
  assert.equal(supports.size, 1);
});

test('Phase 4 Criterion 4: Students cannot support their own complaints (CANNOT_SUPPORT_OWN_COMPLAINT)', () => {
  const authorCaller = { id: 'usr_author_123' };
  const authorProfile = {
    user_id: 'usr_author_123',
    role: 'student',
    is_locked: true,
    enrollment_no: '246510307054',
    department_code: '07',
  };
  const complaint = {
    $id: 'complaint_author_01',
    student_user_id: 'usr_author_123', // Same as authorCaller.id
    department_code: '07',
    issue_type: 'department',
    support_count: 0,
  };
  const supports = new Map();

  const res = processSupportComplaint({
    caller: authorCaller,
    profile: authorProfile,
    complaint,
    existingSupports: supports,
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'CANNOT_SUPPORT_OWN_COMPLAINT');
  assert.equal(complaint.support_count, 0);
  assert.equal(supports.size, 0);
});

test('Phase 4 Criterion 5: Incomplete and unverified profiles cannot support complaints', () => {
  const caller = { id: 'usr_unonboarded' };
  const incompleteProfile = {
    user_id: 'usr_unonboarded',
    role: 'student',
    is_locked: false, // NOT locked
    enrollment_no: '',
    department_code: '07',
  };
  const complaint = {
    $id: 'complaint_pub_01',
    student_user_id: 'usr_other',
    department_code: '07',
    issue_type: 'public',
    support_count: 5,
  };
  const supports = new Map();

  // Incomplete profile
  const res1 = processSupportComplaint({
    caller,
    profile: incompleteProfile,
    complaint,
    existingSupports: supports,
  });
  assert.equal(res1.status, 400);
  assert.equal(res1.body.code, 'PROFILE_INCOMPLETE');

  // Null profile
  const res2 = processSupportComplaint({
    caller,
    profile: null,
    complaint,
    existingSupports: supports,
  });
  assert.equal(res2.status, 400);
  assert.equal(res2.body.code, 'PROFILE_INCOMPLETE');

  // Admin profile attempting to vote
  const adminProfile = {
    user_id: 'usr_admin',
    role: 'department_admin',
    is_locked: true,
    enrollment_no: 'admin_sys',
    department_code: '07',
  };
  const res3 = processSupportComplaint({
    caller: { id: 'usr_admin' },
    profile: adminProfile,
    complaint,
    existingSupports: supports,
  });
  assert.equal(res3.status, 403);
  assert.equal(res3.body.code, 'FORBIDDEN');
});

test('Phase 4 Criterion 6: Cross-department support attempt on private complaint returns 404 (Oracle Elimination)', () => {
  const civilCaller = { id: 'usr_civil_student' };
  const civilProfile = {
    user_id: 'usr_civil_student',
    role: 'student',
    is_locked: true,
    enrollment_no: '246510306012',
    department_code: '06', // Civil
  };

  const computerPrivateComplaint = {
    $id: 'complaint_comp_private',
    student_user_id: 'usr_comp_author',
    department_code: '07', // Computer
    issue_type: 'department', // Private
    support_count: 2,
  };
  const supports = new Map();

  // Civil student probes Computer private complaint
  const res = processSupportComplaint({
    caller: civilCaller,
    profile: civilProfile,
    complaint: computerPrivateComplaint,
    existingSupports: supports,
  });

  assert.equal(res.status, 404, 'Must return 404 generic not found (never 403)');
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(computerPrivateComplaint.support_count, 2);
  assert.equal(supports.size, 0);

  // Civil student supports a PUBLIC issue from Computer department: allowed!
  const publicComplaint = {
    $id: 'complaint_public_shared',
    student_user_id: 'usr_comp_author',
    department_code: '07',
    issue_type: 'public',
    support_count: 10,
  };

  const pubRes = processSupportComplaint({
    caller: civilCaller,
    profile: civilProfile,
    complaint: publicComplaint,
    existingSupports: supports,
  });
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.body.data.support_count, 11);
  assert.equal(supports.size, 1);
});
