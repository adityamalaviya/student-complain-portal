# Types Module — `src/types`

## Purpose
Contains all authoritative domain and shared TypeScript models for CampusVoice.

## Key Types
- `UserProfile`: Student and admin profile state.
- `Complaint`: Grievance record with status, department, and priority.
- `ComplaintSupport`: Community voting proof.
- `Department`: Active department codes (`06` = Civil, `07` = Computer).
- `ApiResponse<T>`: Uniform envelope for all API calls.
