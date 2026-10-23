import { ExecutionMethod } from 'appwrite';
import { functions, APPWRITE_CONFIG } from '../appwrite/client';
import { createJWT } from '../appwrite/auth';
import type {
  ApiResponse,
  Department,
  UserProfile,
  Complaint,
  ComplaintStatus,
  AdminMetrics,
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
  });
}

export async function apiListDepartments(): Promise<ApiResponse<{ departments: Department[] }>> {
  return executeFunction<{ departments: Department[] }>('list-departments');
}

// ----------------------------------------------------
// Complaints & Visibility Operations (Phase 3)
// ----------------------------------------------------

export interface ListComplaintsParams {
  feed_type?: 'department' | 'public';
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
  return executeFunction<{ complaint: Complaint }>(
    'create-complaint',
    input as Record<string, unknown>
  );
}

export async function apiGetComplaint(
  complaintId: string
): Promise<ApiResponse<{ complaint: Complaint; has_supported: boolean }>> {
  return executeFunction<{ complaint: Complaint; has_supported: boolean }>('get-complaint', {
    complaint_id: complaintId,
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
): Promise<ApiResponse<{ complaint: Complaint }>> {
  return executeFunction<{ complaint: Complaint }>('update-admin-complaint', {
    complaint_id: complaintId,
    status: input.status,
    official_response: input.official_response,
  });
}
