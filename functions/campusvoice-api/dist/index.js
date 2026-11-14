import { verifyCaller } from './auth.js';
import { INSTITUTIONAL_DEPARTMENTS, toDepartmentModel } from './departments.js';
import { handleGetProfile, handleCompleteOnboarding, handleListDepartments, } from './handlers/profile.js';
import { handleCreateComplaint, handleListComplaints, handleGetComplaint, handleGetComplaintAttachment, handleSupportComplaint, handleRemoveSupport, handleGetSupportState, handleGetAdminDashboard, handleListAdminComplaints, handleUpdateAdminComplaint, handleRequestClarification, handleReplyClarification, } from './handlers/complaints.js';
import { handleRequestPhoneChange, handleReviewPhoneChange, handleCompletePhoneChange, handleListPhoneChangeRequests, } from './handlers/phoneChange.js';
import { handleGetPrincipalDashboard, handleIssueWarning, handleRespondToWarning, } from './handlers/principal.js';
export default async function main(context, deps) {
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
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            active_departments: INSTITUTIONAL_DEPARTMENTS.map(toDepartmentModel),
        }, 200);
    }
    if (action === 'list-departments') {
        return handleListDepartments(context);
    }
    // Protected Actions requiring verified caller
    const verify = deps?.verifyCaller ?? verifyCaller;
    let authResult;
    try {
        authResult = await verify(context, payload, deps?.authDeps);
    }
    catch (err) {
        context.error(`[campusvoice-api] Caller verification threw: ${String(err)}`);
        return res.json({
            success: false,
            error: 'Authentication verification is temporarily unavailable.',
            code: 'INTERNAL_ERROR',
        }, 500);
    }
    if (!authResult.caller) {
        const resolvedStatus = authResult.statusCode || 401;
        const isServerError = resolvedStatus >= 500;
        return res.json({
            success: false,
            error: isServerError
                ? 'Authentication verification is temporarily unavailable.'
                : authResult.error || 'Unauthorized',
            code: isServerError ? 'INTERNAL_ERROR' : 'UNAUTHORIZED',
        }, resolvedStatus);
    }
    const caller = authResult.caller;
    switch (action) {
        case 'get-profile':
            return handleGetProfile(context, caller, deps?.profileDeps);
        case 'complete-onboarding':
            return handleCompleteOnboarding(context, caller, data, deps?.profileDeps);
        case 'create-complaint':
            return handleCreateComplaint(context, caller, data, deps?.complaintDeps);
        case 'list-complaints':
            return handleListComplaints(context, caller, data, deps?.complaintDeps);
        case 'get-complaint':
            return handleGetComplaint(context, caller, data, deps?.complaintDeps);
        case 'get-complaint-attachment':
            return handleGetComplaintAttachment(context, caller, data, deps?.complaintDeps);
        case 'support-complaint':
            return handleSupportComplaint(context, caller, data, deps?.complaintDeps);
        case 'remove-support':
            return handleRemoveSupport(context, caller, data, deps?.complaintDeps);
        case 'get-support-state':
            return handleGetSupportState(context, caller, data, deps?.complaintDeps);
        case 'request-clarification':
            return handleRequestClarification(context, caller, data, deps?.complaintDeps);
        case 'reply-clarification':
            return handleReplyClarification(context, caller, data, deps?.complaintDeps);
        case 'get-admin-dashboard':
            return handleGetAdminDashboard(context, caller, deps?.complaintDeps);
        case 'list-admin-complaints':
            return handleListAdminComplaints(context, caller, data, deps?.complaintDeps);
        case 'update-admin-complaint':
            return handleUpdateAdminComplaint(context, caller, data, deps?.complaintDeps);
        case 'request-phone-change':
            return handleRequestPhoneChange(context, caller, data, deps?.phoneChangeDeps);
        case 'review-phone-change':
            return handleReviewPhoneChange(context, caller, data, deps?.phoneChangeDeps);
        case 'complete-phone-change':
            return handleCompletePhoneChange(context, caller, data, deps?.phoneChangeDeps);
        case 'list-phone-change-requests':
            return handleListPhoneChangeRequests(context, caller, data, deps?.phoneChangeDeps);
        case 'get-principal-dashboard':
            return handleGetPrincipalDashboard(context, caller, deps?.principalDeps);
        case 'issue-warning':
            return handleIssueWarning(context, caller, data, deps?.principalDeps);
        case 'respond-to-warning':
            return handleRespondToWarning(context, caller, data, deps?.principalDeps);
        default:
            return res.json({
                success: false,
                error: `Action '${action}' is not supported.`,
                code: 'INVALID_ACTION',
            }, 400);
    }
}
