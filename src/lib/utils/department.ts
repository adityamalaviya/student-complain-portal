/**
 * CampusVoice — Canonical Department & Enrollment Mapping Utility (Day 1)
 * 
 * Strict enforcement of:
 * - Six institutional departments: Computer, Civil, Electrical, Mechanical, Water, Sanitation
 * - Academic departments: Computer, Civil, Electrical, Mechanical (dual academic/maintenance)
 * - Maintenance-only departments: Water, Sanitation (cannot enroll students or approve phone changes)
 * - Enrollment slice: enrollment_no[7:9] (zero-based slice [7:9])
 * - Confirmed mappings: '06' -> Department 1, '07' -> Department 2
 * - Zero guessing of unmapped codes
 */

export interface DepartmentDescriptor {
  id: string;
  code: string;
  name: string;
  is_academic: boolean;
  is_maintenance: boolean;
  is_active: boolean;
}

export const INSTITUTIONAL_DEPARTMENTS: readonly DepartmentDescriptor[] = [
  { id: 'dept_civil', code: '06', name: 'Civil Department', is_academic: true, is_maintenance: true, is_active: true },
  { id: 'dept_comp', code: '07', name: 'Computer Department', is_academic: true, is_maintenance: true, is_active: true },
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
  mapping: EnrollmentMapping | null;
  error: string | null;
}

export function extractAndMapEnrollment(enrollmentNo: string): EnrollmentExtractionResult {
  const trimmed = enrollmentNo ? enrollmentNo.trim() : '';
  if (!/^\d{12}$/.test(trimmed)) {
    return {
      isValid: false,
      code: null,
      departmentId: null,
      departmentName: null,
      mapping: null,
      error: 'Enrollment number must be exactly 12 numeric digits',
    };
  }

  // Zero-based slice [7:9] extracts characters 8 and 9
  const code = trimmed.slice(7, 9);
  const mapping = ENROLLMENT_CODE_MAPPINGS[code];

  if (!mapping) {
    return {
      isValid: false,
      code,
      departmentId: null,
      departmentName: null,
      mapping: null,
      error: `Unmapped enrollment department code '${code}'. Department mappings must never be guessed.`,
    };
  }

  return {
    isValid: true,
    code,
    departmentId: mapping.department_id,
    departmentName: mapping.department_name,
    mapping,
    error: null,
  };
}

export function isAcademicDepartment(departmentId: string): boolean {
  const dept = INSTITUTIONAL_DEPARTMENTS.find(
    (d) => d.id === departmentId || d.code === departmentId || d.name.toLowerCase() === departmentId.toLowerCase()
  );
  return dept ? dept.is_academic : false;
}

export function isMaintenanceDepartment(departmentId: string): boolean {
  const dept = INSTITUTIONAL_DEPARTMENTS.find(
    (d) => d.id === departmentId || d.code === departmentId || d.name.toLowerCase() === departmentId.toLowerCase()
  );
  return dept ? dept.is_maintenance : false;
}

export function canApprovePhoneChange(departmentId: string, scope: string): boolean {
  if (scope !== 'academic') {
    return false;
  }
  return isAcademicDepartment(departmentId);
}

const DEPARTMENT_ALIASES: Record<string, string> = {
  water: 'dept_water',
  sanitation: 'dept_sanit',
};

/**
 * Resolves a department descriptor from canonical ID, department code, or name.
 * Never guesses unmapped enrollment codes.
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
 * Returns the 4 academic departments (Computer, Civil, Electrical, Mechanical).
 */
export function getAcademicDepartments(): readonly DepartmentDescriptor[] {
  return INSTITUTIONAL_DEPARTMENTS.filter((d) => d.is_academic && d.is_active);
}

/**
 * Returns all 6 maintenance departments (including Water and Sanitation).
 */
export function getMaintenanceDepartments(): readonly DepartmentDescriptor[] {
  return INSTITUTIONAL_DEPARTMENTS.filter((d) => d.is_maintenance && d.is_active);
}

