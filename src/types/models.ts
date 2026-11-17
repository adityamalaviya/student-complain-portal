/**
 * CampusVoice — Authoritative Domain Models (Day 1: Domain & Database Foundation)
 * 
 * Strict TypeScript types with zero 'any'.
 * Aligns with Authoritative Product Rules (effective 10 November 2026):
 * - Exactly 6 departments (4 dual academic/maintenance, 2 maintenance-only)
 * - Strict separation of student_department_id and maintenance_department_id
 * - Exactly 3 primary roles: student, department_admin, principal (No super_admin)
 * - Base-1 support count with active/revoked support lifecycle
 * - Immutable complaints with discrete timeline records
 * - Auditable dynamic administrative assignments with explicit scope
 */

// ==========================================
// Department & Role Definitions
// ==========================================

export type AcademicDepartmentId =
  | 'dept_civil'
  | 'dept_comp'
  | 'dept_elec'
  | 'dept_mech';

export type MaintenanceOnlyDepartmentId = 'dept_water' | 'dept_sanit';

export type DepartmentId = AcademicDepartmentId | MaintenanceOnlyDepartmentId;

export type MaintenanceDepartmentId = DepartmentId;

export interface EnrollmentMapping {
  enrollment_code: string;
  department_id: AcademicDepartmentId;
  confirmed: boolean;
}

export type UserRole = 'student' | 'department_admin' | 'principal';

export type AdminScope = 'academic' | 'maintenance';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type ComplaintStatus = 'Pending' | 'In Progress' | 'Resolved' | 'open' | 'in_progress' | 'resolved';

export type SupportStatus = 'active' | 'revoked';

export type TimelineEntryType =
  | 'status_change'
  | 'progress_update'
  | 'clarification_request'
  | 'clarification_reply'
  | 'admin_response';

export type PhoneChangeStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export type ProfileStatus = 'incomplete' | 'pending_verification' | 'complete' | 'rejected';

// Legacy compatibility type (deprecated - public complaints removed)
export type IssueType = 'department' | 'public';

// ==========================================
// Domain Entities
// ==========================================

export interface Department {
  $id: DepartmentId;
  name: string;
  is_academic: boolean;
  is_maintenance: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface UserProfile {
  $id?: string;
  user_id: string;
  auth_user_id?: string;
  email?: string;
  name: string;
  display_name?: string;
  enrollment_no: string;
  student_department_id?: AcademicDepartmentId | null;
  department_id?: DepartmentId | null;
  phone_number?: string;
  role: UserRole;
  profile_status?: ProfileStatus;
  name_locked: boolean;
  enrollment_locked: boolean;
  phone_locked: boolean;
  is_locked?: boolean; // Legacy fallback
  department_name?: string;
  created_at: string;
  updated_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface Complaint {
  $id: string;
  student_user_id?: string;
  student_name?: string;
  student_enrollment_no?: string;
  student_phone_number?: string;
  student_department_id: string;
  maintenance_department_id: string;
  title: string;
  location: string;
  description: string;
  priority: PriorityLevel;
  status: ComplaintStatus;
  support_count: number;
  last_meaningful_update_at?: string;
  attachment_file_id?: string;
  attachment_url?: string;
  is_own_complaint?: boolean;
  is_delayed?: boolean;
  // Legacy compatibility fields during migration
  department_name?: string;
  issue_type?: IssueType;
  official_response?: string;
  resolved_at?: string;
  created_at?: string;
  updated_at?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface ComplaintAttachmentData {
  file_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  content_base64: string;
}

export interface ComplaintSupport {
  $id: string;
  complaint_id: string;
  user_id: string;
  status: SupportStatus;
  created_at: string;
  supported_at?: string; // Legacy fallback
  revoked_at?: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface ComplaintTimeline {
  $id: string;
  complaint_id: string;
  author_id?: string;
  author_role: UserRole;
  author_label?: string;
  entry_type: TimelineEntryType;
  content: string;
  old_status?: ComplaintStatus;
  new_status?: ComplaintStatus;
  created_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface PhoneChangeRequest {
  $id: string;
  student_user_id: string;
  student_name?: string;
  academic_department_id: string;
  old_phone_number: string;
  requested_phone_number?: string;
  reason: string;
  status: PhoneChangeStatus;
  reviewed_by?: string;
  decision_reason?: string;
  permission_consumed: boolean;
  requested_at?: string;
  created_at: string;
  updated_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface ComplaintWarning {
  $id: string;
  complaint_id: string;
  issued_by_principal_id: string;
  warning_reason: string;
  days_delayed: number;
  admin_response?: string;
  responded_at?: string;
  created_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface DepartmentAdminAssignment {
  $id: string;
  user_id: string;
  email: string;
  department_id: string;
  scope: AdminScope;
  is_active: boolean;
  assigned_by: string;
  created_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

export interface AuditLog {
  $id: string;
  action: string;
  actor_id: string;
  actor_role: UserRole | 'system';
  target_resource_id: string;
  target_resource_type: string;
  details: string; // JSON serialized
  created_at: string;
  $createdAt?: string;
  $updatedAt?: string;
}

// ==========================================
// Operational & Metric Interfaces
// ==========================================

export interface AdminMetrics {
  total_open: number;
  total_in_progress: number;
  total_resolved: number;
  department_id?: DepartmentId;
}

export interface PrincipalMetrics {
  total_complaints: number;
  total_pending: number;
  total_in_progress: number;
  total_resolved: number;
  total_delayed: number;
  total_warnings_issued: number;
  department_breakdown: Record<string, {
    total: number;
    pending: number;
    in_progress: number;
    resolved: number;
    delayed: number;
  }>;
}

export interface PrincipalDelayedComplaint {
  complaint: Complaint;
  days_delayed: number;
  warning_count: number;
  warnings: ComplaintWarning[];
  is_warning_eligible: boolean;
}

export interface PrincipalDashboardData {
  metrics: PrincipalMetrics;
  delayed_complaints: PrincipalDelayedComplaint[];
  recent_complaints: Complaint[];
  recent_warnings: ComplaintWarning[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
