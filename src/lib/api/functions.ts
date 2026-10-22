import { ExecutionMethod } from 'appwrite';
import { functions, APPWRITE_CONFIG } from '../appwrite/client';
import { createJWT } from '../appwrite/auth';
import type { ApiResponse, Department, UserProfile } from '../../types';
import type { OnboardingInput } from '../schemas';

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
      headers['x-appwrite-jwt'] = jwt;
    }

    const payload = JSON.stringify({ action, data });

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

export async function apiGetProfile(): Promise<ApiResponse<{ profile: UserProfile | null; is_onboarded: boolean }>> {
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
