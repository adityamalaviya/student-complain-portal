# Types Module — `src/types`

## Purpose
Contains all authoritative domain and shared TypeScript models for CampusVoice.

## Key Types
- `UserProfile`: Student and admin profile state.
- `Complaint`: Grievance record with status, dual department scopes, optional creator PII (omitted in peer projections), and priority.
- `ComplaintAttachmentData`: Private attachment payload retrieved via authorized Cloud Function execution.
- `ComplaintSupport`: Community voting proof.
- `Department`: Active 6-department directory entries (`Computer`, `Civil`, `Electrical`, `Mechanical`, `Water`, `Sanitation`).
- `ApiResponse<T>`: Uniform envelope for all API calls.
