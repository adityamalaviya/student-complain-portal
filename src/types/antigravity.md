# Types Module — `src/types`

## Purpose
Contains all authoritative domain and shared TypeScript models for CampusVoice.

## Key Types
- `UserProfile`: Student and admin profile state.
- `Complaint`: Grievance record with status, dual department scopes, optional creator PII (omitted in peer projections), and priority.
- `ComplaintAttachmentData`: Private attachment payload retrieved via authorized Cloud Function execution.
- `ComplaintSupport`: Community voting proof.
- `DepartmentId` / `AcademicDepartmentId` / `MaintenanceDepartmentId` / `EnrollmentMapping`: Canonical department identifier and enrollment mapping types independent of enrollment codes.
- `Department`: Active 6-department directory entries (`dept_civil` Civil, `dept_comp` Computer, `dept_elec` Electrical, `dept_mech` Mechanical, `dept_water` Water, `dept_sanit` Sanitation) without required `code` attribute.
- `ApiResponse<T>`: Uniform envelope for all API calls.
