# Schemas Module — `src/lib/schemas`

## Purpose
Zod validation schemas for all user inputs across onboarding, complaint submission, and administrative resolutions.

## Schemas
- `EnrollmentNumberSchema`: 12-digit numeric constraint with characters 8–9 zero-based slice (`[7:9]`) mapping to `06` (Civil) or `07` (Computer).
- `OnboardingSchema`: Name and enrollment number validation.
- `ComplaintCreateSchema`: Title, location, description, priority, and issue type validation.
- `AdminResolutionSchema`: Status and official response validation.
