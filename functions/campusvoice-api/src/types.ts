export type DepartmentCode = '06' | '07';

export type UserRole = 'student' | 'department_admin';

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
