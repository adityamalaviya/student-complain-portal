import type { AcademicDepartmentId, DepartmentId, EnrollmentMapping } from '../../types';

/**
 * CampusVoice — Canonical Department & Enrollment Mapping Registry
 *
 * Strict enforcement of:
 * - Six institutional departments: Civil, Computer, Electrical, Mechanical, Water, Sanitation
 * - Academic departments (4): Civil, Computer, Electrical, Mechanical (dual academic/maintenance)
 * - Maintenance-only departments (2): Water, Sanitation (never assigned enrollment codes or academic scope)
 * - Enrollment slice: enrollment_no[7:9] (zero-based slice [7:9])
 * - Confirmed academic mappings: '06' -> dept_civil, '07' -> dept_comp, '09' -> dept_elec, '19' -> dept_mech
 * - Zero guessing of unmapped or unconfirmed codes
 */

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
 * and resolves only confirmed active academic mappings. Unknown/invalid mappings are rejected.
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

  // Zero-based slice [7:9] extracts characters 8 and 9
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
  departmentId?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): boolean {
  const dept = resolveDepartment(departmentId, registry);
  return Boolean(dept && dept.is_academic && dept.is_active);
}

/**
 * Checks if a department ID belongs to an active maintenance department.
 */
export function isMaintenanceDepartment(
  departmentId?: string | null,
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): boolean {
  const dept = resolveDepartment(departmentId, registry);
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

/**
 * Returns the 4 active academic departments (Civil, Computer, Electrical, Mechanical).
 */
export function getAcademicDepartments(
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): readonly DepartmentDescriptor[] {
  return registry.filter((d) => d.is_academic && d.is_active);
}

/**
 * Returns all active maintenance departments (including Water and Sanitation).
 */
export function getMaintenanceDepartments(
  registry: readonly DepartmentDescriptor[] = INSTITUTIONAL_DEPARTMENTS
): readonly DepartmentDescriptor[] {
  return registry.filter((d) => d.is_maintenance && d.is_active);
}

