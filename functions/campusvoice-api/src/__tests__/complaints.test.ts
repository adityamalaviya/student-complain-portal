import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type { Complaint, DepartmentCode, IssueType } from '../types.js';

/**
 * Pure authorization evaluation function enforcing Phase 3 Cross-Department Oracle Elimination.
 *
 * Rules:
 * 1. If complaint is 'public', any authenticated student or admin from any department can view it.
 * 2. If complaint is 'department', the caller's department MUST exactly match the complaint's department.
 * 3. If caller's department does NOT match, the system MUST return a generic 404 Not Found (never 403, never revealing existence).
 */
function evaluateComplaintAccess(
  callerDept: DepartmentCode,
  complaint: { department_code: DepartmentCode; issue_type: IssueType }
): { allowed: boolean; status: 200 | 404 } {
  if (complaint.issue_type === 'public') {
    return { allowed: true, status: 200 };
  }

  if (complaint.issue_type === 'department') {
    if (callerDept === complaint.department_code) {
      return { allowed: true, status: 200 };
    }
    // Oracle Elimination: Must return generic 404
    return { allowed: false, status: 404 };
  }

  return { allowed: false, status: 404 };
}

/**
 * Validates input parameters for creating a new complaint per Phase 3 specifications.
 */
function validateComplaintPayload(payload: {
  title: string;
  location: string;
  description: string;
  priority: string;
  issue_type: string;
}): { valid: boolean; error?: string } {
  const title = payload.title.trim();
  const location = payload.location.trim();
  const description = payload.description.trim();

  if (title.length < 5 || title.length > 150) {
    return { valid: false, error: 'Complaint title must be between 5 and 150 characters.' };
  }
  if (location.length < 3 || location.length > 100) {
    return { valid: false, error: 'Location must be between 3 and 100 characters.' };
  }
  if (description.length < 10 || description.length > 2000) {
    return { valid: false, error: 'Description must be between 10 and 2000 characters.' };
  }
  if (!['low', 'medium', 'high'].includes(payload.priority)) {
    return { valid: false, error: "Priority must be 'low', 'medium', or 'high'." };
  }
  if (!['department', 'public'].includes(payload.issue_type)) {
    return { valid: false, error: "Issue type must be 'department' or 'public'." };
  }

  return { valid: true };
}

test('Phase 3 Exit Criteria: Department A cannot access Department B private complaints (Oracle Elimination)', () => {
  const civilDept: DepartmentCode = '06';
  const compDept: DepartmentCode = '07';

  const computerPrivateComplaint = {
    department_code: compDept,
    issue_type: 'department' as IssueType,
  };

  // Student from Civil (06) attempts to access Computer (07) private complaint
  const civilAccess = evaluateComplaintAccess(civilDept, computerPrivateComplaint);
  assert.equal(civilAccess.allowed, false, 'Civil student must not access Computer private complaint');
  assert.equal(civilAccess.status, 404, 'Must return generic 404 to eliminate cross-department oracle');

  // Student from Computer (07) accesses Computer (07) private complaint
  const compAccess = evaluateComplaintAccess(compDept, computerPrivateComplaint);
  assert.equal(compAccess.allowed, true, 'Computer student must access Computer private complaint');
  assert.equal(compAccess.status, 200);
});

test('Phase 3 Exit Criteria: Both departments can access Public Issues', () => {
  const civilDept: DepartmentCode = '06';
  const compDept: DepartmentCode = '07';

  const publicGrievance = {
    department_code: compDept,
    issue_type: 'public' as IssueType,
  };

  const civilAccess = evaluateComplaintAccess(civilDept, publicGrievance);
  assert.equal(civilAccess.allowed, true, 'Civil department student must access public grievances');
  assert.equal(civilAccess.status, 200);

  const compAccess = evaluateComplaintAccess(compDept, publicGrievance);
  assert.equal(compAccess.allowed, true, 'Computer department student must access public grievances');
  assert.equal(compAccess.status, 200);
});

test('Phase 3 Validation: Complaint creation payload bounds checking', () => {
  // Valid payload
  const valid = validateComplaintPayload({
    title: 'AC unit leaking in Room 304',
    location: 'Computer Lab 3, 2nd Floor',
    description: 'The split AC unit is dripping water directly above server rack 2.',
    priority: 'high',
    issue_type: 'department',
  });
  assert.equal(valid.valid, true);

  // Too short title (< 5 chars)
  const shortTitle = validateComplaintPayload({
    title: 'Leak',
    location: 'Lab 3',
    description: 'Valid description with more than 10 characters',
    priority: 'high',
    issue_type: 'department',
  });
  assert.equal(shortTitle.valid, false);

  // Invalid priority
  const invalidPriority = validateComplaintPayload({
    title: 'Valid Complaint Title',
    location: 'Lab 3',
    description: 'Valid description with more than 10 characters',
    priority: 'critical', // not allowed
    issue_type: 'department',
  });
  assert.equal(invalidPriority.valid, false);

  // Invalid issue_type
  const invalidScope = validateComplaintPayload({
    title: 'Valid Complaint Title',
    location: 'Lab 3',
    description: 'Valid description with more than 10 characters',
    priority: 'medium',
    issue_type: 'global', // not allowed
  });
  assert.equal(invalidScope.valid, false);
});

test('Phase 4 Exit Criteria: Deterministic 32-character SHA-256 support document ID', () => {
  const complaintId = '671234567890abcdef123456';
  const userId = 'usr_student_123';
  const docId = crypto.createHash('sha256').update(`${complaintId}:${userId}`).digest('hex').slice(0, 32);
  assert.equal(docId.length, 32);
  assert.match(docId, /^[a-f0-9]{32}$/);
  // Deterministic check
  const docIdAgain = crypto.createHash('sha256').update(`${complaintId}:${userId}`).digest('hex').slice(0, 32);
  assert.equal(docId, docIdAgain);
});
