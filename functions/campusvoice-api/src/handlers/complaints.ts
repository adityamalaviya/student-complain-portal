import crypto from 'crypto';
import { ID, Query, type Models } from 'node-appwrite';
import { getAppwriteConfig, getServerClient } from '../db.js';
import { appendAuditLog } from './audit.js';
import {
  PHONE_NUMBER_REGEX,
  isAcademicDepartment,
  isComplaintDelayed,
  normalizeComplaintStatus,
  readBooleanField,
  readNumberField,
  readStringField,
  resolveDepartment,
  resolveLegacyDepartmentCode,
  type DatabaseClientLike,
  type StorageClientLike,
} from '../departments.js';
import {
  getClarificationState,
  getWarningState,
  isMeaningfulComplaintUpdate,
  validateClarificationReply,
  validateClarificationRequest,
  validateComplaintStatusTransition,
} from '../stateMachines.js';
import type {
  AcademicDepartmentId,
  AdminMetrics,
  AppwriteContext,
  AuthenticatedCaller,
  Complaint,
  ComplaintAttachmentData,
  ComplaintTimeline,
  ComplaintWarning,
  PriorityLevel,
  TimelineEntryType,
  UserProfile,
  UserRole,
} from '../types.js';

export interface ComplaintHandlerDeps {
  databases?: DatabaseClientLike;
  storage?: StorageClientLike;
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export function isDelayed(complaint: {
  status: string;
  created_at: string;
  last_meaningful_update_at: string;
}): boolean {
  return isComplaintDelayed(complaint);
}
const MIME_TO_EXTENSIONS: Record<string, readonly string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};
const ATTACHMENT_FILE_ID_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/;
const USER_PERMISSION_REGEX = /^(?:read|write|update|delete)\("user:([^"]+)"\)$/;

function hasExclusiveUserOwnership(
  permissions: string[] | undefined,
  userId: string
): boolean {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return false;
  }
  return permissions.every((perm) => {
    const match = USER_PERMISSION_REGEX.exec(perm.trim());
    return Boolean(match && match[1] === userId);
  });
}

function matchesAttachmentMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'application/pdf') {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d
    );
  }
  if (mimeType === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

interface AttachmentValidationResult {
  valid: boolean;
  statusCode?: number;
  code?: string;
  error?: string;
  originalPermissions?: string[];
}

async function validateAttachmentForComplaint(
  databases: DatabaseClientLike,
  storage: StorageClientLike,
  config: ReturnType<typeof getAppwriteConfig>,
  callerId: string,
  attachmentFileId: string
): Promise<AttachmentValidationResult> {
  if (!ATTACHMENT_FILE_ID_REGEX.test(attachmentFileId)) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INVALID_ATTACHMENT',
      error: 'Invalid attachment file identifier.',
    };
  }

  let fileMeta: Models.File;
  try {
    fileMeta = await storage.getFile(config.storageBucketId, attachmentFileId);
  } catch {
    return {
      valid: false,
      statusCode: 400,
      code: 'ATTACHMENT_NOT_FOUND',
      error: 'Referenced attachment file does not exist in storage.',
    };
  }

  if (fileMeta.bucketId && fileMeta.bucketId !== config.storageBucketId) {
    return {
      valid: false,
      statusCode: 400,
      code: 'ATTACHMENT_NOT_FOUND',
      error: 'Referenced attachment file is not in the institutional bucket.',
    };
  }

  if (
    typeof fileMeta.chunksTotal === 'number' &&
    fileMeta.chunksTotal > 0 &&
    fileMeta.chunksUploaded !== fileMeta.chunksTotal
  ) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INCOMPLETE_ATTACHMENT',
      error: 'Attachment upload is incomplete. Please re-upload the file.',
    };
  }

  try {
    const linkedComplaints = await databases.listDocuments(
      config.databaseId,
      config.complaintsCollectionId,
      [Query.equal('attachment_file_id', attachmentFileId), Query.limit(1)]
    );
    if (linkedComplaints.total > 0) {
      return {
        valid: false,
        statusCode: 409,
        code: 'ATTACHMENT_ALREADY_LINKED',
        error: 'This attachment is already linked to an existing complaint.',
      };
    }
  } catch {
    // Fallback to file permissions ownership lock when idx_cmpl_attachment is absent
  }

  if (!hasExclusiveUserOwnership(fileMeta.$permissions, callerId)) {
    return {
      valid: false,
      statusCode: 403,
      code: 'ATTACHMENT_OWNERSHIP_DENIED',
      error: 'Attachment must be privately uploaded and owned solely by the submitting student.',
    };
  }

  if (typeof fileMeta.sizeOriginal !== 'number' || fileMeta.sizeOriginal <= 0) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INVALID_ATTACHMENT',
      error: 'Attachment file cannot be empty.',
    };
  }

  if (fileMeta.sizeOriginal > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      statusCode: 400,
      code: 'ATTACHMENT_TOO_LARGE',
      error: 'Attachment exceeds the strict 5 MB maximum file size.',
    };
  }

  const normalizedMime = (fileMeta.mimeType || '').trim().toLowerCase();
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMime)) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INVALID_ATTACHMENT_TYPE',
      error: 'Only PDF, JPG, JPEG, and PNG attachments are permitted.',
    };
  }

  if (fileMeta.name && fileMeta.name.includes('.')) {
    const ext = fileMeta.name.split('.').pop()?.trim().toLowerCase() || '';
    const allowedExts = MIME_TO_EXTENSIONS[normalizedMime] || [];
    if (!allowedExts.includes(ext)) {
      return {
        valid: false,
        statusCode: 400,
        code: 'INVALID_ATTACHMENT_TYPE',
        error: 'Attachment file extension does not match its content type.',
      };
    }
  }

  let rawBuffer: ArrayBuffer;
  try {
    rawBuffer = await storage.getFileDownload(config.storageBucketId, attachmentFileId);
  } catch {
    return {
      valid: false,
      statusCode: 400,
      code: 'ATTACHMENT_NOT_FOUND',
      error: 'Unable to inspect attachment file content.',
    };
  }

  const bytes = new Uint8Array(rawBuffer);
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return {
      valid: false,
      statusCode: 400,
      code: 'ATTACHMENT_TOO_LARGE',
      error: 'Attachment exceeds the strict 5 MB maximum file size.',
    };
  }

  if (bytes.byteLength <= 0 || bytes.byteLength !== fileMeta.sizeOriginal) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INVALID_ATTACHMENT',
      error: 'Attachment file size verification failed.',
    };
  }

  if (!matchesAttachmentMagicBytes(bytes, normalizedMime)) {
    return {
      valid: false,
      statusCode: 400,
      code: 'INVALID_ATTACHMENT_CONTENT',
      error: 'Attachment file content does not match a valid PDF, JPG, JPEG, or PNG file.',
    };
  }

  return {
    valid: true,
    originalPermissions: [...(fileMeta.$permissions || [])],
  };
}

const ALLOWED_TIMELINE_ENTRY_TYPES = new Set<TimelineEntryType>([
  'status_change',
  'progress_update',
  'clarification_request',
  'clarification_reply',
  'admin_response',
]);

function resolveProfileRole(rawRole: string): UserRole {
  if (rawRole === 'principal' || rawRole === 'department_admin') {
    return rawRole;
  }
  return 'student';
}

function normalizeTimelineEntryType(raw: string): TimelineEntryType | null {
  if (raw === 'clarification_request' || raw === 'request_clarification') {
    return 'clarification_request';
  }
  if (raw === 'clarification_reply' || raw === 'reply_clarification') {
    return 'clarification_reply';
  }
  if (ALLOWED_TIMELINE_ENTRY_TYPES.has(raw as TimelineEntryType)) {
    return raw as TimelineEntryType;
  }
  return null;
}

function mapDocToTimelineEntry(doc: Models.Document): ComplaintTimeline | null {
  const complaintId = readStringField(doc, 'complaint_id').trim();
  const rawEntryType = readStringField(doc, 'entry_type').trim();
  const content = readStringField(doc, 'content').trim();
  const createdAt = readStringField(doc, 'created_at').trim() || doc.$createdAt;
  const entryType = normalizeTimelineEntryType(rawEntryType);

  if (!complaintId || !content || !createdAt || !entryType) {
    return null;
  }

  const rawAuthorRole = readStringField(doc, 'author_role').trim();
  const authorRole = resolveProfileRole(rawAuthorRole);
  const authorId = readStringField(doc, 'author_id').trim();
  const oldStatus = normalizeComplaintStatus(doc['old_status']) ?? undefined;
  const newStatus = normalizeComplaintStatus(doc['new_status']) ?? undefined;

  return {
    $id: doc.$id,
    complaint_id: complaintId,
    ...(authorId ? { author_id: authorId } : {}),
    author_role: authorRole,
    entry_type: entryType,
    content,
    ...(oldStatus ? { old_status: oldStatus } : {}),
    ...(newStatus ? { new_status: newStatus } : {}),
    created_at: createdAt,
  };
}

function compareTimelineChronological(a: ComplaintTimeline, b: ComplaintTimeline): number {
  const timeA = Date.parse(a.created_at);
  const timeB = Date.parse(b.created_at);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
    return timeA - timeB;
  }
  const cmp = a.created_at.localeCompare(b.created_at);
  if (cmp !== 0) {
    return cmp;
  }
  // Preserve stable DB/insertion order when timestamps fall within the same millisecond.
  return 0;
}

function buildTimelineAuthorLabel(
  entry: ComplaintTimeline,
  options: {
    viewerUserId: string;
    maintenanceDeptName?: string;
  }
): string {
  if (entry.author_role === 'department_admin') {
    return options.maintenanceDeptName
      ? `${options.maintenanceDeptName} Maintenance Admin`
      : 'Maintenance Admin';
  }
  if (entry.author_role === 'principal') {
    return 'Principal';
  }
  if (entry.author_id && entry.author_id === options.viewerUserId) {
    return 'You';
  }
  return 'Complaint Creator';
}

function projectTimelineEntry(
  entry: ComplaintTimeline,
  options: {
    includePrivateDetails: boolean;
    viewerUserId: string;
    maintenanceDeptName?: string;
  }
): ComplaintTimeline {
  const authorLabel = buildTimelineAuthorLabel(entry, {
    viewerUserId: options.viewerUserId,
    maintenanceDeptName: options.maintenanceDeptName,
  });

  return {
    ...(entry.$id ? { $id: entry.$id } : {}),
    complaint_id: entry.complaint_id,
    ...(options.includePrivateDetails && entry.author_id ? { author_id: entry.author_id } : {}),
    author_role: entry.author_role,
    author_label: authorLabel,
    entry_type: entry.entry_type,
    content: entry.content,
    ...(entry.old_status ? { old_status: entry.old_status } : {}),
    ...(entry.new_status ? { new_status: entry.new_status } : {}),
    created_at: entry.created_at,
  };
}

async function fetchComplaintTimeline(
  databases: DatabaseClientLike,
  config: ReturnType<typeof getAppwriteConfig>,
  complaintId: string
): Promise<ComplaintTimeline[]> {
  const docs: Models.Document[] = [];
  let offset = 0;
  let total = 0;

  do {
    const result = await databases.listDocuments(
      config.databaseId,
      config.timelineCollectionId,
      [
        Query.equal('complaint_id', complaintId),
        Query.orderAsc('created_at'),
        Query.limit(100),
        Query.offset(offset),
      ]
    );
    docs.push(...result.documents);
    total = result.total;
    offset += result.documents.length;
    if (result.documents.length === 0) break;
  } while (docs.length < total);

  return docs
    .map((doc) => mapDocToTimelineEntry(doc))
    .filter((entry): entry is ComplaintTimeline => Boolean(entry && entry.complaint_id === complaintId))
    .sort(compareTimelineChronological);
}

interface TimelineDerivedSummary {
  officialResponse?: string;
  resolvedAt?: string;
}

function deriveComplaintSummaryFromTimeline(
  complaint: Complaint,
  timeline: ComplaintTimeline[]
): TimelineDerivedSummary {
  let officialResponse: string | undefined;
  let fallbackStatusResponse: string | undefined;
  let resolvedAt: string | undefined;

  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (
      !officialResponse &&
      entry.author_role === 'department_admin' &&
      (entry.entry_type === 'admin_response' || entry.entry_type === 'progress_update')
    ) {
      officialResponse = entry.content;
    }
    if (
      !fallbackStatusResponse &&
      entry.author_role === 'department_admin' &&
      entry.entry_type === 'status_change'
    ) {
      fallbackStatusResponse = entry.content;
    }
    if (
      !resolvedAt &&
      complaint.status === 'Resolved' &&
      entry.entry_type === 'status_change' &&
      normalizeComplaintStatus(entry.new_status) === 'Resolved'
    ) {
      resolvedAt = entry.created_at;
    }
  }

  return {
    officialResponse: officialResponse ?? fallbackStatusResponse ?? complaint.official_response,
    resolvedAt: resolvedAt ?? (complaint.status === 'Resolved' ? complaint.resolved_at : undefined),
  };
}

async function fetchLatestTimelineSummariesForComplaints(
  databases: DatabaseClientLike,
  config: ReturnType<typeof getAppwriteConfig>,
  complaints: Complaint[]
): Promise<Map<string, TimelineDerivedSummary>> {
  const summaryMap = new Map<string, TimelineDerivedSummary>();
  const complaintIds = Array.from(
    new Set(complaints.map((c) => c.$id).filter((id): id is string => Boolean(id)))
  );

  if (complaintIds.length === 0) {
    return summaryMap;
  }

  const grouped = new Map<string, ComplaintTimeline[]>();
  const chunkSize = 25;

  for (let idx = 0; idx < complaintIds.length; idx += chunkSize) {
    const chunk = complaintIds.slice(idx, idx + chunkSize);
    const docs: Models.Document[] = [];
    let offset = 0;
    let total = 0;

    do {
      const result = await databases.listDocuments(
        config.databaseId,
        config.timelineCollectionId,
        [
          Query.equal('complaint_id', chunk),
          Query.orderAsc('created_at'),
          Query.limit(100),
          Query.offset(offset),
        ]
      );
      docs.push(...result.documents);
      total = result.total;
      offset += result.documents.length;
      if (result.documents.length === 0) break;
    } while (docs.length < total);

    for (const doc of docs) {
      const entry = mapDocToTimelineEntry(doc);
      if (!entry || !chunk.includes(entry.complaint_id)) {
        continue;
      }
      const list = grouped.get(entry.complaint_id) ?? [];
      list.push(entry);
      grouped.set(entry.complaint_id, list);
    }
  }

  for (const complaint of complaints) {
    if (!complaint.$id) continue;
    const entries = (grouped.get(complaint.$id) ?? []).sort(compareTimelineChronological);
    summaryMap.set(complaint.$id, deriveComplaintSummaryFromTimeline(complaint, entries));
  }

  return summaryMap;
}

function mapDocToComplaint(doc: Models.Document): Complaint {
  const rawStudentDept = readStringField(doc, 'student_department_id');
  const rawMaintDept = readStringField(doc, 'maintenance_department_id');
  const rawLegacyDeptCode = readStringField(doc, 'department_code');

  const resolvedStudentDept =
    resolveDepartment(rawStudentDept) ||
    (!rawStudentDept ? resolveLegacyDepartmentCode(rawLegacyDeptCode) : null);
  const resolvedMaintDept =
    resolveDepartment(rawMaintDept) ||
    (!rawMaintDept ? resolveLegacyDepartmentCode(rawLegacyDeptCode) : null);

  const rawPriority = readStringField(doc, 'priority');
  const priority: PriorityLevel =
    rawPriority === 'low' || rawPriority === 'high' ? rawPriority : 'medium';

  const status = normalizeComplaintStatus(doc['status']) ?? 'Pending';
  const rawSupportCount = readNumberField(doc, 'support_count');
  const supportCount = typeof rawSupportCount === 'number' && rawSupportCount >= 1 ? rawSupportCount : 1;

  const attachmentFileId = readStringField(doc, 'attachment_file_id').trim() || undefined;
  const lastMeaningfulUpdate =
    readStringField(doc, 'last_meaningful_update_at').trim() ||
    readStringField(doc, 'created_at').trim() ||
    doc.$createdAt;

  return {
    $id: doc.$id,
    student_user_id: readStringField(doc, 'student_user_id'),
    student_name: readStringField(doc, 'student_name'),
    student_enrollment_no: readStringField(doc, 'student_enrollment_no'),
    student_department_id: resolvedStudentDept?.id ?? rawStudentDept,
    maintenance_department_id: resolvedMaintDept?.id ?? rawMaintDept,
    title: readStringField(doc, 'title'),
    location: readStringField(doc, 'location'),
    description: readStringField(doc, 'description'),
    priority,
    status,
    support_count: supportCount,
    last_meaningful_update_at: lastMeaningfulUpdate,
    ...(attachmentFileId ? { attachment_file_id: attachmentFileId } : {}),
    ...(resolvedMaintDept
      ? {
          department_name: resolvedMaintDept.name,
        }
      : {}),
    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
  };
}

/**
 * Projects a complaint document based on caller authorization tier.
 * Peer students receive a strictly redacted projection with zero creator PII or attachment references.
 */
function projectComplaint(
  complaint: Complaint,
  options: {
    includePrivateDetails: boolean;
    isOwnComplaint: boolean;
    studentPhoneNumber?: string;
    officialResponse?: string;
    resolvedAt?: string;
  }
): Complaint {
  const effectiveOfficialResponse = options.officialResponse ?? complaint.official_response;
  const effectiveResolvedAt =
    options.resolvedAt ?? (complaint.status === 'Resolved' ? complaint.resolved_at : undefined);

  const base: Complaint = {
    ...(complaint.$id ? { $id: complaint.$id } : {}),
    student_department_id: complaint.student_department_id,
    maintenance_department_id: complaint.maintenance_department_id,
    title: complaint.title,
    location: complaint.location,
    description: complaint.description,
    priority: complaint.priority,
    status: complaint.status,
    support_count: complaint.support_count,
    ...(complaint.last_meaningful_update_at
      ? { last_meaningful_update_at: complaint.last_meaningful_update_at }
      : {}),
    ...(complaint.department_name ? { department_name: complaint.department_name } : {}),
    ...(effectiveOfficialResponse ? { official_response: effectiveOfficialResponse } : {}),
    ...(effectiveResolvedAt ? { resolved_at: effectiveResolvedAt } : {}),
    is_own_complaint: options.isOwnComplaint,
    created_at: complaint.created_at,
    updated_at: complaint.updated_at,
  };

  if (!options.includePrivateDetails) {
    return base;
  }

  return {
    ...base,
    ...(complaint.student_user_id ? { student_user_id: complaint.student_user_id } : {}),
    ...(complaint.student_name ? { student_name: complaint.student_name } : {}),
    ...(complaint.student_enrollment_no ? { student_enrollment_no: complaint.student_enrollment_no } : {}),
    ...(options.studentPhoneNumber ? { student_phone_number: options.studentPhoneNumber } : {}),
    ...(complaint.attachment_file_id ? { attachment_file_id: complaint.attachment_file_id } : {}),
  };
}

/**
 * Resolves active maintenance department IDs authorized for a Department Admin caller.
 * Requires explicitly validated active caller.admin_assignments with scope='maintenance'.
 */
function resolveAuthorizedMaintenanceDeptIds(caller: AuthenticatedCaller): string[] {
  if (caller.role !== 'department_admin' || !Array.isArray(caller.admin_assignments)) {
    return [];
  }

  const ids = new Set<string>();
  for (const assignment of caller.admin_assignments) {
    if (
      assignment &&
      assignment.is_active === true &&
      assignment.scope === 'maintenance' &&
      (assignment.user_id === caller.id || !assignment.user_id)
    ) {
      const dept = resolveDepartment(assignment.department_id);
      if (dept) {
        if (dept.is_maintenance && dept.is_active) {
          ids.add(dept.id);
        }
      } else if (typeof assignment.department_id === 'string') {
        const trimmed = assignment.department_id.trim();
        if (trimmed) {
          ids.add(trimmed);
        }
      }
    }
  }
  return [...ids];
}

/**
 * Looks up the creator's verified phone number for authorized viewers (Creator, concerned Maintenance Admin, Principal).
 */
async function getCreatorPhoneNumber(
  databases: DatabaseClientLike,
  config: ReturnType<typeof getAppwriteConfig>,
  studentUserId?: string
): Promise<string | undefined> {
  if (!studentUserId) {
    return undefined;
  }
  try {
    const profileRes = await databases.listDocuments(
      config.databaseId,
      config.profilesCollectionId,
      [Query.equal('user_id', studentUserId), Query.limit(1)]
    );
    const profileDoc = profileRes.documents[0];
    if (!profileDoc) {
      return undefined;
    }
    const phone = readStringField(profileDoc, 'phone_number').trim();
    return phone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fetches caller profile from the profiles collection.
 */
async function getCallerProfile(
  databases: DatabaseClientLike,
  userId: string,
  databaseId: string,
  profilesCollectionId: string
): Promise<UserProfile | null> {
  const res = await databases.listDocuments(databaseId, profilesCollectionId, [
    Query.equal('user_id', userId),
    Query.limit(1),
  ]);

  if (res.total === 0 || !res.documents[0]) {
    return null;
  }

  const doc = res.documents[0];
  const role = resolveProfileRole(readStringField(doc, 'role'));
  const enrollmentNo = readStringField(doc, 'enrollment_no').trim();
  const rawDeptId = readStringField(doc, 'student_department_id');
  const rawLegacyDeptCode = readStringField(doc, 'department_code');
  const resolvedDept =
    resolveDepartment(rawDeptId) ||
    (!rawDeptId && enrollmentNo.length === 12 ? resolveLegacyDepartmentCode(rawLegacyDeptCode) : null);
  const effectiveStudentDeptId: AcademicDepartmentId | null =
    role === 'student' && resolvedDept && resolvedDept.is_academic && resolvedDept.is_active
      ? (resolvedDept.id as AcademicDepartmentId)
      : null;
  const legacyLocked = readBooleanField(doc, 'is_locked');
  const nameLocked = readBooleanField(doc, 'name_locked') ?? Boolean(legacyLocked);
  const enrollmentLocked = readBooleanField(doc, 'enrollment_locked') ?? Boolean(legacyLocked);
  const phoneNumber = readStringField(doc, 'phone_number').trim();
  const phoneLocked =
    readBooleanField(doc, 'phone_locked') ??
    Boolean(legacyLocked && PHONE_NUMBER_REGEX.test(phoneNumber));

  return {
    $id: doc.$id,
    user_id: readStringField(doc, 'user_id') || userId,
    auth_user_id: readStringField(doc, 'auth_user_id') || userId,
    email: readStringField(doc, 'email'),
    name: readStringField(doc, 'name'),
    enrollment_no: enrollmentNo,
    student_department_id: effectiveStudentDeptId,
    phone_number: phoneNumber,
    role,
    name_locked: nameLocked,
    enrollment_locked: enrollmentLocked,
    phone_locked: phoneLocked,
    is_locked: nameLocked && enrollmentLocked && phoneLocked,
    ...(resolvedDept
      ? {
          department_name: resolvedDept.name,
        }
      : {}),
    created_at: readStringField(doc, 'created_at') || doc.$createdAt,
    updated_at: readStringField(doc, 'updated_at') || doc.$updatedAt,
  };
}

// ----------------------------------------------------
// 1. Create Complaint
// ----------------------------------------------------

/**
 * Creates an academic-department-scoped complaint routed to one of the 6 maintenance departments.
 * Derives creator identity and student_department_id strictly server-side, sets Pending status
 * and base-1 support count, and rejects obsolete public complaint requests.
 */
export async function handleCreateComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, log, error } = context;
  const config = getAppwriteConfig();
  const serverClients = deps?.databases && deps?.storage ? null : getServerClient();
  const databases = deps?.databases ?? serverClients!.databases;
  const storage = deps?.storage ?? serverClients!.storage;

  try {
    // 1. Fetch caller's verified profile
    const profile = await getCallerProfile(
      databases,
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (caller.role !== 'student' || (profile && profile.role !== 'student')) {
      return res.json(
        {
          success: false,
          error: 'Only students with a completed profile can file complaints.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    if (
      !profile ||
      !profile.name_locked ||
      !profile.enrollment_locked ||
      !profile.phone_locked ||
      !profile.enrollment_no ||
      !profile.phone_number ||
      !PHONE_NUMBER_REGEX.test(profile.phone_number) ||
      !profile.student_department_id ||
      !isAcademicDepartment(profile.student_department_id)
    ) {
      return res.json(
        {
          success: false,
          error: 'Student profile must be complete and verified before raising complaints.',
          code: 'PROFILE_INCOMPLETE',
        },
        400
      );
    }

    // 2. Reject obsolete public complaint functionality
    if (data.issue_type === 'public') {
      return res.json(
        {
          success: false,
          error:
            'Public complaint functionality has been removed. Complaints are scoped to your academic department and routed to a maintenance department.',
          code: 'PUBLIC_COMPLAINTS_REMOVED',
        },
        400
      );
    }

    // 3. Validate maintenance department selection against active maintenance departments
    const rawMaintDeptId =
      typeof data.maintenance_department_id === 'string'
        ? data.maintenance_department_id.trim()
        : '';
    let maintenanceDept = resolveDepartment(rawMaintDeptId);

    if (maintenanceDept) {
      let dbIsMaintenance: boolean | undefined;
      let dbIsActive: boolean | undefined;
      try {
        const deptDoc = await databases.getDocument(
          config.databaseId,
          config.departmentsCollectionId,
          maintenanceDept.id
        );
        dbIsMaintenance = readBooleanField(deptDoc, 'is_maintenance');
        dbIsActive = readBooleanField(deptDoc, 'is_active');
      } catch {
        // Departments collection may not be seeded in unit mocks or pre-migration DB
      }

      if (
        !(dbIsMaintenance ?? maintenanceDept.is_maintenance) ||
        !(dbIsActive ?? maintenanceDept.is_active)
      ) {
        return res.json(
          {
            success: false,
            error: 'Please select a valid active maintenance department.',
            code: 'INVALID_MAINTENANCE_DEPARTMENT',
          },
          400
        );
      }
    } else if (rawMaintDeptId) {
      try {
        const deptDoc = await databases.getDocument(
          config.databaseId,
          config.departmentsCollectionId,
          rawMaintDeptId
        );
        const isMaintenance = readBooleanField(deptDoc, 'is_maintenance') === true;
        const isActive = readBooleanField(deptDoc, 'is_active') === true;
        if (isMaintenance && isActive) {
          const name = readStringField(deptDoc, 'name') || rawMaintDeptId;
          const isAcademic = readBooleanField(deptDoc, 'is_academic') === true;
          maintenanceDept = {
            id: deptDoc.$id,
            name,
            is_academic: isAcademic,
            is_maintenance: true,
            is_active: true,
          };
        }
      } catch {
        // Department document not found or query error
      }
    }

    if (!maintenanceDept) {
      return res.json(
        {
          success: false,
          error: 'Please select a valid active maintenance department.',
          code: 'INVALID_MAINTENANCE_DEPARTMENT',
        },
        400
      );
    }

    // 4. Validate complaint fields
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const location = typeof data.location === 'string' ? data.location.trim() : '';
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const rawPriority = typeof data.priority === 'string' ? data.priority.trim() : '';
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

    if (rawPriority !== 'low' && rawPriority !== 'medium' && rawPriority !== 'high') {
      return res.json(
        {
          success: false,
          error: "Priority must be 'low', 'medium', or 'high'.",
          code: 'INVALID_PRIORITY',
        },
        400
      );
    }
    const priority: PriorityLevel = rawPriority;

    // 4b. Server-side validation & private lockdown of optional attachment
    let lockedAttachmentPermissions: string[] | undefined;
    if (attachmentFileId) {
      const attachmentCheck = await validateAttachmentForComplaint(
        databases,
        storage,
        config,
        caller.id,
        attachmentFileId
      );
      if (!attachmentCheck.valid) {
        return res.json(
          {
            success: false,
            error: attachmentCheck.error || 'Invalid attachment.',
            code: attachmentCheck.code || 'INVALID_ATTACHMENT',
          },
          attachmentCheck.statusCode || 400
        );
      }
      lockedAttachmentPermissions = attachmentCheck.originalPermissions;
      await storage.updateFile(config.storageBucketId, attachmentFileId, undefined, []);
    }

    // 5. Construct document with server-derived student identity and separated jurisdictions
    const now = new Date().toISOString();
    const effectiveDepartmentName =
      (typeof data.department_name === 'string' && data.department_name.trim().length > 0
        ? data.department_name.trim()
        : null) ||
      profile.department_name ||
      maintenanceDept.name;

    const complaintData = {
      student_user_id: profile.user_id,
      student_name: profile.name,
      student_enrollment_no: profile.enrollment_no,
      student_department_id: profile.student_department_id,
      maintenance_department_id: maintenanceDept.id,
      title,
      location,
      description,
      priority,
      status: 'Pending' as const,
      support_count: 1,
      last_meaningful_update_at: now,
      department_name: effectiveDepartmentName,
      ...(attachmentFileId ? { attachment_file_id: attachmentFileId } : {}),
      created_at: now,
      updated_at: now,
    };

    let doc: Models.Document;
    try {
      doc = await databases.createDocument(
        config.databaseId,
        config.complaintsCollectionId,
        ID.unique(),
        complaintData,
        []
      );
    } catch (createErr) {
      if (attachmentFileId && lockedAttachmentPermissions) {
        try {
          await storage.updateFile(
            config.storageBucketId,
            attachmentFileId,
            undefined,
            lockedAttachmentPermissions
          );
        } catch {
          // Best-effort restore of uncommitted attachment permissions
        }
      }
      throw createErr;
    }

    log(
      `[complaints] Created complaint ${doc.$id} by student ${profile.user_id} (academic=${profile.student_department_id}, maintenance=${maintenanceDept.id})`
    );

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'complaint_created',
        actor_id: profile.user_id,
        actor_role: 'student',
        target_resource_id: doc.$id,
        target_resource_type: 'complaint',
        details: {
          student_department_id: profile.student_department_id,
          maintenance_department_id: maintenanceDept.id,
          priority,
          has_attachment: Boolean(attachmentFileId),
        },
      },
      log
    );

    const createdComplaint: Complaint = projectComplaint(
      {
        $id: doc.$id,
        ...complaintData,
        department_name: maintenanceDept.name,
      },
      {
        includePrivateDetails: true,
        isOwnComplaint: true,
        studentPhoneNumber: profile.phone_number,
      }
    );

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
// 2. List Complaints (Academic Department Scoped)
// ----------------------------------------------------
export async function handleListComplaints(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  try {
    if (data.feed_type === 'public') {
      return res.json(
        {
          success: false,
          error: 'Public complaint feed has been removed.',
          code: 'PUBLIC_COMPLAINTS_REMOVED',
        },
        400
      );
    }

    if (caller.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students can view the academic department feed.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const profile = await getCallerProfile(
      databases,
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (profile && profile.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students can view the academic department feed.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    if (!profile || !profile.student_department_id || !isAcademicDepartment(profile.student_department_id)) {
      return res.json(
        {
          success: false,
          error: 'Caller profile or academic department not found.',
          code: 'PROFILE_NOT_FOUND',
        },
        401
      );
    }

    const normalizedStatus = normalizeComplaintStatus(data.status);
    const search = typeof data.search === 'string' ? data.search.trim().toLowerCase() : '';
    const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
    const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;

    let pageSlice: Complaint[] = [];
    let total = 0;

    if (search.length === 0) {
      const offset = (page - 1) * limit;
      const queries = [
        Query.equal('student_department_id', profile.student_department_id),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ];
      if (normalizedStatus) {
        queries.push(Query.equal('status', normalizedStatus));
      }
      const result = await databases.listDocuments(
        config.databaseId,
        config.complaintsCollectionId,
        queries
      );
      total = result.total;
      pageSlice = result.documents
        .map((doc) => mapDocToComplaint(doc))
        .filter((c) => c.student_department_id === profile.student_department_id);
    } else {
      // With local search filter: limit scan to maximum 100 recent documents to prevent timeout
      const queries = [
        Query.equal('student_department_id', profile.student_department_id),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ];
      if (normalizedStatus) {
        queries.push(Query.equal('status', normalizedStatus));
      }
      const result = await databases.listDocuments(
        config.databaseId,
        config.complaintsCollectionId,
        queries
      );
      let complaints = result.documents
        .map((doc) => mapDocToComplaint(doc))
        .filter((c) => c.student_department_id === profile.student_department_id);

      complaints = complaints.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          c.location.toLowerCase().includes(search) ||
          c.description.toLowerCase().includes(search)
      );
      total = complaints.length;
      const startIndex = (page - 1) * limit;
      pageSlice = complaints.slice(startIndex, startIndex + limit);
    }

    const pageComplaintIds = pageSlice
      .map((c) => c.$id)
      .filter((id): id is string => Boolean(id));

    const userSupportedComplaintIds = new Set<string>();
    if (pageComplaintIds.length > 0) {
      try {
        const supportQuery = [
          Query.equal('complaint_id', pageComplaintIds),
          Query.equal('user_id', caller.id),
          Query.equal('status', 'active'),
          Query.limit(limit),
        ];
        const userSupports = await databases.listDocuments(
          config.databaseId,
          config.supportsCollectionId,
          supportQuery
        );
        for (const sDoc of userSupports.documents) {
          const cId = readStringField(sDoc, 'complaint_id');
          if (cId) userSupportedComplaintIds.add(cId);
        }
      } catch {
        // Non-blocking: fallback to empty set if support collection query fails
      }
    }

    const summaryMap = await fetchLatestTimelineSummariesForComplaints(databases, config, pageSlice);
    const paginatedComplaints = pageSlice.map((c) => {
      const isCreator = c.student_user_id === caller.id;
      const hasSupported = isCreator || (c.$id ? userSupportedComplaintIds.has(c.$id) : false);
      const summary = c.$id ? summaryMap.get(c.$id) : undefined;
      const projected = projectComplaint(c, {
        includePrivateDetails: isCreator,
        isOwnComplaint: isCreator,
        ...(isCreator && profile.phone_number ? { studentPhoneNumber: profile.phone_number } : {}),
        ...(summary?.officialResponse ? { officialResponse: summary.officialResponse } : {}),
        ...(summary?.resolvedAt ? { resolvedAt: summary.resolvedAt } : {}),
      });
      return {
        ...projected,
        has_supported: hasSupported,
        is_delayed: isDelayed({
          status: c.status,
          created_at: c.created_at || '',
          last_meaningful_update_at: c.last_meaningful_update_at || c.created_at || '',
        }),
      };
    });

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
// 3. Get Complaint & Oracle Elimination
// ----------------------------------------------------
export async function handleGetComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

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
    const profile = await getCallerProfile(
      databases,
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (!profile && caller.role === 'student') {
      return res.json(
        {
          success: false,
          error: 'Caller profile not found.',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);
    let includePrivateDetails = false;
    let isOwnComplaint = false;

    if (caller.role === 'student') {
      if (profile?.role === 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Unauthorized role.',
            code: 'FORBIDDEN',
          },
          403
        );
      }
      const callerDept = profile?.student_department_id;
      isOwnComplaint = complaint.student_user_id === caller.id;
      const isSameAcademicDept = Boolean(callerDept && callerDept === complaint.student_department_id);
      if (!isOwnComplaint && !isSameAcademicDept) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
      includePrivateDetails = isOwnComplaint;
    } else if (caller.role === 'department_admin') {
      const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
      if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
      includePrivateDetails = true;
    } else if (caller.role === 'principal' && profile?.role === 'principal') {
      includePrivateDetails = true;
    } else {
      return res.json(
        {
          success: false,
          error: 'Forbidden: Unauthorized role.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const [creatorPhone, rawTimeline] = await Promise.all([
      includePrivateDetails
        ? isOwnComplaint && profile?.phone_number
          ? Promise.resolve(profile.phone_number)
          : getCreatorPhoneNumber(databases, config, complaint.student_user_id)
        : Promise.resolve(undefined),
      fetchComplaintTimeline(databases, config, complaintId),
    ]);

    const { officialResponse, resolvedAt } = deriveComplaintSummaryFromTimeline(
      complaint,
      rawTimeline
    );

    let trueSupportCount = complaint.support_count;
    try {
      const activeSupports = await databases.listDocuments(
        config.databaseId,
        config.supportsCollectionId,
        [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(1)]
      );
      trueSupportCount = 1 + activeSupports.total;
      if (trueSupportCount !== complaint.support_count) {
        await databases.updateDocument(
          config.databaseId,
          config.complaintsCollectionId,
          complaintId,
          { support_count: trueSupportCount }
        ).catch(() => undefined);
      }
    } catch {
      // Non-blocking
    }

    const projectedComplaint = projectComplaint(complaint, {
      includePrivateDetails,
      isOwnComplaint,
      studentPhoneNumber: creatorPhone,
      officialResponse,
      resolvedAt,
    });

    const projectedTimeline = rawTimeline.map((entry) =>
      projectTimelineEntry(entry, {
        includePrivateDetails,
        viewerUserId: caller.id,
        maintenanceDeptName: complaint.department_name,
      })
    );

    let hasSupported = false;
    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    try {
      const supportDoc = await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
      const supportStatus = readStringField(supportDoc, 'status');
      hasSupported = supportStatus === '' || supportStatus === 'active';
    } catch {
      hasSupported = false;
    }

    const clarificationState = getClarificationState(rawTimeline);

    let warnings: ComplaintWarning[] = [];
    if (includePrivateDetails) {
      try {
        const warningsResult = await databases.listDocuments(
          config.databaseId,
          config.warningsCollectionId,
          [Query.equal('complaint_id', complaintId), Query.orderAsc('created_at')]
        );
        warnings = warningsResult.documents.map((wDoc) => {
          const adminResponse = readStringField(wDoc, 'admin_response') || undefined;
          const respondedAt = readStringField(wDoc, 'responded_at') || undefined;
          return {
            $id: wDoc.$id,
            complaint_id: readStringField(wDoc, 'complaint_id'),
            issued_by_principal_id: readStringField(wDoc, 'issued_by_principal_id'),
            warning_reason: readStringField(wDoc, 'warning_reason'),
            days_delayed: readNumberField(wDoc, 'days_delayed') ?? 0,
            admin_response: adminResponse,
            responded_at: respondedAt,
            state: getWarningState({
              admin_response: adminResponse,
              responded_at: respondedAt,
            }),
            created_at: readStringField(wDoc, 'created_at') || wDoc.$createdAt,
          };
        });
      } catch {
        warnings = [];
      }
    }

    return res.json(
      {
        success: true,
        data: {
          complaint: {
            ...projectedComplaint,
            support_count: trueSupportCount,
            clarification_state: clarificationState,
            is_delayed: isDelayed({
              status: complaint.status,
              created_at: complaint.created_at || (doc.$createdAt as string) || '',
              last_meaningful_update_at:
                complaint.last_meaningful_update_at ||
                complaint.created_at ||
                (doc.$createdAt as string) ||
                '',
            }),
          },
          timeline: projectedTimeline,
          has_supported: hasSupported,
          clarification_state: clarificationState,
          warnings,
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
// 4. Support Complaint
// ----------------------------------------------------
export async function handleSupportComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

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
    if (caller.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students are eligible to support complaints.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const profile = await getCallerProfile(
      databases,
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (profile && profile.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students are eligible to support complaints.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    if (
      !profile ||
      !profile.name_locked ||
      !profile.enrollment_locked ||
      !profile.enrollment_no ||
      !profile.student_department_id
    ) {
      return res.json(
        {
          success: false,
          error: 'Student profile must be complete and verified before supporting complaints.',
          code: 'PROFILE_INCOMPLETE',
        },
        400
      );
    }

    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);

    if (complaint.student_user_id === caller.id) {
      return res.json(
        {
          success: false,
          error: 'Students cannot support their own complaints.',
          code: 'CANNOT_SUPPORT_OWN_COMPLAINT',
        },
        400
      );
    }

    if (profile.student_department_id !== complaint.student_department_id) {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    const now = new Date().toISOString();

    let existingDoc: Models.Document | null = null;
    try {
      existingDoc = await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
    } catch {
      existingDoc = null;
    }

    const buildAlreadySupportedResponse = async (): Promise<unknown> => {
      let currentSupportCount = Math.max(1, complaint.support_count);
      try {
        const activeSupports = await databases.listDocuments(
          config.databaseId,
          config.supportsCollectionId,
          [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(1)]
        );
        currentSupportCount = 1 + activeSupports.total;
      } catch {
        // Fallback to stored complaint support count
      }
      return res.json(
        {
          success: false,
          error: 'You have already supported this complaint.',
          code: 'ALREADY_SUPPORTED',
          data: {
            support_count: currentSupportCount,
            has_supported: true,
          },
        },
        409
      );
    };

    const previousRevokedAt = existingDoc ? readStringField(existingDoc, 'revoked_at') : '';

    if (existingDoc) {
      const currentStatus = readStringField(existingDoc, 'status') || 'active';
      if (currentStatus === 'active') {
        return buildAlreadySupportedResponse();
      }
      // Re-support lifecycle: reactivate revoked support record
      await databases.updateDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId,
        {
          status: 'active',
          updated_at: now,
        }
      );
    } else {
      try {
        await databases.createDocument(
          config.databaseId,
          config.supportsCollectionId,
          supportDocId,
          {
            complaint_id: complaintId,
            user_id: caller.id,
            status: 'active',
            created_at: now,
          },
          []
        );
      } catch (insertErr: unknown) {
        const errObj = insertErr as { code?: number; message?: string };
        if (errObj?.code === 409 || errObj?.message?.includes('already exists')) {
          return buildAlreadySupportedResponse();
        }
        throw insertErr;
      }
    }

    let newCount: number;
    try {
      const activeSupports = await databases.listDocuments(
        config.databaseId,
        config.supportsCollectionId,
        [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(1)]
      );
      newCount = 1 + activeSupports.total;
      await databases.updateDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId,
        { support_count: newCount }
      );
    } catch (updateErr) {
      if (!existingDoc && databases.deleteDocument) {
        await databases.deleteDocument(
          config.databaseId,
          config.supportsCollectionId,
          supportDocId
        ).catch(() => undefined);
      } else if (existingDoc) {
        await databases.updateDocument(
          config.databaseId,
          config.supportsCollectionId,
          supportDocId,
          {
            status: 'revoked',
            ...(previousRevokedAt ? { revoked_at: previousRevokedAt } : {}),
            updated_at: new Date().toISOString(),
          }
        ).catch(() => undefined);
      }
      throw updateErr;
    }

    log(`[complaints] User ${caller.id} supported complaint ${complaintId} (new count: ${newCount})`);

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'support_added',
        actor_id: caller.id,
        actor_role: 'student',
        target_resource_id: complaintId,
        target_resource_type: 'complaint',
        details: {
          new_support_count: newCount,
          is_resupport: Boolean(existingDoc),
        },
      },
      log
    );

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
// 4b. Remove Support
// ----------------------------------------------------
export async function handleRemoveSupport(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

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
    if (caller.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students are eligible to remove support from complaints.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const profile = await getCallerProfile(
      databases,
      caller.id,
      config.databaseId,
      config.profilesCollectionId
    );

    if (profile && profile.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students are eligible to remove support from complaints.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    if (
      !profile ||
      !profile.name_locked ||
      !profile.enrollment_locked ||
      !profile.enrollment_no ||
      !profile.student_department_id
    ) {
      return res.json(
        {
          success: false,
          error: 'Student profile must be complete and verified before managing support.',
          code: 'PROFILE_INCOMPLETE',
        },
        400
      );
    }

    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);

    // Oracle Elimination: same academic department check
    if (profile.student_department_id !== complaint.student_department_id) {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    // Creator baseline cannot be removed
    if (complaint.student_user_id === caller.id) {
      return res.json(
        {
          success: false,
          error: 'Students cannot remove baseline support from their own complaints.',
          code: 'CANNOT_REMOVE_CREATOR_SUPPORT',
        },
        400
      );
    }

    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    let supportDoc: Models.Document;
    try {
      supportDoc = await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
    } catch {
      return res.json(
        {
          success: false,
          error: 'You have not supported this complaint.',
          code: 'NOT_SUPPORTED',
        },
        400
      );
    }

    const currentStatus = readStringField(supportDoc, 'status') || 'active';
    if (currentStatus !== 'active') {
      return res.json(
        {
          success: false,
          error: 'You have not actively supported this complaint.',
          code: 'NOT_SUPPORTED',
        },
        400
      );
    }

    const now = new Date().toISOString();
    await databases.updateDocument(
      config.databaseId,
      config.supportsCollectionId,
      supportDocId,
      {
        status: 'revoked',
        revoked_at: now,
        updated_at: now,
      }
    );

    let newCount: number;
    try {
      const activeSupports = await databases.listDocuments(
        config.databaseId,
        config.supportsCollectionId,
        [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(1)]
      );
      newCount = 1 + activeSupports.total;
      await databases.updateDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId,
        { support_count: newCount }
      );
    } catch (updateErr) {
      await databases.updateDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId,
        {
          status: 'active',
          revoked_at: '',
          updated_at: new Date().toISOString(),
        }
      ).catch(() => undefined);
      throw updateErr;
    }

    log(`[complaints] User ${caller.id} removed support from complaint ${complaintId} (new count: ${newCount})`);

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'support_removed',
        actor_id: caller.id,
        actor_role: 'student',
        target_resource_id: complaintId,
        target_resource_type: 'complaint',
        details: {
          new_support_count: newCount,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          support_count: newCount,
          has_supported: false,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error removing support from complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to remove support.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 5. Get Support State
// ----------------------------------------------------
export async function handleGetSupportState(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

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
    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);

    if (caller.role === 'student') {
      const profile = await getCallerProfile(
        databases,
        caller.id,
        config.databaseId,
        config.profilesCollectionId
      );
      if (profile?.role === 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Unauthorized role.',
            code: 'FORBIDDEN',
          },
          403
        );
      }
      const isCreator = complaint.student_user_id === caller.id;
      if (
        !isCreator &&
        (!profile?.student_department_id ||
          profile.student_department_id !== complaint.student_department_id)
      ) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    } else if (caller.role === 'department_admin') {
      const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
      if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
        return res.json(
          {
            success: false,
            error: 'Complaint not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    } else if (caller.role === 'principal') {
      const profile = await getCallerProfile(
        databases,
        caller.id,
        config.databaseId,
        config.profilesCollectionId
      );
      if (!profile || profile.role !== 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Unauthorized role.',
            code: 'FORBIDDEN',
          },
          403
        );
      }
    } else {
      return res.json(
        {
          success: false,
          error: 'Forbidden: Unauthorized role.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const supportDocId = crypto
      .createHash('sha256')
      .update(`${complaintId}:${caller.id}`)
      .digest('hex')
      .slice(0, 32);

    let hasSupported = false;
    try {
      const supportDoc = await databases.getDocument(
        config.databaseId,
        config.supportsCollectionId,
        supportDocId
      );
      const supportStatus = readStringField(supportDoc, 'status');
      hasSupported = supportStatus === '' || supportStatus === 'active';
    } catch {
      hasSupported = false;
    }

    let trueSupportCount = complaint.support_count;
    try {
      const activeSupports = await databases.listDocuments(
        config.databaseId,
        config.supportsCollectionId,
        [Query.equal('complaint_id', complaintId), Query.equal('status', 'active'), Query.limit(1)]
      );
      trueSupportCount = 1 + activeSupports.total;
      if (trueSupportCount !== complaint.support_count) {
        await databases.updateDocument(
          config.databaseId,
          config.complaintsCollectionId,
          complaintId,
          { support_count: trueSupportCount }
        ).catch(() => undefined);
      }
    } catch {
      // Non-blocking
    }

    return res.json(
      {
        success: true,
        data: {
          support_count: trueSupportCount,
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
// 6. Get Admin Dashboard (Maintenance Scoped)
// ----------------------------------------------------
export async function handleGetAdminDashboard(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;
  const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
  const primaryDeptId = authorizedMaintDeptIds[0];
  const adminDept = primaryDeptId ? resolveDepartment(primaryDeptId) : null;

  if (caller.role !== 'department_admin' || authorizedMaintDeptIds.length === 0) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const maintDeptFilter =
    authorizedMaintDeptIds.length === 1 ? authorizedMaintDeptIds[0] : authorizedMaintDeptIds;

  try {
    const [pendingRes, inProgRes, resolvedRes] = await Promise.all([
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('maintenance_department_id', maintDeptFilter),
        Query.equal('status', 'Pending'),
        Query.limit(1),
      ]),
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('maintenance_department_id', maintDeptFilter),
        Query.equal('status', 'In Progress'),
        Query.limit(1),
      ]),
      databases.listDocuments(config.databaseId, config.complaintsCollectionId, [
        Query.equal('maintenance_department_id', maintDeptFilter),
        Query.equal('status', 'Resolved'),
        Query.limit(1),
      ]),
    ]);

    const metrics: AdminMetrics = {
      total_open: pendingRes.total,
      total_in_progress: inProgRes.total,
      total_resolved: resolvedRes.total,
      department_id: adminDept ? adminDept.id : primaryDeptId,
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
// 7. List Admin Complaints (Maintenance Scoped)
// ----------------------------------------------------
export async function handleListAdminComplaints(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;
  const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);

  if (caller.role !== 'department_admin' || authorizedMaintDeptIds.length === 0) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const maintDeptFilter =
    authorizedMaintDeptIds.length === 1 ? authorizedMaintDeptIds[0] : authorizedMaintDeptIds;

  try {
    const normalizedStatus = normalizeComplaintStatus(data.status);
    const page = typeof data.page === 'number' && data.page > 0 ? data.page : 1;
    const limit = typeof data.limit === 'number' && data.limit > 0 && data.limit <= 50 ? data.limit : 20;
    const offset = (page - 1) * limit;

    const queries = [
      Query.equal('maintenance_department_id', maintDeptFilter),
      ...(normalizedStatus ? [Query.equal('status', normalizedStatus)] : []),
      Query.orderDesc('$createdAt'),
      Query.limit(limit),
      Query.offset(offset),
    ];

    const result = await databases.listDocuments(
      config.databaseId,
      config.complaintsCollectionId,
      queries
    );

    const allComplaints = result.documents
      .map((doc) => mapDocToComplaint(doc))
      .filter((c) => authorizedMaintDeptIds.includes(c.maintenance_department_id));
    const total = typeof result.total === 'number' ? result.total : allComplaints.length;
    const serverAlreadyPaginated =
      result.documents.length <= limit &&
      result.documents.length <= Math.max(0, total - offset);
    const pageSlice = serverAlreadyPaginated
      ? allComplaints
      : allComplaints.slice(offset, offset + limit);

    const summaryMap = await fetchLatestTimelineSummariesForComplaints(databases, config, pageSlice);
    const warningCountMap = new Map<string, number>();
    const pageIds = pageSlice
      .map((c) => c.$id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (pageIds.length > 0 && config.warningsCollectionId) {
      try {
        const warningsResult = await databases.listDocuments(
          config.databaseId,
          config.warningsCollectionId,
          [
            Query.equal('complaint_id', pageIds),
            Query.limit(Math.max(100, pageIds.length * 10)),
          ]
        );
        for (const wDoc of warningsResult.documents) {
          const cid = readStringField(wDoc, 'complaint_id');
          if (cid) {
            warningCountMap.set(cid, (warningCountMap.get(cid) ?? 0) + 1);
          }
        }
      } catch {
        // Non-blocking fallback when warnings collection is unavailable
      }
    }

    const paginatedComplaints = pageSlice.map((c) => {
      const summary = c.$id ? summaryMap.get(c.$id) : undefined;
      return {
        ...c,
        warning_count: c.$id ? warningCountMap.get(c.$id) ?? 0 : 0,
        is_delayed: isDelayed({
          status: c.status,
          created_at: c.created_at || '',
          last_meaningful_update_at: c.last_meaningful_update_at || c.created_at || '',
        }),
        ...(summary?.officialResponse ? { official_response: summary.officialResponse } : {}),
        ...(summary?.resolvedAt ? { resolved_at: summary.resolvedAt } : {}),
      };
    });

    return res.json(
      {
        success: true,
        data: {
          complaints: paginatedComplaints,
          total,
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
// 8. Update Admin Complaint (Maintenance Scoped)
// ----------------------------------------------------
export async function handleUpdateAdminComplaint(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  if (!caller || !caller.id) {
    return res.json(
      {
        success: false,
        error: 'Unauthorized: Missing caller identity.',
        code: 'UNAUTHORIZED',
      },
      401
    );
  }

  if (caller.role !== 'department_admin') {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
  if (authorizedMaintDeptIds.length === 0) {
    return res.json(
      {
        success: false,
        error: 'Forbidden: Maintenance department administrator privileges required.',
        code: 'FORBIDDEN',
      },
      403
    );
  }

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const rawStatusInput = data.status !== undefined ? data.status : data.new_status;
  const normalizedStatus = normalizeComplaintStatus(rawStatusInput);
  const rawResponse =
    typeof data.official_response === 'string'
      ? data.official_response
      : data.official_response === undefined && typeof data.content === 'string'
      ? data.content
      : '';
  const officialResponse = rawResponse.trim();

  if (
    data.entry_type !== undefined &&
    data.entry_type !== 'admin_response' &&
    data.entry_type !== 'progress_update'
  ) {
    return res.json(
      {
        success: false,
        error: "Timeline entry type must be 'admin_response' or 'progress_update'.",
        code: 'INVALID_ENTRY_TYPE',
      },
      400
    );
  }

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

  if (
    normalizedStatus !== 'Pending' &&
    normalizedStatus !== 'In Progress' &&
    normalizedStatus !== 'Resolved'
  ) {
    return res.json(
      {
        success: false,
        error: "Status must be 'Pending', 'In Progress', or 'Resolved'.",
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

  const requestedSubstantive =
    data.is_substantive === true || data.entry_type === 'progress_update';

  try {
    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const existing = mapDocToComplaint(doc);
    if (!authorizedMaintDeptIds.includes(existing.maintenance_department_id)) {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const existingStatus = normalizeComplaintStatus(existing.status) ?? 'Pending';
    const statusChanged = existingStatus !== normalizedStatus;
    const transitionCheck = validateComplaintStatusTransition(existingStatus, normalizedStatus);

    if (!transitionCheck.allowed) {
      return res.json(
        {
          success: false,
          error: transitionCheck.error || 'Invalid status transition.',
          code: transitionCheck.code || 'INVALID_STATUS_TRANSITION',
        },
        400
      );
    }

    const existingUpdatedMs = Math.max(
      Date.parse(existing.updated_at || '') || 0,
      Date.parse(existing.last_meaningful_update_at || '') || 0
    );
    const baseMs = Math.max(Date.now(), existingUpdatedMs + 1);
    const now = new Date(baseMs).toISOString();
    const responseTimestamp = statusChanged ? new Date(baseMs + 1).toISOString() : now;
    const finalTimestamp = statusChanged ? responseTimestamp : now;
    const noteEntryType: TimelineEntryType = requestedSubstantive
      ? 'progress_update'
      : 'admin_response';

    // Pending-to-Pending and Resolved-to-Resolved notes never reset the SLA timer.
    const isMeaningfulUpdate = isMeaningfulComplaintUpdate(
      existingStatus,
      normalizedStatus,
      requestedSubstantive
    );

    const timelinePayloads: Array<Record<string, unknown>> = [];
    if (statusChanged) {
      timelinePayloads.push({
        complaint_id: complaintId,
        author_id: caller.id,
        author_role: 'department_admin',
        entry_type: 'status_change',
        content: `Status changed from ${existingStatus} to ${normalizedStatus}`,
        old_status: existingStatus,
        new_status: normalizedStatus,
        created_at: now,
      });
    }
    timelinePayloads.push({
      complaint_id: complaintId,
      author_id: caller.id,
      author_role: 'department_admin',
      entry_type: noteEntryType,
      content: officialResponse,
      created_at: responseTimestamp,
    });

    const createdTimelineDocs: Models.Document[] = [];
    try {
      for (const entryPayload of timelinePayloads) {
        const createdEntryDoc = await databases.createDocument(
          config.databaseId,
          config.timelineCollectionId,
          ID.unique(),
          entryPayload,
          []
        );
        createdTimelineDocs.push(createdEntryDoc);
      }
    } catch (timelineErr) {
      for (const createdDoc of createdTimelineDocs) {
        if (databases.deleteDocument) {
          await databases
            .deleteDocument(config.databaseId, config.timelineCollectionId, createdDoc.$id)
            .catch(() => undefined);
        }
      }
      throw timelineErr;
    }

    // Update only status/lifecycle metadata on complaints; original complaint content stays immutable.
    const complaintPatch: Record<string, unknown> = {
      updated_at: finalTimestamp,
      ...(statusChanged ? { status: normalizedStatus } : {}),
      ...(isMeaningfulUpdate ? { last_meaningful_update_at: finalTimestamp } : {}),
    };

    let updatedDoc: Models.Document;
    try {
      updatedDoc = await databases.updateDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId,
        complaintPatch
      );
    } catch (updateErr) {
      for (const createdDoc of createdTimelineDocs) {
        if (databases.deleteDocument) {
          await databases
            .deleteDocument(config.databaseId, config.timelineCollectionId, createdDoc.$id)
            .catch(() => undefined);
        }
      }
      throw updateErr;
    }

    const updatedComplaint = mapDocToComplaint(updatedDoc);
    const createdEntries = createdTimelineDocs
      .map((entryDoc) => mapDocToTimelineEntry(entryDoc))
      .filter((entry): entry is ComplaintTimeline => Boolean(entry));

    const [creatorPhone, fullTimeline] = await Promise.all([
      getCreatorPhoneNumber(databases, config, updatedComplaint.student_user_id),
      fetchComplaintTimeline(databases, config, complaintId).catch(() =>
        [...createdEntries].sort(compareTimelineChronological)
      ),
    ]);

    const { officialResponse: derivedResponse, resolvedAt } = deriveComplaintSummaryFromTimeline(
      updatedComplaint,
      fullTimeline
    );

    const projectedComplaint = projectComplaint(updatedComplaint, {
      includePrivateDetails: true,
      isOwnComplaint: false,
      studentPhoneNumber: creatorPhone,
      officialResponse: derivedResponse,
      resolvedAt,
    });

    const projectedTimeline = fullTimeline.map((entry) =>
      projectTimelineEntry(entry, {
        includePrivateDetails: true,
        viewerUserId: caller.id,
        maintenanceDeptName: updatedComplaint.department_name,
      })
    );

    const projectedCreatedEntries = createdEntries.map((entry) =>
      projectTimelineEntry(entry, {
        includePrivateDetails: true,
        viewerUserId: caller.id,
        maintenanceDeptName: updatedComplaint.department_name,
      })
    );

    log(
      `[admin] Admin ${caller.id} recorded ${noteEntryType} on complaint ${complaintId} (status: ${existingStatus} -> ${normalizedStatus})`
    );

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'complaint_status_changed',
        actor_id: caller.id,
        actor_role: 'department_admin',
        target_resource_id: complaintId,
        target_resource_type: 'complaint',
        details: {
          old_status: existingStatus,
          new_status: normalizedStatus,
          is_substantive: requestedSubstantive,
          maintenance_department_id: existing.maintenance_department_id,
        },
      },
      log
    );

    return res.json(
      {
        success: true,
        data: {
          complaint: projectedComplaint,
          timeline: projectedTimeline,
          timeline_entries: projectedCreatedEntries,
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
        error: 'Failed to persist complaint response and status update.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 9. Get Private Complaint Attachment (Authorized Viewers Only)
// ----------------------------------------------------
export async function handleGetComplaintAttachment(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error } = context;
  const config = getAppwriteConfig();
  const serverClients = deps?.databases && deps?.storage ? null : getServerClient();
  const databases = deps?.databases ?? serverClients!.databases;
  const storage = deps?.storage ?? serverClients!.storage;

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const requestedFileId = typeof data.file_id === 'string' ? data.file_id.trim() : '';

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
    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
    } catch {
      return res.json(
        {
          success: false,
          error: 'Attachment not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const complaint = mapDocToComplaint(doc);

    if (caller.role === 'student') {
      const profile = await getCallerProfile(
        databases,
        caller.id,
        config.databaseId,
        config.profilesCollectionId
      );
      if (profile?.role === 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Unauthorized role.',
            code: 'FORBIDDEN',
          },
          403
        );
      }
      if (complaint.student_user_id !== caller.id) {
        return res.json(
          {
            success: false,
            error: 'Attachment not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    } else if (caller.role === 'department_admin') {
      const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
      if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
        return res.json(
          {
            success: false,
            error: 'Attachment not found.',
            code: 'NOT_FOUND',
          },
          404
        );
      }
    } else if (caller.role === 'principal') {
      const profile = await getCallerProfile(
        databases,
        caller.id,
        config.databaseId,
        config.profilesCollectionId
      );
      if (!profile || profile.role !== 'principal') {
        return res.json(
          {
            success: false,
            error: 'Forbidden: Unauthorized role.',
            code: 'FORBIDDEN',
          },
          403
        );
      }
    } else {
      return res.json(
        {
          success: false,
          error: 'Forbidden: Unauthorized role.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const linkedFileId = complaint.attachment_file_id;
    if (!linkedFileId || (requestedFileId && requestedFileId !== linkedFileId)) {
      return res.json(
        {
          success: false,
          error: 'Attachment not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    let fileMeta: Models.File;
    let rawBuffer: ArrayBuffer;
    try {
      fileMeta = await storage.getFile(config.storageBucketId, linkedFileId);
      rawBuffer = await storage.getFileDownload(config.storageBucketId, linkedFileId);
    } catch {
      return res.json(
        {
          success: false,
          error: 'Attachment not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const normalizedMime = (fileMeta.mimeType || '').trim().toLowerCase();
    const bytes = new Uint8Array(rawBuffer);
    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizedMime) ||
      bytes.byteLength <= 0 ||
      bytes.byteLength > MAX_ATTACHMENT_BYTES ||
      !matchesAttachmentMagicBytes(bytes, normalizedMime)
    ) {
      return res.json(
        {
          success: false,
          error: 'Attachment failed server content validation.',
          code: 'INVALID_ATTACHMENT_CONTENT',
        },
        400
      );
    }

    const attachment: ComplaintAttachmentData = {
      file_id: linkedFileId,
      file_name: fileMeta.name || 'attachment',
      mime_type: normalizedMime,
      size_bytes: bytes.byteLength,
      content_base64: Buffer.from(bytes).toString('base64'),
    };

    return res.json(
      {
        success: true,
        data: {
          attachment,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error fetching private attachment for ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to retrieve attachment.',
        code: 'STORAGE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 10. Request Clarification (Maintenance Admin Only)
// ----------------------------------------------------
export async function handleRequestClarification(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const question =
    typeof data.question === 'string'
      ? data.question.trim()
      : typeof data.content === 'string'
      ? data.content.trim()
      : '';

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

  if (question.length < 5 || question.length > 2000) {
    return res.json(
      {
        success: false,
        error: 'Clarification request must be between 5 and 2000 characters.',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    if (caller.role !== 'department_admin') {
      return res.json(
        {
          success: false,
          error: 'Only maintenance department administrators can request clarification.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);
    const authorizedMaintDeptIds = resolveAuthorizedMaintenanceDeptIds(caller);
    if (!authorizedMaintDeptIds.includes(complaint.maintenance_department_id)) {
      return res.json(
        {
          success: false,
          error: 'Complaint not found.',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const clarificationCheck = validateClarificationRequest(complaint.status);
    if (!clarificationCheck.allowed) {
      return res.json(
        {
          success: false,
          error: clarificationCheck.error || 'Cannot request clarification on this complaint.',
          code: clarificationCheck.code || 'COMPLAINT_ALREADY_RESOLVED',
        },
        400
      );
    }

    const maintDept = resolveDepartment(complaint.maintenance_department_id);
    const authorLabel = maintDept?.name
      ? `${maintDept.name} Maintenance Admin`
      : 'Maintenance Admin';

    const now = new Date().toISOString();
    const entryId = ID.unique();

    const timelineDoc = await databases.createDocument(
      config.databaseId,
      config.timelineCollectionId,
      entryId,
      {
        complaint_id: complaintId,
        author_id: caller.id,
        author_role: 'department_admin',
        author_label: authorLabel,
        entry_type: 'clarification_request',
        content: question,
        created_at: now,
      },
      []
    );

    log(`[complaints] Admin ${caller.id} requested clarification on complaint ${complaintId}`);

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'clarification_requested',
        actor_id: caller.id,
        actor_role: 'department_admin',
        target_resource_id: complaintId,
        target_resource_type: 'complaint',
        details: {
          maintenance_department_id: complaint.maintenance_department_id,
          question_preview: question.slice(0, 100),
        },
      },
      log
    );

    const timelineEntry: ComplaintTimeline = {
      $id: timelineDoc.$id,
      complaint_id: complaintId,
      author_id: caller.id,
      author_role: 'department_admin',
      author_label: authorLabel,
      entry_type: 'clarification_request',
      content: question,
      created_at: now,
    };

    return res.json(
      {
        success: true,
        data: {
          timeline_entry: timelineEntry,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error requesting clarification on complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to record clarification request.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

// ----------------------------------------------------
// 11. Reply Clarification (Complaint Creator Only)
// ----------------------------------------------------
export async function handleReplyClarification(
  context: AppwriteContext,
  caller: AuthenticatedCaller,
  data: Record<string, unknown>,
  deps?: ComplaintHandlerDeps
): Promise<unknown> {
  const { res, error, log } = context;
  const config = getAppwriteConfig();
  const databases = deps?.databases ?? getServerClient().databases;

  const complaintId = typeof data.complaint_id === 'string' ? data.complaint_id.trim() : '';
  const reply =
    typeof data.reply === 'string'
      ? data.reply.trim()
      : typeof data.content === 'string'
      ? data.content.trim()
      : '';

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

  if (reply.length < 1 || reply.length > 2000) {
    return res.json(
      {
        success: false,
        error: 'Reply must be between 1 and 2000 characters.',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    if (caller.role !== 'student') {
      return res.json(
        {
          success: false,
          error: 'Only students can reply to clarification requests.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    let doc: Models.Document;
    try {
      doc = await databases.getDocument(
        config.databaseId,
        config.complaintsCollectionId,
        complaintId
      );
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

    const complaint = mapDocToComplaint(doc);

    // Only the creator of the complaint can reply
    if (complaint.student_user_id !== caller.id) {
      return res.json(
        {
          success: false,
          error: 'Only the original complaint author can reply to clarification requests.',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const existingTimeline = await fetchComplaintTimeline(databases, config, complaintId);
    const replyCheck = validateClarificationReply(complaint.status, existingTimeline);
    if (!replyCheck.allowed) {
      return res.json(
        {
          success: false,
          error: replyCheck.error || 'Cannot reply to clarification.',
          code: replyCheck.code || 'NO_ACTIVE_CLARIFICATION_REQUEST',
        },
        400
      );
    }

    const authorLabel = 'Complaint Creator';
    const now = new Date().toISOString();
    const entryId = ID.unique();

    const timelineDoc = await databases.createDocument(
      config.databaseId,
      config.timelineCollectionId,
      entryId,
      {
        complaint_id: complaintId,
        author_id: caller.id,
        author_role: 'student',
        author_label: authorLabel,
        entry_type: 'clarification_reply',
        content: reply,
        created_at: now,
      },
      []
    );

    log(`[complaints] Creator ${caller.id} replied to clarification on complaint ${complaintId}`);

    await appendAuditLog(
      databases,
      config.databaseId,
      config.auditLogsCollectionId,
      {
        action: 'clarification_replied',
        actor_id: caller.id,
        actor_role: 'student',
        target_resource_id: complaintId,
        target_resource_type: 'complaint',
        details: {
          reply_preview: reply.slice(0, 100),
        },
      },
      log
    );

    const timelineEntry: ComplaintTimeline = {
      $id: timelineDoc.$id,
      complaint_id: complaintId,
      author_id: caller.id,
      author_role: 'student',
      author_label: authorLabel,
      entry_type: 'clarification_reply',
      content: reply,
      created_at: now,
    };

    return res.json(
      {
        success: true,
        data: {
          timeline_entry: timelineEntry,
        },
      },
      200
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`[complaints] Error replying to clarification on complaint ${complaintId}: ${msg}`);
    return res.json(
      {
        success: false,
        error: 'Failed to record clarification reply.',
        code: 'DATABASE_ERROR',
      },
      500
    );
  }
}

export { handleGetPrincipalDashboard } from './principal.js';
