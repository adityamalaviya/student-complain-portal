# CampusVoice — Data Schema

## 1. Overview
Initial release uses Appwrite Cloud Database with four logical collections:
- `departments`
- `profiles`
- `complaints`
- `complaint_supports`

Use Appwrite document permissions conservatively. Appwrite Functions must enforce business authorization as well; collection permissions alone may not express every rule.

## 2. Departments Collection
Suggested fields:
- `code`: string, unique application-level value; initial codes `06` and `07`
- `name`: string
- `is_active`: boolean
- `created_at`: datetime

Initial records are placeholders until department names are supplied:
- code `06` → department name pending confirmation
- code `07` → department name pending confirmation

Do not treat the numeric code itself as the character position in an enrollment number.

## 3. Profiles Collection
Suggested fields:
- `auth_user_id`: string, unique Appwrite authenticated user ID
- `email`: string
- `display_name`: string
- `enrollment_no`: string, unique once verified
- `department_code`: string, references an active department code
- `role`: enum/string (`student`, `department_admin`)
- `profile_status`: enum/string (`incomplete`, `pending_verification`, `complete`, `rejected`)
- `created_at`: datetime
- `updated_at`: datetime

Rules:
- `auth_user_id` is sourced from verified Appwrite identity, not request input.
- `role` is assigned by a trusted provisioning process.
- `department_code` is server-assigned and cannot be changed by a student.
- Enrollment number is a string to preserve leading zeros.
- Extract the department code from characters 8–9 (1-based indexing, zero-based slice `[7:9]`). Test against official examples and validate the full enrollment format before production.
- Store only fields necessary for the product.

## 4. Complaints Collection
Suggested fields:
- `title`: string, required, bounded length
- `title`: string, required, bounded length
- `location`: string, required, bounded length
- `description`: string, required, bounded length
- `priority`: enum/string (`low`, `medium`, `high`)
- `attachment_file_id`: string or null, optional; store only a validated Appwrite Storage file ID (or the project-approved storage reference)
- `category`: string or enum, required
- `issue_type`: enum/string (`department`, `public`)
- `department_code`: string or null
- `created_by`: string, authenticated profile ID
- `status`: enum/string (`Pending`, `In Progress`, `Resolved`)
- `admin_response`: string or null
- `created_at`: datetime
- `updated_at`: datetime

Rules:
- For `department`, `department_code` is the creator's trusted assigned department.
- For `public`, `department_code` is null unless a separate ownership model is explicitly chosen.
- The client cannot set `created_by` to another user.
- Public visibility is determined by `issue_type`, not by copying the same complaint into each department.
- Validate status changes and administrative responses inside Appwrite Functions.

## 5. Complaint Supports Collection
Suggested fields:
- `complaint_id`: string, required
- `user_id`: string, required authenticated profile ID
- `created_at`: datetime

Invariant:
- There must be at most one support record for each `(complaint_id, user_id)` pair.
- Use a unique composite key if supported; otherwise create a deterministic document ID from a safe, stable representation of complaint and user IDs, or use an atomic mechanism supported by the chosen Appwrite version.
- Test concurrent support requests. A query-then-create sequence without atomic uniqueness is insufficient by itself.
- Count support records for the complaint, excluding duplicates by design.
- Do not store an editable client-controlled counter as the source of truth.

## 6. Relationships
- One department has many student profiles.
- One profile can create many complaints.
- One complaint can have many support records.
- One student can support many complaints.
- A student can support a particular complaint at most once.
- A public complaint is shared across active departments and is stored only once.

## 7. Authorization Rules
### Student
- Read their own profile.
- Update only permitted profile fields such as display name, if supported.
- Cannot change role, enrollment verification state, or department.
- Read department complaints for their assigned department and all public complaints.
- Create complaints as themselves.
- Create support records as themselves only for visible/eligible complaints.

### Department administrator
- Read their own admin profile.
- Read and update complaints for their assigned department.
- Read and update Public Issues.
- Cannot manage another department's private complaints.
- Cannot promote themselves or change their assigned department.

### Trusted Appwrite Functions
- Performs protected operations after verifying identity and role.
- Uses Function-only server credentials with least-privilege scopes only when necessary.
- Must apply explicit authorization checks before querying or mutating data.

## 8. Indexes and Query Considerations
Create indexes supported by the current Appwrite Database version for:
- department code and active status
- profile auth user ID
- enrollment number
- complaint issue type, department code, status, created time
- support complaint ID and user ID

Confirm current Appwrite limits and index syntax during implementation. Use pagination and avoid loading the entire complaint collection for counts.

## 9. Migration to Five Departments
The data model already supports more than two departments. Expansion requires:
- Add three department records and confirmed codes.
- Provision three additional admin profiles.
- Add the verified enrollment mapping rules for all five codes.
- Update tests and onboarding copy.
- Do not duplicate Public Issues into separate department-specific complaint documents.


## Complaint validation and attachments

- `title`, `location`, `description`, and `priority` are required.
- `priority` accepts only `low`, `medium`, or `high`.
- Attachment is optional. Enforce allowed MIME types/extensions and a configured maximum size; do not trust browser-provided MIME metadata alone.
- Student name, enrollment number, and department shown on the form are display-only. The create-complaint Function derives them from the authenticated user's profile; do not persist client-submitted values as authoritative identity data.
- Complaint status is initialized by the backend to `Pending`; the student cannot submit a status value.

## Profile identity immutability

After the first successful profile save, student-facing update operations must not change the saved `name` or `enrollment_number`. Enforce this in server-side business logic. Corrections require a separate authorized workflow. `Rahul` and `246510307054` are not defaults and must not be seeded for every student.
