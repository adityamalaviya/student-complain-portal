/**
 * CampusVoice — Backend Appwrite Cloud Function Domain Types (Day 1)
 * 
 * Strict TypeScript types with zero 'any'.
 * Aligns with Authoritative Product Rules (effective 10 November 2026).
 */

export type DepartmentCode = '06' | '07' | string;

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

export type IssueType = 'department' | 'public';

export interface Department {
  $id?: string;
  code: string;
  name: string;
  is_academic: boolean;
  is_maintenance: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  $id?: string;
  user_id: string;
  auth_user_id?: string;
  email?: string;
  name: string;
  display_name?: string;
  enrollment_no: string;
  student_department_id?: string | null;
  phone_number?: string;
  role: UserRole;
  profile_status?: ProfileStatus;
  name_locked: boolean;
  enrollment_locked: boolean;
  phone_locked: boolean;
  is_locked?: boolean;
  department_code?: DepartmentCode;
  department_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  $id?: string;
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
  is_own_complaint?: boolean;
  department_code?: DepartmentCode;
  department_name?: string;
  issue_type?: IssueType;
  official_response?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
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
  supported_at?: string;
  revoked_at?: string;
}

export interface ComplaintTimeline {
  $id?: string;
  complaint_id: string;
  author_id: string;
  author_role: UserRole;
  entry_type: TimelineEntryType;
  content: string;
  old_status?: ComplaintStatus;
  new_status?: ComplaintStatus;
  created_at: string;
}

export interface PhoneChangeRequest {
  $id?: string;
  student_user_id: string;
  academic_department_id: string;
  old_phone_number: string;
  requested_phone_number?: string;
  reason: string;
  status: PhoneChangeStatus;
  reviewed_by?: string;
  decision_reason?: string;
  permission_consumed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplaintWarning {
  $id?: string;
  complaint_id: string;
  issued_by_principal_id: string;
  warning_reason: string;
  days_delayed: number;
  admin_response?: string;
  responded_at?: string;
  created_at: string;
}

export interface DepartmentAdminAssignment {
  $id?: string;
  user_id: string;
  email: string;
  department_id: string;
  scope: AdminScope;
  is_active: boolean;
  assigned_by: string;
  created_at: string;
}

export interface AuditLog {
  $id?: string;
  action: string;
  actor_id: string;
  actor_role: UserRole | 'system';
  target_resource_id: string;
  target_resource_type: string;
  details: string;
  created_at: string;
}

export interface AdminMetrics {
  total_open: number;
  total_in_progress: number;
  total_resolved: number;
  department_id?: string;
  department_code?: DepartmentCode;
}

export interface AuthenticatedCaller {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  student_department_id?: string | null;
  admin_assignments?: DepartmentAdminAssignment[];
  department_code: DepartmentCode | null;
  department_name: string | null;
}

export interface AppwriteContext {
  req: {
    body: string | Record<string, unknown>;
    headers: Record<string, string>;
    method: string;
    url: string;
    path: string;
  };
  res: {
    json: (data: Record<string, unknown>, statusCode?: number) => unknown;
    empty: () => unknown;
  };
  log: (message: unknown) => void;
  error: (message: unknown) => void;
}
