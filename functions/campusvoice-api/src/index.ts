import { verifyCaller } from './auth.js';
import {
  handleGetProfile,
  handleCompleteOnboarding,
  handleListDepartments,
} from './handlers/profile.js';
import {
  handleCreateComplaint,
  handleListComplaints,
  handleGetComplaint,
  handleSupportComplaint,
  handleGetSupportState,
  handleGetAdminDashboard,
  handleListAdminComplaints,
  handleUpdateAdminComplaint,
} from './handlers/complaints.js';
import type { AppwriteContext } from './types.js';

export default async function main(context: AppwriteContext): Promise<unknown> {
  const { req, res, log } = context;

  log(`[campusvoice-api] Incoming execution: ${req.method} ${req.path}`);

  // Safe CORS header inspection (Appwrite Function responses or standard triggers)
  if (req.method === 'OPTIONS') {
    return res.empty();
  }

  // Parse payload safely
  let payload: Record<string, unknown> = {};
  if (typeof req.body === 'string') {
    try {
      payload = req.body.trim().length > 0 ? (JSON.parse(req.body) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
  } else if (req.body && typeof req.body === 'object') {
    payload = req.body;
  }

  const action = (payload.action as string) || (req.headers['x-action'] as string) || 'health';
  const data = (payload.data as Record<string, unknown>) || payload;

  // Unprotected / Public Actions
  if (action === 'health') {
    return res.json(
      {
        success: true,
        service: 'campusvoice-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        active_departments: [
          { code: '06', name: 'Civil Department' },
          { code: '07', name: 'Computer Department' },
        ],
      },
      200
    );
  }

  if (action === 'list-departments') {
    return handleListDepartments(context);
  }

  // Protected Actions requiring verified caller
  const { caller, error: authError, statusCode } = await verifyCaller(context, payload);
  if (!caller) {
    return res.json(
      {
        success: false,
        error: authError || 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
      statusCode || 401
    );
  }

  switch (action) {
    case 'get-profile':
      return handleGetProfile(context, caller);

    case 'complete-onboarding':
      return handleCompleteOnboarding(context, caller, data);

    case 'create-complaint':
      return handleCreateComplaint(context, caller, data);

    case 'list-complaints':
      return handleListComplaints(context, caller, data);

    case 'get-complaint':
      return handleGetComplaint(context, caller, data);

    case 'support-complaint':
      return handleSupportComplaint(context, caller, data);

    case 'get-support-state':
      return handleGetSupportState(context, caller, data);

    case 'get-admin-dashboard':
      return handleGetAdminDashboard(context, caller);

    case 'list-admin-complaints':
      return handleListAdminComplaints(context, caller, data);

    case 'update-admin-complaint':
      return handleUpdateAdminComplaint(context, caller, data);

    default:
      return res.json(
        {
          success: false,
          error: `Action '${action}' is not supported.`,
          code: 'INVALID_ACTION',
        },
        400
      );
  }
}
