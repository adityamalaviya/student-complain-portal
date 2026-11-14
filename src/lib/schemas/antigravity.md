# Schemas Module — `src/lib/schemas`

## Purpose
Zod validation schemas for all user inputs across onboarding, complaint submission, and administrative resolutions.

## Schemas
- `PhoneNumberSchema`: 10-digit Indian mobile number validation (`/^[6-9]\d{9}$/`).
- `EnrollmentNumberSchema`: 12-digit numeric constraint with characters 8–9 zero-based slice (`[7:9]`) mapping only confirmed academic codes (`06`→`dept_civil`, `07`→`dept_comp`, `09`→`dept_elec`, `19`→`dept_mech`; zero codes for Water/Sanitation).
- `DepartmentIdSchema` / `AcademicDepartmentIdSchema` / `MaintenanceDepartmentIdSchema` / `EnrollmentMappingSchema` / `DepartmentSchema`: Canonical ID validation without required `code` attribute on `Department`.
- `OnboardingSchema` / `StrictOnboardingSchema`: Name, enrollment number, and mandatory phone number validation.
- `ComplaintCreateSchema`: Title, active maintenance department ID, location, description, priority, and validated optional `attachment_file_id` format (no public `issue_type`).
- `AdminResolutionSchema`: Status (`Pending`, `In Progress`, `Resolved`), official response, and optional `is_substantive` / `entry_type` validation.
