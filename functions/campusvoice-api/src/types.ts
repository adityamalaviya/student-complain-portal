export type DepartmentCode = '06' | '07';

export type UserRole = 'student' | 'department_admin';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type IssueType = 'department' | 'public';

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface UserProfile {
  $id?: string;
  user_id: string;
  auth_user_id?: string;
  email?: string;
  name: string;
  display_name?: string;
  enrollment_no: string;
  department_code: DepartmentCode;
  department_name: string;
  role: UserRole;
  is_locked: boolean;
  profile_status?: 'incomplete' | 'pending_verification' | 'complete' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Department {
  code: DepartmentCode;
  name: string;
  is_active: boolean;
}

export interface Complaint {
  $id?: string;
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
  created_at: string;
  updated_at: string;
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

export interface AuthenticatedCaller {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
