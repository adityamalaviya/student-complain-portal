import { verifyCaller } from './auth.js';
import { handleGetProfile, handleCompleteOnboarding, handleListDepartments, } from './handlers/profile.js';
export default async function main(context) {
    const { req, res, log } = context;
    log(`[campusvoice-api] Incoming execution: ${req.method} ${req.path}`);
    // Safe CORS header inspection (Appwrite Function responses or standard triggers)
    if (req.method === 'OPTIONS') {
        return res.empty();
    }
    // Parse payload safely
    let payload = {};
    if (typeof req.body === 'string') {
        try {
            payload = req.body.trim().length > 0 ? JSON.parse(req.body) : {};
        }
        catch {
            payload = {};
        }
    }
    else if (req.body && typeof req.body === 'object') {
        payload = req.body;
    }
    const action = payload.action || req.headers['x-action'] || 'health';
    const data = payload.data || payload;
    // Unprotected / Public Actions
    if (action === 'health') {
        return res.json({
            success: true,
            service: 'campusvoice-api',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            active_departments: [
                { code: '06', name: 'Civil Department' },
                { code: '07', name: 'Computer Department' },
            ],
        }, 200);
    }
    if (action === 'list-departments') {
        return handleListDepartments(context);
    }
    // Protected Actions requiring verified caller
    const { caller, error: authError, statusCode } = await verifyCaller(context);
    if (!caller) {
        return res.json({
            success: false,
            error: authError || 'Unauthorized',
            code: 'UNAUTHORIZED',
        }, statusCode || 401);
    }
    switch (action) {
        case 'get-profile':
            return handleGetProfile(context, caller);
        case 'complete-onboarding':
            return handleCompleteOnboarding(context, caller, data);
        default:
            return res.json({
                success: false,
                error: `Action '${action}' is not supported.`,
                code: 'INVALID_ACTION',
            }, 400);
    }
}
