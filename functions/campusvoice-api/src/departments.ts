import type { Models } from 'node-appwrite';
import type { ComplaintStatus, Department } from './types.js';

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
  id: string;
  code: string;
  name: string;
  is_academic: boolean;
  is_maintenance: boolean;
  is_active: boolean;
}

export const INSTITUTIONAL_DEPARTMENTS: readonly DepartmentDescriptor[] = [
  { id: 'dept_comp', code: '07', name: 'Computer Department', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_civil', code: '06', name: 'Civil Department', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_elec', code: '03', name: 'Electrical Department', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_mech', code: '04', name: 'Mechanical Department', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_water', code: '05', name: 'Water Department', is_academic: false, is_maintenance: true, is_active: true },
  { id: 'dept_sanit', code: '08', name: 'Sanitation Department', is_academic: false, is_maintenance: true, is_active: true },
] as const;

export interface EnrollmentMapping {
  department_slot: string;
  department_id: string;
  department_name: string;
  confirmed: boolean;
}

export const ENROLLMENT_CODE_MAPPINGS: Record<string, EnrollmentMapping> = {
  '06': {
    department_slot: 'Department 1',
    department_id: 'dept_civil',
    department_name: 'Civil Department',
    confirmed: true,
  },
  '07': {
    department_slot: 'Department 2',
    department_id: 'dept_comp',
    department_name: 'Computer Department',
    confirmed: true,
  },
};

export interface EnrollmentExtractionResult {
  isValid: boolean;
  code: string | null;
  departmentId: string | null;
  departmentName: string | null;
  error: string | null;
}

/**
 * Extracts enrollment department code via zero-based slice [7:9] (characters 8-9)
 * and resolves only confirmed institutional mappings. Unmapped codes are rejected.
 */
export function extractAndMapEnrollment(enrollmentNo: string): EnrollmentExtractionResult {
  const trimmed = enrollmentNo ? enrollmentNo.trim() : '';
  if (!/^\d{12}$/.test(trimmed)) {
    return {
      isValid: false,
      code: null,
      departmentId: null,
      departmentName: null,
      error: 'Enrollment number must be exactly 12 numeric digits.',
    };
  }

  const code = trimmed.slice(7, 9);
  const mapping = ENROLLMENT_CODE_MAPPINGS[code];
  if (!mapping) {
    return {
      isValid: false,
      code,
      departmentId: null,
      departmentName: null,
      error: `Enrollment department code '${code}' is unmapped or unconfirmed in institutional records. Unmapped codes cannot be assigned automatically.`,
    };
  }

  return {
    isValid: true,
    code,
    departmentId: mapping.department_id,
    departmentName: mapping.department_name,
    error: null,
  };
}

const DEPARTMENT_ALIASES: Record<string, string> = {
  water: 'dept_water',
  sanitation: 'dept_sanit',
};

/**
 * Resolves a canonical department descriptor from ID, code, or name.
 */
export function resolveDepartment(identifier?: string | null): DepartmentDescriptor | null {
  if (!identifier) {
    return null;
  }
  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }
  const lower = trimmed.toLowerCase();
  const aliasedId = DEPARTMENT_ALIASES[lower];

  return (
    INSTITUTIONAL_DEPARTMENTS.find(
      (d) =>
        d.id === trimmed ||
        d.id === aliasedId ||
        d.code === trimmed ||
        d.name.toLowerCase() === lower
    ) || null
  );
}

/**
 * Checks if a department identifier belongs to an active academic department.
 */
export function isAcademicDepartment(identifier?: string | null): boolean {
  const dept = resolveDepartment(identifier);
  return Boolean(dept && dept.is_academic && dept.is_active);
}

/**
 * Checks if a department identifier belongs to an active maintenance department.
 */
export function isMaintenanceDepartment(identifier?: string | null): boolean {
  const dept = resolveDepartment(identifier);
  return Boolean(dept && dept.is_maintenance && dept.is_active);
}

/**
 * Converts a descriptor to the API Department representation.
 */
export function toDepartmentModel(dept: DepartmentDescriptor): Department {
  return {
    $id: dept.id,
    code: dept.code,
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
