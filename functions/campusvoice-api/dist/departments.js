export const PHONE_NUMBER_REGEX = /^[6-9]\d{9}$/;
export const STUDENT_NAME_REGEX = /^[a-zA-Z\s.'-]+$/;
export const INSTITUTIONAL_DEPARTMENTS = [
    { id: 'dept_comp', code: '07', name: 'Computer Department', is_academic: true, is_maintenance: true, is_active: true },
    { id: 'dept_civil', code: '06', name: 'Civil Department', is_academic: true, is_maintenance: true, is_active: true },
    { id: 'dept_elec', code: '03', name: 'Electrical Department', is_academic: true, is_maintenance: true, is_active: true },
    { id: 'dept_mech', code: '04', name: 'Mechanical Department', is_academic: true, is_maintenance: true, is_active: true },
    { id: 'dept_water', code: '05', name: 'Water Department', is_academic: false, is_maintenance: true, is_active: true },
    { id: 'dept_sanit', code: '08', name: 'Sanitation Department', is_academic: false, is_maintenance: true, is_active: true },
];
export const ENROLLMENT_CODE_MAPPINGS = {
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
/**
 * Extracts enrollment department code via zero-based slice [7:9] (characters 8-9)
 * and resolves only confirmed institutional mappings. Unmapped codes are rejected.
 */
export function extractAndMapEnrollment(enrollmentNo) {
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
const DEPARTMENT_ALIASES = {
    water: 'dept_water',
    sanitation: 'dept_sanit',
};
/**
 * Resolves a canonical department descriptor from ID, code, or name.
 */
export function resolveDepartment(identifier) {
    if (!identifier) {
        return null;
    }
    const trimmed = identifier.trim();
    if (!trimmed) {
        return null;
    }
    const lower = trimmed.toLowerCase();
    const aliasedId = DEPARTMENT_ALIASES[lower];
    return (INSTITUTIONAL_DEPARTMENTS.find((d) => d.id === trimmed ||
        d.id === aliasedId ||
        d.code === trimmed ||
        d.name.toLowerCase() === lower) || null);
}
/**
 * Checks if a department identifier belongs to an active academic department.
 */
export function isAcademicDepartment(identifier) {
    const dept = resolveDepartment(identifier);
    return Boolean(dept && dept.is_academic && dept.is_active);
}
/**
 * Checks if a department identifier belongs to an active maintenance department.
 */
export function isMaintenanceDepartment(identifier) {
    const dept = resolveDepartment(identifier);
    return Boolean(dept && dept.is_maintenance && dept.is_active);
}
/**
 * Converts a descriptor to the API Department representation.
 */
export function toDepartmentModel(dept) {
    return {
        $id: dept.id,
        code: dept.code,
        name: dept.name,
        is_academic: dept.is_academic,
        is_maintenance: dept.is_maintenance,
        is_active: dept.is_active,
    };
}
const STATUS_MAP = {
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
export function normalizeComplaintStatus(status) {
    if (typeof status !== 'string') {
        return null;
    }
    return STATUS_MAP[status.trim()] ?? null;
}
/**
 * Safely reads a string field from an Appwrite document without unsafe casts.
 */
export function readStringField(doc, key) {
    const val = doc[key];
    return typeof val === 'string' ? val : '';
}
/**
 * Safely reads a boolean field from an Appwrite document.
 */
export function readBooleanField(doc, key) {
    const val = doc[key];
    return typeof val === 'boolean' ? val : undefined;
}
/**
 * Safely reads a number field from an Appwrite document.
 */
export function readNumberField(doc, key) {
    const val = doc[key];
    return typeof val === 'number' ? val : undefined;
}
