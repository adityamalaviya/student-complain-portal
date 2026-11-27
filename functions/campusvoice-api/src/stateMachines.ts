import type { Models } from 'node-appwrite';
import {
  PHONE_NUMBER_REGEX,
  isAcademicDepartment,
  normalizeComplaintStatus,
  readBooleanField,
  readStringField,
  resolveDepartment,
  resolveLegacyDepartmentCode,
} from './departments.js';
import type {
  CanonicalComplaintStatus,
  ClarificationState,
  ComplaintTimeline,
  ProfileStatus,
  WarningState,
} from './types.js';

export interface TransitionValidationResult {
  allowed: boolean;
  code?: string;
  error?: string;
}

/**
 * Authoritative Complaint Status Transition State Machine:
 * - Pending -> Pending (note only) | In Progress | Resolved
 * - In Progress -> In Progress (note or substantive progress) | Resolved
 * - Resolved -> Resolved (post-resolution follow-up note only; never reverts to Pending or In Progress)
 */
export function validateComplaintStatusTransition(
  currentStatus: CanonicalComplaintStatus,
  nextStatus: CanonicalComplaintStatus
): TransitionValidationResult {
  if (currentStatus !== 'Pending' && nextStatus === 'Pending') {
    return {
      allowed: false,
      code: 'INVALID_STATUS_TRANSITION',
      error: "Cannot revert an 'In Progress' or 'Resolved' complaint back to 'Pending'.",
    };
  }

  if (currentStatus === 'Resolved' && nextStatus === 'In Progress') {
    return {
      allowed: false,
      code: 'INVALID_STATUS_TRANSITION',
      error: "Cannot reopen a 'Resolved' complaint back to 'In Progress'.",
    };
  }

  return { allowed: true };
}

/**
 * Determines whether a complaint update counts as a meaningful SLA milestone that resets
 * last_meaningful_update_at.
 * Only real status changes or substantive progress updates while In Progress reset the clock.
 */
export function isMeaningfulComplaintUpdate(
  currentStatus: CanonicalComplaintStatus,
  nextStatus: CanonicalComplaintStatus,
  requestedSubstantive: boolean
): boolean {
  if (currentStatus !== nextStatus) {
    return true;
  }
  return currentStatus === 'In Progress' && requestedSubstantive;
}

/**
 * Derives turn-based clarification state from chronological timeline entries:
 * - 'none': no clarification request has been issued yet
 * - 'awaiting_reply': latest clarification event is a 'clarification_request'
 * - 'replied': creator has already submitted a 'clarification_reply' after the latest request
 */
export function getClarificationState(
  timeline: readonly Pick<ComplaintTimeline, 'entry_type'>[]
): ClarificationState {
  let state: ClarificationState = 'none';
  for (const entry of timeline) {
    const rawType = String(entry.entry_type);
    if (rawType === 'clarification_request' || rawType === 'request_clarification') {
      state = 'awaiting_reply';
    } else if (rawType === 'clarification_reply' || rawType === 'reply_clarification') {
      if (state === 'awaiting_reply') {
        state = 'replied';
      }
    }
  }
  return state;
}

export function validateClarificationRequest(
  complaintStatus: unknown
): TransitionValidationResult {
  const normalized = normalizeComplaintStatus(complaintStatus);
  if (normalized === 'Resolved') {
    return {
      allowed: false,
      code: 'COMPLAINT_ALREADY_RESOLVED',
      error: 'Cannot request clarification on a resolved complaint.',
    };
  }
  return { allowed: true };
}

export function validateClarificationReply(
  complaintStatus: unknown,
  timeline: readonly Pick<ComplaintTimeline, 'entry_type'>[]
): TransitionValidationResult {
  const normalized = normalizeComplaintStatus(complaintStatus);
  if (normalized === 'Resolved') {
    return {
      allowed: false,
      code: 'COMPLAINT_ALREADY_RESOLVED',
      error: 'Cannot reply to clarification on a resolved complaint.',
    };
  }

  const state = getClarificationState(timeline);
  if (state !== 'awaiting_reply') {
    return {
      allowed: false,
      code: 'NO_ACTIVE_CLARIFICATION_REQUEST',
      error:
        state === 'replied'
          ? 'Your clarification reply has already been recorded. Wait for a follow-up inquiry from the maintenance team.'
          : 'No clarification request is currently awaiting your reply.',
    };
  }

  return { allowed: true };
}

export function getWarningState(warning: {
  admin_response?: unknown;
  responded_at?: unknown;
}): WarningState {
  const response = typeof warning.admin_response === 'string' ? warning.admin_response.trim() : '';
  const respondedAt = typeof warning.responded_at === 'string' ? warning.responded_at.trim() : '';
  return response.length > 0 || respondedAt.length > 0 ? 'responded' : 'awaiting_response';
}

export function validateWarningResponse(warningDoc: Models.Document): TransitionValidationResult {
  const state = getWarningState({
    admin_response: readStringField(warningDoc, 'admin_response'),
    responded_at: readStringField(warningDoc, 'responded_at'),
  });
  if (state === 'responded') {
    return {
      allowed: false,
      code: 'WARNING_ALREADY_RESPONDED',
      error: 'A formal response has already been recorded for this warning.',
    };
  }
  return { allowed: true };
}

export interface ProfileLockSummary {
  nameLocked: boolean;
  enrollmentLocked: boolean;
  phoneLocked: boolean;
  legacyLocked: boolean;
  anyLocked: boolean;
}

export function readProfileLockSummary(doc: Models.Document): ProfileLockSummary {
  const legacyLocked = Boolean(readBooleanField(doc, 'is_locked'));
  const phoneNumber = readStringField(doc, 'phone_number').trim();
  const explicitNameLocked = readBooleanField(doc, 'name_locked');
  const explicitEnrollmentLocked = readBooleanField(doc, 'enrollment_locked');
  const explicitPhoneLocked = readBooleanField(doc, 'phone_locked');

  const nameLocked = explicitNameLocked ?? legacyLocked;
  const enrollmentLocked = explicitEnrollmentLocked ?? legacyLocked;
  const phoneLocked =
    explicitPhoneLocked ?? Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));

  return {
    nameLocked,
    enrollmentLocked,
    phoneLocked,
    legacyLocked,
    anyLocked: nameLocked || enrollmentLocked || phoneLocked || legacyLocked,
  };
}

/**
 * Checks whether an existing profile document represents a valid completed student onboarding.
 */
export function hasCompleteStudentProfileFields(doc: Models.Document): boolean {
  const locks = readProfileLockSummary(doc);
  const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
  const phoneNumber = readStringField(doc, 'phone_number').trim();
  const rawStudentDeptId = readStringField(doc, 'student_department_id');
  const rawLegacyDeptCode = readStringField(doc, 'department_code');
  const resolvedStudentDept =
    resolveDepartment(rawStudentDeptId) ||
    (!rawStudentDeptId && enrollmentNo.length === 12
      ? resolveLegacyDepartmentCode(rawLegacyDeptCode)
      : null);

  const rawStatus = readStringField(doc, 'profile_status') as ProfileStatus | '';
  if (rawStatus === 'rejected' || rawStatus === 'pending_verification') {
    return false;
  }

  return Boolean(
    locks.nameLocked &&
      locks.enrollmentLocked &&
      locks.phoneLocked &&
      enrollmentNo.length === 12 &&
      resolvedStudentDept &&
      resolvedStudentDept.is_academic &&
      resolvedStudentDept.is_active &&
      PHONE_NUMBER_REGEX.test(phoneNumber)
  );
}

/**
 * Identifies auto-provisioned or partially revoked admin profile stubs that lack real
 * student identity credentials (enrollment_no / phone_number / academic dept) so they
 * can be cleanly unlocked and onboarded once admin privileges are revoked.
 */
export function isIncompleteLockedProfileStub(doc: Models.Document): boolean {
  const role = readStringField(doc, 'role').trim();
  if (role === 'principal') {
    return false;
  }

  const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
  const phoneNumber = readStringField(doc, 'phone_number').trim();
  const studentDeptId = readStringField(doc, 'student_department_id').trim();
  const hasRealStudentFields =
    enrollmentNo.length === 12 &&
    PHONE_NUMBER_REGEX.test(phoneNumber) &&
    isAcademicDepartment(studentDeptId);

  if (hasRealStudentFields) {
    return false;
  }

  const locks = readProfileLockSummary(doc);
  const rawStatus = readStringField(doc, 'profile_status').trim();

  return (
    role === 'department_admin' ||
    ((!enrollmentNo || !phoneNumber || !isAcademicDepartment(studentDeptId)) &&
      (locks.anyLocked || rawStatus === 'complete'))
  );
}
