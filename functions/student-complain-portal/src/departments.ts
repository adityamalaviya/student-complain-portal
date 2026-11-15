import type { Models } from 'node-appwrite';
import type {
  AcademicDepartmentId,
  ComplaintStatus,
  Department,
  DepartmentId,
  EnrollmentMapping,
} from './types.js';

export const PHONE_NUMBER_REGEX = /^[6-9]\d{9}$/;
export const STUDENT_NAME_REGEX = /^[a-zA-Z\s.'-]+$/;

export interface DatabaseClientLike {
  listDocuments(
    databaseId: string,
    collectionId: string,
    queries?: string[]
  ): Promise<Models.DocumentList<Models.Document>>;
  getDocument(
    databaseId: string,
    collectionId: string,
    documentId: string,
    queries?: string[]
  ): Promise<Models.Document>;
  createDocument(
    databaseId: string,
    collectionId: string,
    documentId: string,
    data: Record<string, unknown>,
    permissions?: string[]
  ): Promise<Models.Document>;
  updateDocument(
    databaseId: string,
    collectionId: string,
    documentId: string,
    data?: Record<string, unknown>,
    permissions?: string[]
  ): Promise<Models.Document>;
  deleteDocument?(
    databaseId: string,
    collectionId: string,
    documentId: string
  ): Promise<unknown>;
}

export interface StorageClientLike {
  getFile(bucketId: string, fileId: string): Promise<Models.File>;
  getFileDownload(bucketId: string, fileId: string): Promise<ArrayBuffer>;
  updateFile(
    bucketId: string,
    fileId: string,
    name?: string,
    permissions?: string[]
  ): Promise<Models.File>;
}

export interface DepartmentDescriptor {
  id: DepartmentId;
  name: string;
  is_academic: boolean;
  is_maintenance: boolean;
  is_active: boolean;
}

export const INSTITUTIONAL_DEPARTMENTS: readonly DepartmentDescriptor[] = [
  { id: 'dept_civil', name: 'Civil', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_comp', name: 'Computer', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_elec', name: 'Electrical', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_mech', name: 'Mechanical', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_water', name: 'Water', is_academic: false, is_maintenance: true, is_active: true },
  { id: 'dept_sanit', name: 'Sanitation', is_academic: false, is_maintenance: true, is_active: true },
] as const;

export const ENROLLMENT_CODE_MAPPINGS: Record<string, EnrollmentMapping> = {
  '06': {
    enrollment_code: '06',
    department_id: 'dept_civil',
    confirmed: true,
  },
  '07': {
    enrollment_code: '07',
    department_id: 'dept_comp',
    confirmed: true,
  },
  '09': {
    enrollment_code: '09',
    department_id: 'dept_elec',
    confirmed: true,
  },
  '19': {
    enrollment_code: '19',
    department_id: 'dept_mech',
    confirmed: true,
  },
};

export interface EnrollmentExtractionResult {
  isValid: boolean;
  code: string | null;
  departmentId: AcademicDepartmentId | null;
  departmentName: string | null;
  mapping: EnrollmentMapping | null;
  error: string | null;
}

/**
 * Resolves a canonical department descriptor strictly by internal department ID.
 * Never resolves enrollment codes or water/sanitation aliases.
 */
export function resolveDepartment(
  identifier?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): DepartmentDescriptor | null {
  if (!identifier) {
    return null;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  return registry.find((d) => d.id === trimmed) || null;
}

/**
 * Resolves a 2-digit enrollment code to a confirmed, active academic department.
 */
export function resolveEnrollmentCode(
  code: string,
  mappings: Readonly<Record<string, EnrollmentMapping>> = ENROLLMENT_CODE_MAPPINGS,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): { mapping: EnrollmentMapping; department: DepartmentDescriptor } | null {
  const trimmedCode = code.trim();
  if (!/^\d{2}$/.test(trimmedCode)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(mappings, trimmedCode)) {
    return null;
  }
  const mapping = mappings[trimmedCode];
  if (!mapping || mapping.confirmed !== true || !mapping.department_id) {
    return null;
  }
  const department = registry.find((d) => d.id === mapping.department_id);
  if (!department || !department.is_academic || !department.is_active) {
    return null;
  }
  return { mapping, department };
}

/**
 * Extracts enrollment department code via zero-based slice [7:9] (characters 8-9)
 * and resolves only confirmed active academic mappings. Unmapped or invalid codes are rejected.
 */
export function extractAndMapEnrollment(
  enrollmentNo: string,
  mappings: Readonly<Record<string, EnrollmentMapping>> = ENROLLMENT_CODE_MAPPINGS,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): EnrollmentExtractionResult {
  const trimmed = enrollmentNo ? enrollmentNo.trim() : '';
  if (!/^\d{12}$/.test(trimmed)) {
    return {
      isValid: false,
      code: null,
      departmentId: null,
      departmentName: null,
      mapping: null,
      error: 'Enrollment number must be exactly 12 numeric digits.',
    };
  }

  const code = trimmed.slice(7, 9);
  const resolved = resolveEnrollmentCode(code, mappings, registry);
  if (!resolved) {
    return {
      isValid: false,
      code,
      departmentId: null,
      departmentName: null,
      mapping: null,
      error: `Unmapped, unconfirmed, or inactive enrollment department code '${code}'. Department mappings must never be guessed.`,
    };
  }

  return {
    isValid: true,
    code,
    departmentId: resolved.mapping.department_id,
    departmentName: resolved.department.name,
    mapping: resolved.mapping,
    error: null,
  };
}

/**
 * Checks if a department ID belongs to an active academic department.
 */
export function isAcademicDepartment(
  identifier?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): boolean {
  const dept = resolveDepartment(identifier, registry);
  return Boolean(dept && dept.is_academic && dept.is_active);
}

/**
 * Checks if a department ID belongs to an active maintenance department.
 */
export function isMaintenanceDepartment(
  identifier?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): boolean {
  const dept = resolveDepartment(identifier, registry);
  return Boolean(dept && dept.is_maintenance && dept.is_active);
}

export function canApprovePhoneChange(
  departmentId?: string | null,
  scope?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): boolean {
  if (scope !== 'academic') {
    return false;
  }
  return isAcademicDepartment(departmentId, registry);
}

export function getAcademicDepartments(
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): readonly DepartmentDescriptor[] {
  return registry.filter((d) => d.is_academic && d.is_active);
}

export function getMaintenanceDepartments(
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): readonly DepartmentDescriptor[] {
  return registry.filter((d) => d.is_maintenance && d.is_active);
}

/**
 * Translates a confirmed legacy enrollment code ('06', '07', '09', '19') only when
 * reading unmigrated pre-recovery DB documents that lack canonical department IDs.
 */
export function resolveLegacyDepartmentCode(code?: string | null): DepartmentDescriptor | null {
  if (!code) {
    return null;
  }
  const resolved = resolveEnrollmentCode(code);
  return resolved ? resolved.department : null;
}

/**
 * Converts a descriptor to the API Department representation.
 */
export function toDepartmentModel(dept: DepartmentDescriptor): Department {
  return {
    $id: dept.id,
    name: dept.name,
    is_academic: dept.is_academic,
    is_maintenance: dept.is_maintenance,
    is_active: dept.is_active,
  };
}

const STATUS_MAP: Record<string, 'Pending' | 'In Progress' | 'Resolved'> = {
  Pending: 'Pending',
  pending: 'Pending',
  open: 'Pending',
  'In Progress': 'In Progress',
  in_progress: 'In Progress',
  Resolved: 'Resolved',
  resolved: 'Resolved',
};

/**
 * Normalizes canonical and legacy complaint status values.
 */
export function normalizeComplaintStatus(
  status: unknown
): 'Pending' | 'In Progress' | 'Resolved' | null {
  if (typeof status !== 'string') {
    return null;
  }
  return STATUS_MAP[status.trim()] ?? null;
}

/**
 * Safely reads a string field from an Appwrite document without unsafe casts.
 */
export function readStringField(doc: Models.Document, key: string): string {
  const val: unknown = doc[key];
  return typeof val === 'string' ? val : '';
}

/**
 * Safely reads a boolean field from an Appwrite document.
 */
export function readBooleanField(doc: Models.Document, key: string): boolean | undefined {
  const val: unknown = doc[key];
  return typeof val === 'boolean' ? val : undefined;
}

/**
 * Safely reads a number field from an Appwrite document.
 */
export function readNumberField(doc: Models.Document, key: string): number | undefined {
  const val: unknown = doc[key];
  return typeof val === 'number' ? val : undefined;
}

export type CanonicalComplaintStatus = Extract<
  ComplaintStatus,
  'Pending' | 'In Progress' | 'Resolved'
>;

export interface ComplaintDelayInfo {
  is_delayed: boolean;
  days_delayed: number;
  delay_anchor: string;
  reason?: string;
}

export const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Calculates five-day complaint delay eligibility according to canonical rules:
 * - Pending complaints become eligible after > 5 days since creation/entering Pending.
 * - In Progress complaints become eligible after > 5 days since last meaningful status change
 *   or substantive progress update (tracked via last_meaningful_update_at).
 * - Resolved complaints are completely excluded.
 */
export function calculateComplaintDelay(
  complaint: {
    status: string;
    created_at?: string;
    $createdAt?: string;
    last_meaningful_update_at?: string;
    updated_at?: string;
  },
  referenceTime: Date | number = new Date()
): ComplaintDelayInfo {
  const status = normalizeComplaintStatus(complaint.status);
  const refMs = typeof referenceTime === 'number' ? referenceTime : referenceTime.getTime();

  if (!status || status === 'Resolved') {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: '',
    };
  }

  let anchorStr = '';
  let reason = '';

  if (status === 'Pending') {
    anchorStr = complaint.created_at || complaint.$createdAt || '';
    reason = 'Complaint pending resolution for more than 5 days without initial response.';
  } else if (status === 'In Progress') {
    // In Progress: anchor is last_meaningful_update_at, falling back to created_at
    anchorStr =
      complaint.last_meaningful_update_at ||
      complaint.created_at ||
      complaint.$createdAt ||
      '';
    reason = 'Complaint in progress for more than 5 days without a substantive progress update.';
  }

  if (!anchorStr) {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: '',
    };
  }

  const anchorTime = new Date(anchorStr).getTime();
  if (isNaN(anchorTime)) {
    return {
      is_delayed: false,
      days_delayed: 0,
      delay_anchor: anchorStr,
    };
  }

  const elapsedMs = refMs - anchorTime;
  const daysDelayed = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  const isDelayed = elapsedMs > FIVE_DAYS_MS;

  return {
    is_delayed: isDelayed,
    days_delayed: daysDelayed,
    delay_anchor: anchorStr,
    reason: isDelayed ? reason : undefined,
  };
}
