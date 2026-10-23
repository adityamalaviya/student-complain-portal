import crypto from 'crypto';
import { ID, Query } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import type {
  AdminMetrics,
  AppwriteContext,
  AuthenticatedCaller,
  Complaint,
  ComplaintStatus,
  IssueType,
  PriorityLevel,
  UserProfile,
} from '../types.js';

// Helper to fetch caller profile from database
async function getCallerProfile(
  userId: string,
  databaseId: string,
  profilesCollectionId: string
): Promise<UserProfile | null> {
  const { databases } = getServerClient();
  const res = await databases.listDocuments(databaseId, profilesCollectionId, [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]);

  if (res.total === 0 || !res.documents[0]) {
    return null;
  }

  const doc = res.documents[0];
  return {
    $id: doc.$id,
    user_id: (doc.user_id as string) || userId,
    auth_user_id: (doc.auth_user_id as string) || userId,
    email: doc.email as string,
    name: (doc.name as string) || '',
    enrollment_no: (doc.enrollment_no as string) || '',
    department_code: doc.department_code as '06' | '07',
    department_name: (doc.department_name as string) || '',
    role: (doc.role as 'student' | 'department_admin') || 'student',
    is_locked: Boolean(doc.is_locked),
    created_at: (doc.created_at as string) || doc.$createdAt,
    updated_at: (doc.updated_at as string) || doc.$updatedAt,
  };
}

// ----------------------------------------------------
// 1. Create Complaint (Operation 5)
// ----------------------------------------------------
export async function handleCreateComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, log, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  try {
    // 1. Fetch caller's verified profile
    const profile = await getCallerProfile(
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (!profile || !profile.is_locked || !profile.enrollment_no) {
      return res.json(
        {
          success: false,
          error: 'Student profile must be complete and verified before raising complaints.',
          code: 'PROFILE_INCOMPLETE',
        },
        400
      );
    }

    // 2. Validate user input fields
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const location = typeof data.location === 'string' ? data.location.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const priority = data.priority as PriorityLevel;
    const issueType = data.issue_type as IssueType;
    const attachmentFileId =
      typeof data.attachment_file_id === 'string' && data.attachment_file_id.trim().length > 0
        ? data.attachment_file_id.trim()
        : undefined;

    if (title.length < 5 || title.length > 150) {
      return res.json(
        {
          success: false,
          error: 'Complaint title must be between 5 and 150 characters.',
          code: 'INVALID_TITLE',
        },
        400
      );
    }

    if (location.length < 3 || location.length > 100) {
      return res.json(
        {
          success: false,
          error: 'Location must be between 3 and 100 characters.',
          code: 'INVALID_LOCATION',
        },
        400
      );
    }

    if (description.length < 10 || description.length > 2000) {
      return res.json(
        {
          success: false,
          error: 'Description must be between 10 and 2000 characters.',
          code: 'INVALID_DESCRIPTION',
        },
        400
      );
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.json(
        {
          success: false,
          error: "Priority must be 'low', 'medium', or 'high'.",
          code: 'INVALID_PRIORITY',
        },
        400
      );
    }

    if (!['department', 'public'].includes(issueType)) {
      return res.json(
        {
          success: false,
          error: "Issue type must be 'department' or 'public'.",
          code: 'INVALID_ISSUE_TYPE',
        },
        400
      );
    }

    // 3. Construct document with authoritative server-derived student identity
    const now = new Date().toISOString();
    const complaintData = {
      student_user_id: profile.user_id,
      student_name: profile.name,
      student_enrollment_no: profile.enrollment_no,
      department_code: profile.department_code,
      department_name: profile.department_name,
      title,
      location,
      description,
      priority,
      issue_type: issueType,
      status: 'open' as ComplaintStatus,
      support_count: 0,
      attachment_file_id: attachmentFileId || undefined,
      created_at: now,
      updated_at: now,
    };

    // 4. Create in database with empty permissions (trusted server access only)
    const doc = await databases.createDocument(
      config.databaseId,
      config.complaintsCollectionId,
      ID.unique(),
      complaintData,
      []
    );

    log(`[complaints] Created complaint ${doc.$id} by student ${profile.user_id} (${profile.department_code})`);

    const createdComplaint: Complaint = {
      $id: doc.$id,
      ...complaintData,
    };

    return res.json(
      {
        success: true,
        data: {
          complaint: createdComplaint,
        },
      },
      201
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error creating complaint: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to record complaint due to database error.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 2. List Complaints (Operation 4)
// ----------------------------------------------------
export async function handleListComplaints(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  try {
    // 1. Fetch caller profile to know authorized department
    const profile = await getCallerProfile(
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (!profile) {
      return res.json(
        {
          success: false,
          error: 'Caller profile not found.',
          code: 'PROFILE_NOT_FOUND',
        },
        401
      );
    }

    const feedType = (data.feed_type as string) || 'all';
    const status = data.status as ComplaintStatus | undefined;
    const search = typeof data.search === 'string' ? data.search.trim().toLowerCase() : '';
    const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
    const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;

    let complaints: Complaint[] = [];

    // Helper to map Appwrite document to Complaint
    const mapDocToComplaint = (doc: Record<string, unknown>): Complaint => ({
      $id: doc.$id as string,
      student_user_id: doc.student_user_id as string,
      student_name: doc.student_name as string,
      student_enrollment_no: doc.student_enrollment_no as string,
      department_code: doc.department_code as '06' | '07',
      department_name: doc.department_name as string,
      title: doc.title as string,
      location: doc.location as string,
      description: doc.description as string,
      priority: doc.priority as PriorityLevel,
      issue_type: doc.issue_type as IssueType,
      status: doc.status as ComplaintStatus,
      official_response: (doc.official_response as string) || undefined,
      resolved_at: (doc.resolved_at as string) || undefined,
      support_count: typeof doc.support_count === 'number' ? doc.support_count : 0,
      attachment_file_id: (doc.attachment_file_id as string) || undefined,
      created_at: (doc.created_at as string) || (doc.$createdAt as string),
      updated_at: (doc.updated_at as string) || (doc.$updatedAt as string),
    });

    if (feedType === 'department') {
      // Strictly caller's department
      const queries = [
        Query.equal('department_code', profile.department_code),
        Query.equal('issue_type', 'department'),
        Query.orderDesc('$createdAt'),
        Query.limit(limit * 2),
      ];
      if (status) queries.push(Query.equal('status', status));

      const result = await databases.listDocuments(
        config.databaseId,
        config.complaintsCollectionId,
        queries
      );
      complaints = result.documents.map((d) => mapDocToComplaint(d as unknown as Record<string, unknown>));
    } else if (feedType === 'public') {
      // Strictly public issues across all departments
      const queries = [
        Query.equal('issue_type', 'public'),
        Query.orderDesc('$createdAt'),
        Query.limit(limit * 2),
      ];
      if (status) queries.push(Query.equal('status', status));

      const result = await databases.listDocuments(
        config.databaseId,
        config.complaintsCollectionId,
        queries
      );
      complaints = result.documents.map((d) => mapDocToComplaint(d as unknown as Record<string, unknown>));
    } else {
      // Feed type 'all': caller sees their own department complaints + public issues
      const [deptResult, publicResult] = await Promise.all([
        databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
          Query.equal('department_code', profile.department_code),
          Query.equal('issue_type', 'department'),
          ...(status ? [Query.equal('status', status)] : []),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]),
        databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
          Query.equal('issue_type', 'public'),
          ...(status ? [Query.equal('status', status)] : []),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ]),
      ]);

      const seenIds = new Set<string>();
      const combined = [
        ...deptResult.documents.map((d) => mapDocToComplaint(d as unknown as Record<string, unknown>)),
        ...publicResult.documents.map((d) => mapDocToComplaint(d as unknown as Record<string, unknown>)),
      ];

      for (const c of combined) {
        if (c.$id && !seenIds.has(c.$id)) {
          seenIds.add(c.$id);
          complaints.push(c);
        }
      }

      // Sort combined by created date descending
      complaints.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Apply in-memory search filtering if query provided
    if (search.length > 0) {
      complaints = complaints.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          c.location.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search)
      );
    }

    // Apply pagination slice
    const total = complaints.length;
    const startIndex = (page - 1) * limit;
    const paginatedComplaints = complaints.slice(startIndex, startIndex + limit);

    return res.json(
      {
        success: true,
        data: {
          complaints: paginatedComplaints,
          total,
          page,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error listing complaints: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve complaints.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 3. Get Complaint & Oracle Elimination (Operation 6)
// ----------------------------------------------------
export async function handleGetComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  if (!complaintId) {
    return res.json(
      {
        success: false,
        error: 'Complaint ID is required.',
        code: 'MISSING_COMPLAINT_ID',
      },
      400
    );
  }

  try {
    // 1. Fetch caller profile
    const profile = await getCallerProfile(
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (!profile) {
      return res.json(
        {
          success: false,
          error: 'Caller profile not found.',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    // 2. Fetch complaint document
    let doc: Record<string, unknown>;
    try {
      doc = (await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      )) as unknown as Record<string, unknown>;
    } catch {
      // Document does not exist in DB: return generic 404
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const complaint: Complaint = {
      $id: doc.$id as string,
      student_user_id: doc.student_user_id as string,
      student_name: doc.student_name as string,
      student_enrollment_no: doc.student_enrollment_no as string,
      department_code: doc.department_code as '06' | '07',
      department_name: doc.department_name as string,
      title: doc.title as string,
      location: doc.location as string,
      description: doc.description as string,
      priority: doc.priority as PriorityLevel,
      issue_type: doc.issue_type as IssueType,
      status: doc.status as ComplaintStatus,
      official_response: (doc.official_response as string) || undefined,
      resolved_at: (doc.resolved_at as string) || undefined,
      support_count: typeof doc.support_count === 'number' ? doc.support_count : 0,
      attachment_file_id: (doc.attachment_file_id as string) || undefined,
      created_at: (doc.created_at as string) || (doc.$createdAt as string),
      updated_at: (doc.updated_at as string) || (doc.$updatedAt as string),
    };

    // 3. CRITICAL: Department Isolation & Oracle Elimination
    // If complaint is a private department issue:
    if (complaint.issue_type === 'department') {
      const callerDept = profile.department_code;
      // Cross-department check: if caller's department does not match complaint's department:
      if (callerDept !== complaint.department_code) {
        // MUST return generic HTTP 404 (never 403, never reveal existence to unauthorized department)
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    }

    // 4. Check if caller has supported this complaint
    let hasSupported = false;
    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    try {
      await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
      hasSupported = true;
    } catch {
      hasSupported = false;
    }

    return res.json(
      {
        success: true,
        data: {
          complaint,
          has_supported: hasSupported,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error retrieving complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve complaint.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 4. Support Complaint (Operation 7)
// ----------------------------------------------------
export async function handleSupportComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  if (!complaintId) {
    return res.json(
      {
        success: false,
        error: 'Complaint ID is required.',
        code: 'INVALID_COMPLAINT_ID',
      },
      400
    );
  }

  try {
    const profile = await getCallerProfile(
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    let doc: Record<string, unknown>;
    try {
      doc = (await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      )) as unknown as Record<string, unknown>;
    } catch {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    // Oracle Elimination: Check visibility
    if (doc.issue_type === 'department') {
      const callerDept = profile?.department_code || caller.department_code;
      if (callerDept !== doc.department_code) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    }

    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    try {
      await databases.createDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId,
        {
          complaint_id: complaintId,
          user_id: caller.id,
          supported_at: new Date().toISOString(),
        },
        []
      );
    } catch (insertErr: unknown) {
      const errObj = insertErr as { code?: number; message?: string };
      if (errObj?.code === 409 || errObj?.message?.includes('already exists')) {
        return res.json(
          {
            success: false,
            error: 'You have already supported this complaint.',
            code: 'ALREADY_SUPPORTED',
          },
          409
        );
      }
      throw insertErr;
    }

    const currentCount = typeof doc.support_count === 'number' ? doc.support_count : 0;
    const newCount = currentCount + 1;
    await databases.updateDocument(
      config.databaseId,
      config.complaintsCollectionId,
      complaintId,
      {
        support_count: newCount,
      }
    );

    log(`[complaints] User ${caller.id} supported complaint ${complaintId} (new count: ${newCount})`);

    return res.json(
      {
        success: true,
        data: {
          support_count: newCount,
          has_supported: true,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error supporting complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to support complaint.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 5. Get Support State (Operation 8)
// ----------------------------------------------------
export async function handleGetSupportState(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  if (!complaintId) {
    return res.json(
      {
        success: false,
        error: 'Complaint ID is required.',
        code: 'INVALID_COMPLAINT_ID',
      },
      400
    );
  }

  try {
    let doc: Record<string, unknown>;
    try {
      doc = (await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      )) as unknown as Record<string, unknown>;
    } catch {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    if (doc.issue_type === 'department') {
      const profile = await getCallerProfile(caller.id, config.databaseId, config.profilesCollectionId);
      const callerDept = profile?.department_code || caller.department_code;
      if (callerDept !== doc.department_code) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    }

    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    let hasSupported = false;
    try {
      await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
      hasSupported = true;
    } catch {
      hasSupported = false;
    }

    return res.json(
      {
        success: true,
        data: {
          support_count: typeof doc.support_count === 'number' ? doc.support_count : 0,
          has_supported: hasSupported,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error checking support state for ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve support state.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 6. Get Admin Dashboard (Operation 9)
// ----------------------------------------------------
export async function handleGetAdminDashboard(
  context: AppwriteContext,
  caller: AuthenticatedCaller
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  if (caller.role !== 'department_admin' || !caller.department_code) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  try {
    const deptCode = caller.department_code;
    const [openRes, inProgressRes, resolvedRes] = await Promise.all([
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('department_code', deptCode),
        Query.equal('status', 'open'),
        Query.limit(1),
      ]),
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('department_code', deptCode),
        Query.equal('status', 'in_progress'),
        Query.limit(1),
      ]),
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('department_code', deptCode),
        Query.equal('status', 'resolved'),
        Query.limit(1),
      ]),
    ]);

    const metrics: AdminMetrics = {
      total_open: openRes.total,
      total_in_progress: inProgressRes.total,
      total_resolved: resolvedRes.total,
      department_code: deptCode,
    };

    return res.json(
      {
        success: true,
        data: {
          metrics,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[admin] Error fetching admin dashboard metrics: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve admin dashboard metrics.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 7. List Admin Complaints (Operation 10)
// ----------------------------------------------------
export async function handleListAdminComplaints(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  if (caller.role !== 'department_admin' || !caller.department_code) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  try {
    const deptCode = caller.department_code;
    const status = data.status as ComplaintStatus | undefined;
    const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
    const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;
    const offset = (page - 1) * limit;

    const queries = [
      Query.equal('department_code', deptCode),
      Query.orderDesc('created_at'),
      Query.limit(limit),
      Query.offset(offset),
    ];

    if (status && ['open', 'in_progress', 'resolved'].includes(status)) {
      queries.push(Query.equal('status', status));
    }

    const result = await databases.listDocuments(
      config.databaseId,
      config.complaintsCollectionId,
      queries
    );

    const complaints = result.documents.map((doc) => ({
      $id: doc.$id,
      student_user_id: doc.student_user_id as string,
      student_name: doc.student_name as string,
      student_enrollment_no: doc.student_enrollment_no as string,
      department_code: doc.department_code as '06' | '07',
      department_name: doc.department_name as string,
      title: doc.title as string,
      location: doc.location as string,
      description: doc.description as string,
      priority: doc.priority as PriorityLevel,
      issue_type: doc.issue_type as IssueType,
      status: doc.status as ComplaintStatus,
      official_response: (doc.official_response as string) || undefined,
      resolved_at: (doc.resolved_at as string) || undefined,
      support_count: typeof doc.support_count === 'number' ? doc.support_count : 0,
      attachment_file_id: (doc.attachment_file_id as string) || undefined,
      created_at: (doc.created_at as string) || (doc.$createdAt as string),
      updated_at: (doc.updated_at as string) || (doc.$updatedAt as string),
    }));

    return res.json(
      {
        success: true,
        data: {
          complaints,
          total: result.total,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[admin] Error listing admin complaints: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve admin complaints queue.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 8. Update Admin Complaint (Operation 11)
// ----------------------------------------------------
export async function handleUpdateAdminComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const { databases } = getServerClient();

  if (caller.role !== 'department_admin' || !caller.department_code) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const status = data.status as ComplaintStatus;
  const officialResponse = typeof data.official_response === 'string' ? data.official_response.trim() : '';

  if (!complaintId) {
    return res.json(
      {
        success: false,
        error: 'Complaint ID is required.',
        code: 'INVALID_ID',
      },
      400
    );
  }

  if (!['in_progress', 'resolved'].includes(status)) {
    return res.json(
      {
        success: false,
        error: "Status must be updated to 'in_progress' or 'resolved'.",
        code: 'INVALID_STATUS',
      },
      400
    );
  }

  if (officialResponse.length < 5 || officialResponse.length > 1000) {
    return res.json(
      {
        success: false,
        error: 'Official response must be between 5 and 1000 characters.',
        code: 'INVALID_RESPONSE',
      },
      400
    );
  }

  try {
    let doc: Record<string, unknown>;
    try {
      doc = (await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      )) as unknown as Record<string, unknown>;
    } catch {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    // Oracle Elimination: Must belong to caller's department
    if (doc.department_code !== caller.department_code) {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status,
      official_response: officialResponse,
      updated_at: now,
    };

    if (status === 'resolved') {
      updateData.resolved_at = now;
    }

    const updatedDoc = (await databases.updateDocument(
      config.databaseId,
      config.complaintsCollectionId,
      complaintId,
      updateData
    )) as unknown as Record<string, unknown>;

    log(`[admin] Admin ${caller.id} updated complaint ${complaintId} to ${status}`);

    const updatedComplaint: Complaint = {
      $id: updatedDoc.$id as string,
      student_user_id: updatedDoc.student_user_id as string,
      student_name: updatedDoc.student_name as string,
      student_enrollment_no: updatedDoc.student_enrollment_no as string,
      department_code: updatedDoc.department_code as '06' | '07',
      department_name: updatedDoc.department_name as string,
      title: updatedDoc.title as string,
      location: updatedDoc.location as string,
      description: updatedDoc.description as string,
      priority: updatedDoc.priority as PriorityLevel,
      issue_type: updatedDoc.issue_type as IssueType,
      status: updatedDoc.status as ComplaintStatus,
      official_response: (updatedDoc.official_response as string) || undefined,
      resolved_at: (updatedDoc.resolved_at as string) || undefined,
      support_count: typeof updatedDoc.support_count === 'number' ? updatedDoc.support_count : 0,
      attachment_file_id: (updatedDoc.attachment_file_id as string) || undefined,
      created_at: (updatedDoc.created_at as string) || (updatedDoc.$createdAt as string),
      updated_at: (updatedDoc.updated_at as string) || (updatedDoc.$updatedAt as string),
    };

    return res.json(
      {
        success: true,
        data: {
          complaint: updatedComplaint,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[admin] Error updating complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to update complaint.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}
