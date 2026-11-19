import { ExecutionMethod } from 'appwrite';
import { functions, APPWRITE_CONFIG } from '../appwrite/client';
import { createJWT } from '../appwrite/auth';
import type {
  ApiResponse,
  Department,
  UserProfile,
  Complaint,
  ComplaintAttachmentData,
  ComplaintStatus,
  ComplaintTimeline,
  AdminMetrics,
  PhoneChangeRequest,
  ComplaintWarning,
  PrincipalDashboardData,
  DepartmentAdminAssignment,
  AuditLog,
} from '../../types';
import type {
  OnboardingInput,
  ComplaintCreateInput,
  AdminResolutionInput,
} from '../schemas';

export async function executeFunction<T>(
  action: string,
  data: Record<string, unknown> = {}
): Promise<ApiResponse<T>> {
  try {
    const jwt = await createJWT();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (jwt) {
      headers['Authorization'] = `Bearer ${jwt}`;
    }

    const payload = JSON.stringify({
      action,
      data,
      jwt: jwt || undefined,
    });

    const execution = await functions.createExecution(
      APPWRITE_CONFIG.functionId,
      payload,
      false, // synchronous execution
      '/',
      ExecutionMethod.POST,
      headers
    );

    let parsedResponse: ApiResponse<T>;
    try {
      parsedResponse = JSON.parse(execution.responseBody) as ApiResponse<T>;
    } catch {
      return {
        success: false,
        error: execution.responseBody || 'Invalid JSON response from serverless function',
        code: 'PARSE_ERROR',
      };
    }

    if (execution.responseStatusCode >= 400 || !parsedResponse.success) {
      return {
        success: false,
        error: parsedResponse.error || `Request failed with status ${execution.responseStatusCode}`,
        code: parsedResponse.code || 'FUNCTION_ERROR',
      };
    }

    return parsedResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown network failure';
    return {
      success: false,
      error: message,
      code: 'NETWORK_ERROR',
    };
  }
}

// ----------------------------------------------------
// Profile & Onboarding Operations (Phase 2)
// ----------------------------------------------------

export async function apiGetProfile(): Promise<
  ApiResponse<{ profile: UserProfile | null; is_onboarded: boolean }>
> {
  return executeFunction<{ profile: UserProfile | null; is_onboarded: boolean }>('get-profile');
}

export async function apiCompleteOnboarding(
  input: OnboardingInput
): Promise<ApiResponse<{ profile: UserProfile }>> {
  return executeFunction<{ profile: UserProfile }>('complete-onboarding', {
    name: input.name,
    enrollment_no: input.enrollment_no,
    phone_number: input.phone_number,
  });
}

export async function apiListDepartments(): Promise<ApiResponse<{ departments: Department[] }>> {
  return executeFunction<{ departments: Department[] }>('list-departments');
}

// ----------------------------------------------------
// Complaints & Visibility Operations (Day 2+)
// ----------------------------------------------------

export interface ListComplaintsParams {
  search?: string;
  status?: ComplaintStatus;
  page?: number;
  limit?: number;
}

export async function apiListComplaints(
  params: ListComplaintsParams = {}
): Promise<ApiResponse<{ complaints: Complaint[]; total: number; page: number }>> {
  return executeFunction<{ complaints: Complaint[]; total: number; page: number }>(
    'list-complaints',
    params as Record<string, unknown>
  );
}

export async function apiCreateComplaint(
  input: ComplaintCreateInput
): Promise<ApiResponse<{ complaint: Complaint }>> {
  return executeFunction<{ complaint: Complaint }>('create-complaint', {
    title: input.title,
    maintenance_department_id: input.maintenance_department_id,
    location: input.location,
    description: input.description,
    priority: input.priority,
    ...(input.department_name ? { department_name: input.department_name } : {}),
    ...(input.attachment_file_id ? { attachment_file_id: input.attachment_file_id } : {}),
  });
}

export async function apiGetComplaint(
  complaintId: string
): Promise<ApiResponse<{ complaint: Complaint; timeline: ComplaintTimeline[]; has_supported: boolean }>> {
  return executeFunction<{
    complaint: Complaint;
    timeline: ComplaintTimeline[];
    has_supported: boolean;
  }>('get-complaint', {
    complaint_id: complaintId,
  });
}

export async function apiGetComplaintAttachment(
  complaintId: string,
  fileId?: string
): Promise<ApiResponse<{ attachment: ComplaintAttachmentData }>> {
  return executeFunction<{ attachment: ComplaintAttachmentData }>('get-complaint-attachment', {
    complaint_id: complaintId,
    ...(fileId ? { file_id: fileId } : {}),
  });
}

// ----------------------------------------------------
// Support Operations (Phase 4)
// ----------------------------------------------------

export async function apiSupportComplaint(
  complaintId: string
): Promise<ApiResponse<{ support_count: number; has_supported: boolean }>> {
  return executeFunction<{ support_count: number; has_supported: boolean }>(
    'support-complaint',
    {
      complaint_id: complaintId,
    }
  );
}

export async function apiRemoveSupport(
  complaintId: string
): Promise<ApiResponse<{ support_count: number; has_supported: boolean }>> {
  return executeFunction<{ support_count: number; has_supported: boolean }>(
    'remove-support',
    {
      complaint_id: complaintId,
    }
  );
}

export async function apiGetSupportState(
  complaintId: string
): Promise<ApiResponse<{ support_count: number; has_supported: boolean }>> {
  return executeFunction<{ support_count: number; has_supported: boolean }>(
    'get-support-state',
    {
      complaint_id: complaintId,
    }
  );
}

// ----------------------------------------------------
// Clarification Operations (Day 1)
// ----------------------------------------------------

export async function apiRequestClarification(
  complaintId: string,
  question: string
): Promise<ApiResponse<{ timeline_entry: ComplaintTimeline }>> {
  return executeFunction<{ timeline_entry: ComplaintTimeline }>(
    'request-clarification',
    {
      complaint_id: complaintId,
      question,
    }
  );
}

export async function apiReplyClarification(
  complaintId: string,
  reply: string
): Promise<ApiResponse<{ timeline_entry: ComplaintTimeline }>> {
  return executeFunction<{ timeline_entry: ComplaintTimeline }>(
    'reply-clarification',
    {
      complaint_id: complaintId,
      reply,
    }
  );
}

// ----------------------------------------------------
// Admin Operations (Phase 5)
// ----------------------------------------------------

export async function apiGetAdminDashboard(): Promise<ApiResponse<{ metrics: AdminMetrics }>> {
  return executeFunction<{ metrics: AdminMetrics }>('get-admin-dashboard');
}

export interface ListAdminComplaintsParams {
  status?: ComplaintStatus;
  page?: number;
  limit?: number;
}

export async function apiListAdminComplaints(
  params: ListAdminComplaintsParams = {}
): Promise<ApiResponse<{ complaints: Complaint[]; total: number }>> {
  return executeFunction<{ complaints: Complaint[]; total: number }>(
    'list-admin-complaints',
    params as Record<string, unknown>
  );
}

export async function apiUpdateAdminComplaint(
  complaintId: string,
  input: AdminResolutionInput
): Promise<
  ApiResponse<{
    complaint: Complaint;
    timeline?: ComplaintTimeline[];
    timeline_entries?: ComplaintTimeline[];
  }>
> {
  return executeFunction<{
    complaint: Complaint;
    timeline?: ComplaintTimeline[];
    timeline_entries?: ComplaintTimeline[];
  }>('update-admin-complaint', {
    complaint_id: complaintId,
    status: input.status,
    official_response: input.official_response,
    ...(typeof input.is_substantive === 'boolean'
      ? { is_substantive: input.is_substantive }
      : {}),
    ...(input.entry_type ? { entry_type: input.entry_type } : {}),
  });
}

// ----------------------------------------------------
// Phone Change Workflow Operations (Day 2)
// ----------------------------------------------------

export interface RequestPhoneChangeInput {
  reason: string;
  requested_phone_number?: string;
}

export async function apiRequestPhoneChange(
  input: RequestPhoneChangeInput
): Promise<ApiResponse<{ request: PhoneChangeRequest }>> {
  return executeFunction<{ request: PhoneChangeRequest }>('request-phone-change', {
    reason: input.reason,
    ...(input.requested_phone_number
      ? { requested_phone_number: input.requested_phone_number }
      : {}),
  });
}

export interface ReviewPhoneChangeInput {
  request_id: string;
  decision: 'approved' | 'rejected';
  decision_reason?: string;
}

export async function apiReviewPhoneChange(
  input: ReviewPhoneChangeInput
): Promise<ApiResponse<{ request: PhoneChangeRequest }>> {
  return executeFunction<{ request: PhoneChangeRequest }>('review-phone-change', {
    request_id: input.request_id,
    decision: input.decision,
    ...(input.decision_reason ? { decision_reason: input.decision_reason } : {}),
  });
}

export interface CompletePhoneChangeInput {
  request_id: string;
  new_phone_number: string;
}

export async function apiCompletePhoneChange(
  input: CompletePhoneChangeInput
): Promise<ApiResponse<{ message: string; phone_number: string }>> {
  return executeFunction<{ message: string; phone_number: string }>(
    'complete-phone-change',
    {
      request_id: input.request_id,
      new_phone_number: input.new_phone_number,
    }
  );
}

export interface ListPhoneChangeRequestsParams {
  academic_department_id?: string;
  status?: string;
}

export async function apiListPhoneChangeRequests(
  params: ListPhoneChangeRequestsParams = {}
): Promise<ApiResponse<{ requests: PhoneChangeRequest[]; total: number }>> {
  return executeFunction<{ requests: PhoneChangeRequest[]; total: number }>(
    'list-phone-change-requests',
    params as Record<string, unknown>
  );
}

// ----------------------------------------------------
// Principal Dashboard & Governance Operations (Day 2)
// ----------------------------------------------------

export async function apiGetPrincipalDashboard(): Promise<
  ApiResponse<PrincipalDashboardData>
> {
  return executeFunction<PrincipalDashboardData>('get-principal-dashboard');
}

export interface IssueWarningInput {
  complaint_id: string;
  warning_reason: string;
}

export async function apiIssueWarning(
  input: IssueWarningInput
): Promise<ApiResponse<{ warning: ComplaintWarning }>> {
  return executeFunction<{ warning: ComplaintWarning }>('issue-warning', {
    complaint_id: input.complaint_id,
    warning_reason: input.warning_reason,
  });
}

export interface RespondToWarningInput {
  warning_id: string;
  admin_response: string;
}

export async function apiRespondToWarning(
  input: RespondToWarningInput
): Promise<ApiResponse<{ warning: ComplaintWarning }>> {
  return executeFunction<{ warning: ComplaintWarning }>('respond-to-warning', {
    warning_id: input.warning_id,
    admin_response: input.admin_response,
  });
}

// ----------------------------------------------------
// Admin Assignment & Governance Operations (Day 6)
// ----------------------------------------------------

export interface AssignAdminInput {
  email: string;
  department_id: string;
  scope: 'academic' | 'maintenance';
  user_id?: string;
}

export async function apiListAdminAssignments(): Promise<
  ApiResponse<{ assignments: DepartmentAdminAssignment[]; total: number }>
> {
  return executeFunction<{ assignments: DepartmentAdminAssignment[]; total: number }>(
    'list-admin-assignments'
  );
}

export async function apiAssignAdmin(
  input: AssignAdminInput
): Promise<ApiResponse<{ assignment: DepartmentAdminAssignment }>> {
  return executeFunction<{ assignment: DepartmentAdminAssignment }>('assign-admin', {
    email: input.email,
    department_id: input.department_id,
    scope: input.scope,
    ...(input.user_id ? { user_id: input.user_id } : {}),
  });
}

export async function apiRevokeAdmin(
  assignment_id: string
): Promise<ApiResponse<{ assignment: DepartmentAdminAssignment }>> {
  return executeFunction<{ assignment: DepartmentAdminAssignment }>('revoke-admin', {
    assignment_id,
  });
}

// ----------------------------------------------------
// System Audit Trail Operations (Day 6)
// ----------------------------------------------------

export interface GetAuditHistoryParams {
  action?: string;
  actor_id?: string;
  target_resource_id?: string;
  limit?: number;
}

export async function apiGetAuditHistory(
  params: GetAuditHistoryParams = {}
): Promise<ApiResponse<{ audit_logs: AuditLog[]; total: number }>> {
  return executeFunction<{ audit_logs: AuditLog[]; total: number }>(
    'get-audit-history',
    params as Record<string, unknown>
  );
}
