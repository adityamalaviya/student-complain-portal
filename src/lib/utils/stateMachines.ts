import type {
  AdminScope,
  CanonicalComplaintStatus,
  ClarificationState,
  ComplaintStatus,
  ComplaintTimeline,
  ComplaintWarning,
  DepartmentAdminAssignment,
  PhoneChangeRequest,
  PhoneChangeWorkflowState,
  UserProfile,
  WarningState,
} from '../../types';

const ACADEMIC_DEPARTMENT_IDS = new Set([
  'dept_civil',
  'dept_comp',
  'dept_elec',
  'dept_mech',
]);

const MAINTENANCE_DEPARTMENT_IDS = new Set([
  'dept_civil',
  'dept_comp',
  'dept_elec',
  'dept_mech',
  'dept_water',
  'dept_sanit',
]);

function isCanonicalAcademicDept(departmentId?: string | null): boolean {
  return Boolean(departmentId && ACADEMIC_DEPARTMENT_IDS.has(departmentId.trim()));
}

function isCanonicalMaintenanceDept(departmentId?: string | null): boolean {
  return Boolean(departmentId && MAINTENANCE_DEPARTMENT_IDS.has(departmentId.trim()));
}

export const PHONE_NUMBER_REGEX = /^[6-9]\d{9}$/;
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const MIME_TO_EXTENSIONS: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

export type RouteAccessRequirement =
  | 'guest_or_redirect'
  | 'onboarding'
  | 'student'
  | 'admin'
  | 'principal'
  | 'authenticated';

export interface AuthGuardSnapshot {
  userPresent: boolean;
  profile: UserProfile | null;
  isOnboarded: boolean;
  isAdmin: boolean;
  isPrincipal: boolean;
  hasError?: boolean;
}

/**
 * Normalizes legacy and canonical complaint status strings into the 3-state model.
 */
export function normalizeComplaintStatus(
  status?: ComplaintStatus | string | null
): CanonicalComplaintStatus | null {
  if (!status || typeof status !== 'string') return null;
  const s = status.trim().toLowerCase();
  if (s === 'pending' || s === 'open') return 'Pending';
  if (s === 'in progress' || s === 'in_progress') return 'In Progress';
  if (s === 'resolved') return 'Resolved';
  return null;
}

/**
 * Frontend parity check with backend validateComplaintStatusTransition:
 * - Pending -> Pending | In Progress | Resolved
 * - In Progress -> In Progress | Resolved
 * - Resolved -> Resolved (post-resolution follow-up notes only; never reopen to In Progress or Pending)
 */
export function canSelectComplaintStatus(
  currentStatus: ComplaintStatus | string | null | undefined,
  targetStatus: CanonicalComplaintStatus
): boolean {
  const current = normalizeComplaintStatus(currentStatus) ?? 'Pending';
  if (current !== 'Pending' && targetStatus === 'Pending') {
    return false;
  }
  if (current === 'Resolved' && targetStatus === 'In Progress') {
    return false;
  }
  return true;
}

/**
 * Derives turn-based clarification state from chronological timeline entries:
 * - 'none': no clarification requested yet
 * - 'awaiting_reply': latest clarification event is an unanswered request
 * - 'replied': creator has submitted a clarification reply after the latest request
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

export function getWarningState(
  warning: Pick<ComplaintWarning, 'admin_response' | 'responded_at'>
): WarningState {
  if (warning.admin_response?.trim() || warning.responded_at?.trim()) {
    return 'responded';
  }
  return 'awaiting_response';
}

export function getPhoneChangeWorkflowState(
  latestRequest: PhoneChangeRequest | null | undefined,
  forceNewRequest = false
): PhoneChangeWorkflowState {
  if (!latestRequest) {
    return 'no_active_request';
  }
  if (latestRequest.status === 'pending') {
    return 'pending_review';
  }
  if (latestRequest.status === 'approved' && latestRequest.permission_consumed !== true) {
    return 'approved_ready';
  }
  if (latestRequest.status === 'rejected' && !forceNewRequest) {
    return 'rejected';
  }
  return 'no_active_request';
}

export function isProfileOnboarded(profile: UserProfile | null | undefined): boolean {
  if (!profile) {
    return false;
  }
  if (profile.role === 'principal' || profile.role === 'department_admin') {
    return true;
  }
  if (profile.profile_status === 'rejected' || profile.profile_status === 'pending_verification') {
    return false;
  }
  if (typeof profile.is_onboarded === 'boolean') {
    return profile.is_onboarded;
  }

  const legacyLocked = Boolean(profile.is_locked);
  const nameLocked = Boolean(profile.name_locked ?? legacyLocked);
  const enrollmentLocked = Boolean(profile.enrollment_locked ?? legacyLocked);
  const phoneLocked = Boolean(profile.phone_locked ?? legacyLocked);
  const enrollment = (profile.enrollment_no || '').trim();
  const phone = (profile.phone_number || '').trim();
  const deptId = profile.student_department_id || null;

  return Boolean(
    nameLocked &&
      enrollmentLocked &&
      phoneLocked &&
      enrollment.length === 12 &&
      isCanonicalAcademicDept(deptId) &&
      PHONE_NUMBER_REGEX.test(phone)
  );
}

export function hasScopeAccess(
  assignments: readonly DepartmentAdminAssignment[] | undefined,
  scope: AdminScope,
  fallbackDeptId?: string | null
): boolean {
  if (Array.isArray(assignments) && assignments.length > 0) {
    return assignments.some((a) => {
      if (a.is_active !== true || a.scope !== scope) {
        return false;
      }
      return scope === 'academic'
        ? isCanonicalAcademicDept(a.department_id)
        : isCanonicalMaintenanceDept(a.department_id);
    });
  }

  if (scope === 'academic') {
    return isCanonicalAcademicDept(fallbackDeptId);
  }
  return isCanonicalMaintenanceDept(fallbackDeptId);
}

export function validateAttachmentFile(file: {
  name: string;
  size: number;
  type: string;
}): { valid: boolean; error?: string } {
  if (file.size <= 0) {
    return { valid: false, error: 'Selected attachment file is empty.' };
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { valid: false, error: 'Attachment file size must not exceed 5 MB.' };
  }
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return {
      valid: false,
      error: 'Unsupported file type. Only PDF, JPG, and PNG attachments are allowed.',
    };
  }

  const dotIdx = file.name.lastIndexOf('.');
  const ext = dotIdx >= 0 ? file.name.slice(dotIdx + 1).trim().toLowerCase() : '';
  const allowedExts = MIME_TO_EXTENSIONS[file.type] ?? [];
  if (!ext || !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `File extension '.${ext || 'unknown'}' does not match declared MIME type '${file.type}'.`,
    };
  }

  return { valid: true };
}

export function resolveAuthenticatedHomeRoute(
  snapshot: Pick<AuthGuardSnapshot, 'isPrincipal' | 'isAdmin' | 'isOnboarded'>
): '/principal' | '/admin' | '/dashboard' | '/onboarding' {
  if (snapshot.isPrincipal) {
    return '/principal';
  }
  if (snapshot.isAdmin) {
    return '/admin';
  }
  if (snapshot.isOnboarded) {
    return '/dashboard';
  }
  return '/onboarding';
}

export function resolveRouteGuardRedirect(
  requirement: RouteAccessRequirement,
  snapshot: AuthGuardSnapshot
): string | null {
  if (!snapshot.userPresent) {
    return requirement === 'guest_or_redirect' ? null : '/sign-in';
  }

  // Avoid misrouting signed-in users away on transient profile fetch failures.
  if (snapshot.hasError && !snapshot.profile) {
    return null;
  }

  const homeRoute = resolveAuthenticatedHomeRoute(snapshot);

  switch (requirement) {
    case 'guest_or_redirect':
      return homeRoute;
    case 'onboarding':
      return homeRoute === '/onboarding' ? null : homeRoute;
    case 'student':
      if (snapshot.isPrincipal) return '/principal';
      if (snapshot.isAdmin) return '/admin';
      if (!snapshot.isOnboarded) return '/onboarding';
      return null;
    case 'admin':
      return snapshot.isAdmin ? null : homeRoute;
    case 'principal':
      return snapshot.isPrincipal ? null : homeRoute;
    case 'authenticated':
      if (!snapshot.isPrincipal && !snapshot.isAdmin && !snapshot.isOnboarded) {
        return '/onboarding';
      }
      return null;
  }
}

export type AdminAssignmentScopeDisplay = AdminScope | 'both';

export interface GroupedAdminAssignment {
  key: string;
  email: string;
  department_id: string;
  is_active: boolean;
  scopeDisplay: AdminAssignmentScopeDisplay;
  created_at: string;
  assignments: DepartmentAdminAssignment[];
}

/**
 * Groups administrator assignment rows sharing the same email, department, and
 * active state so an admin holding both Academic and Maintenance scopes in a
 * department is displayed as a single combined row.
 */
export function groupAdminAssignments(
  assignments: readonly DepartmentAdminAssignment[]
): GroupedAdminAssignment[] {
  const groups = new Map<string, GroupedAdminAssignment>();

  for (const assignment of assignments) {
    const normalizedEmail = assignment.email.trim().toLowerCase();
    const statusKey = assignment.is_active ? 'active' : 'revoked';
    const key = `${normalizedEmail}::${assignment.department_id}::${statusKey}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        email: assignment.email,
        department_id: assignment.department_id,
        is_active: assignment.is_active,
        scopeDisplay: assignment.scope,
        created_at: assignment.created_at,
        assignments: [assignment],
      });
      continue;
    }

    existing.assignments.push(assignment);

    const hasAcademic = existing.assignments.some((a) => a.scope === 'academic');
    const hasMaintenance = existing.assignments.some((a) => a.scope === 'maintenance');
    existing.scopeDisplay =
      hasAcademic && hasMaintenance ? 'both' : assignment.scope;

    const existingTime = Date.parse(existing.created_at);
    const candidateTime = Date.parse(assignment.created_at);
    if (
      !Number.isNaN(candidateTime) &&
      (Number.isNaN(existingTime) || candidateTime > existingTime)
    ) {
      existing.created_at = assignment.created_at;
    }
  }

  return Array.from(groups.values());
}
