# Schemas Module — `src/lib/schemas`

## Purpose
Zod validation schemas for all user inputs across onboarding, complaint submission, and administrative resolutions.

## Schemas
- `PhoneNumberSchema`: 10-digit Indian mobile number validation (`/^[6-9]\d{9}$/`).
- `EnrollmentNumberSchema`: 12-digit numeric constraint with characters 8–9 zero-based slice (`[7:9]`) mapping only confirmed codes (`06` Civil, `07` Computer).
- `OnboardingSchema` / `StrictOnboardingSchema`: Name, enrollment number, and mandatory phone number validation.
- `ComplaintCreateSchema`: Title, active maintenance department ID, location, description, priority, and validated optional `attachment_file_id` format (no public `issue_type`).
- `AdminResolutionSchema`: Status and official response validation.
