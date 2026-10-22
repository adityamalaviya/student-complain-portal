export type DepartmentCode = '06' | '07';

export type UserRole = 'student' | 'department_admin';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type IssueType = 'department' | 'public';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface Department {
  $id: string;
  code: DepartmentCode;
  name: string;
  is_active: boolean;
}

export interface UserProfile {
  $id: string;
  user_id: string;
  name: string;
  enrollment_no: string;
  department_code: DepartmentCode;
  department_name: string;
  role: UserRole;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  $id: string;
  student_user_id: string;
  student_name: string;
  student_enrollment_no: string;
  department_code: DepartmentCode;
  department_name: string;
  title: string;
  location: string;
  description: string;
  priority: PriorityLevel;
  issue_type: IssueType;
  status: ComplaintStatus;
  official_response?: string;
  resolved_at?: string;
  support_count: number;
  attachment_file_id?: string;
  attachment_url?: string;
  $createdAt: string;
  $updatedAt: string;
}

export interface ComplaintSupport {
  $id: string;
  complaint_id: string;
  user_id: string;
  supported_at: string;
}

export interface AdminMetrics {
  total_open: number;
  total_in_progress: number;
  total_resolved: number;
  department_code: DepartmentCode;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
