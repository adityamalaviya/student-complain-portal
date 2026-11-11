# CampusVoice — Database Schema Specification (Updated)

**Version:** 2.0.0  
**Date:** 10 November 2026  
**Status:** Target schema; not yet a migration instruction


## Authoritative product rules (effective 10 November 2026)

### Stack
- Frontend: Next.js App Router + TypeScript.
- Authentication: Appwrite Cloud Auth with Google OAuth.
- Database: Appwrite Cloud Database.
- Backend: Appwrite Cloud Functions only.
- Frontend hosting: Vercel.
- Design source: Stitch MCP.
- Do not introduce FastAPI, another backend service, or a Super Admin role.

### Departments and jurisdiction
Six departments exist:
1. Computer
2. Civil
3. Electrical
4. Mechanical
5. Water
6. Sanitation

Computer, Civil, Electrical, and Mechanical are academic and maintenance departments. Water and Sanitation are maintenance-only.

Keep separate identifiers:
- `student_department_id`: the student's academic department and peer-visibility jurisdiction.
- `maintenance_department_id`: the department responsible for resolving a complaint.

Enrollment department code is extracted only from characters 8–9 using `enrollment_no[7:9]` (zero-based slice `[7:9]`). Known code mappings are `06` → Department 1 and `07` → Department 2. Official names/mappings for those codes and all remaining codes must be confirmed against institutional records before configuration. Never infer or invent mappings. Unmapped codes are rejected or routed to a controlled pending-verification state without assigning a department.

### Roles and permissions
Exactly three main roles: Student, Department Admin, Principal. Selected existing accounts may receive explicit additional system-management permission grants; grants must be server-enforced, auditable, and revocable. No Super Admin role.

Department Admin has a scoped assignment. Maintenance Admin manages complaints routed to their maintenance department. A student's academic Department Admin handles that student's phone-change request. Water and Sanitation Admins cannot approve student phone changes.

Principal can monitor all six departments, view authorized complaint/student details, see metrics/history/delays, issue manual warnings on eligible unresolved complaints, review admin warning responses, manage departments/admin assignments/accounts/permissions/settings, and inspect audit/security history. Principal cannot change complaint status and cannot warn on resolved complaints.

### Student onboarding and phone profile
First login collects student name, enrollment number, and phone number. Name and enrollment number lock after saving. Phone number locks after saving except through the approved phone-change workflow. Phone validation is exactly 10 digits and begins with 6, 7, 8, or 9. Validate server-side. Format validation does not establish ownership.

Phone-change workflow: student requests change through their own academic Department Admin; admin approves/rejects; approval grants a one-time update permission; old number remains active until successful save; permission is consumed only after successful database save; invalid input, network failure, or database failure must not consume permission; audit request, decision, and outcome.

### Complaints
A student can file a complaint to any of the six maintenance departments. Fields: title, maintenance department, location, description, priority (Low/Medium/High), optional attachment. Attachment max 5 MB; allowed PDF/JPG/JPEG/PNG only; verify actual file existence, ownership, MIME/type, size, and private access server-side. Public complaint functionality is removed completely.

Original complaint record is immutable after creation. Statuses are Pending, In Progress, Resolved. The concerned Maintenance Department Admin alone changes status. Admin official responses, substantive progress updates, clarification requests, and student replies are separate append-only timeline entries.

### Visibility and privacy
Students see complaints created by students from their own academic department, regardless of the selected maintenance department. Peer visibility is based only on `student_department_id`. The complaint's `maintenance_department_id` determines which Maintenance Admin manages it.

Peer students must not receive creator name, enrollment number, phone number, or private attachment references/URLs. Creator can see their own full complaint. Concerned Maintenance Admin and Principal can see full details within authorization. Never rely on frontend hiding; project sensitive fields out of backend responses.

### Support
Initial support count is 1 (creator baseline). Creator cannot support own complaint. Only same-academic-department students may support. One active support per student per complaint. Student may remove their support and support again later. Displayed count is `1 + active support records`; do not trust or increment a client-provided count. Prevent duplicate active records and handle concurrent requests safely.

### Delay and warnings
Pending complaints become warning-eligible after more than five days in Pending. In Progress complaints become eligible after more than five days since the last meaningful status change or substantive progress update. Minor edits, views, refreshes, and unrelated actions do not reset the timer. Resolved complaints are excluded. Principal issues manual warnings; multiple warnings may be issued while a complaint remains unresolved.

### Security and audit
Authenticate and authorize every protected backend operation. Derive identity, role, academic department, maintenance assignment, support count, and permissions from trusted server-side records. Protect against IDOR, privilege escalation, cross-department leakage, attachment access abuse, and secret exposure. Append-only audit history must cover complaint lifecycle, support add/remove, timeline/clarification, warnings/responses, phone-change workflow, admin assignments, role/permission changes, and settings changes. Normal users/admins cannot modify or delete audit history through application operations.


## 1. Modeling principles
- Use stable department document IDs; do not overload a code string as a display name.
- Profiles store `student_department_id` separately from any admin assignment.
- Complaints store `student_department_id` and `maintenance_department_id`.
- Keep creator identity in trusted complaint data for authorized access, but always redact it from peer API projections.
- Original complaint content is immutable.
- Timeline is authoritative for lifecycle events.
- Support count is a derived invariant: one creator baseline plus active support records.

## 2. Collections

### `departments`
Suggested attributes:
- `$id`
- `code` (unique string; only confirmed mappings enabled)
- `name`
- `is_academic` (boolean)
- `is_maintenance` (boolean)
- `is_active` (boolean)
- timestamps

Computer/Civil/Electrical/Mechanical: both flags true. Water/Sanitation: academic false, maintenance true.

### `profiles`
- `user_id` (unique)
- `email`
- `name`
- `enrollment_no` (unique for students)
- `student_department_id` (nullable for non-students)
- `phone_number` (student profile)
- `role` (`student`, `department_admin`, `principal`)
- `profile_status`
- `name_locked`
- `enrollment_locked`
- `phone_locked`
- timestamps

Do not treat profile `role` alone as sufficient for all scoped permissions; resolve active grants/assignments server-side.

### `complaints`
- `$id`
- `student_user_id` (string 255, required, indexed)
- `student_name` (string 255, required, trusted snapshot)
- `student_enrollment_no` (string 32, required, trusted snapshot)
- `student_department_id` (string 50, required, indexed)
- `maintenance_department_id` (string 50, required, indexed)
- `title` (string 255, required)
- `location` (string 255, required)
- `description` (string 5000, required)
- `priority` (`low`, `medium`, `high`, default 'medium')
- `status` (`Pending`, `In Progress`, `Resolved`, default 'Pending', indexed)
- `support_count` (integer, default 1, min 1)
- `last_meaningful_update_at` (string 64, optional/synchronized)
- `attachment_file_id` (string 255, optional, private)
- `created_at` (string 64, required)
- `updated_at` (string 64, optional)

Core attributes (`status`, `support_count`, `last_meaningful_update_at`) are maintained directly on the complaint record and synchronized transactionally/compensatingly alongside authoritative timeline and support records. This ensures high-performance feed filtering and sorting without unindexed cross-collection calculations. Original title, location, description, and department assignments remain permanently immutable.

### `complaint_supports`
- deterministic or otherwise unique `$id`
- `complaint_id`
- `user_id`
- `status` (`active`, `revoked`) or a safe active-record lifecycle
- `created_at`
- `revoked_at` (optional)

Must allow a student to support again after revocation while preventing duplicate active support.

### `complaint_timeline`
- `complaint_id`
- `author_id`
- `author_role`
- `entry_type` (`status_change`, `progress_update`, `clarification_request`, `clarification_reply`, `admin_response`)
- `content`
- `old_status` / `new_status` where relevant
- `is_substantive` where applicable
- `created_at`

### `phone_change_requests`
- `student_user_id`
- `academic_department_id`
- `old_phone_number`
- `requested_phone_number` only if policy permits storing before approval; otherwise store only after authorized submission
- `reason`
- `status` (`pending`, `approved`, `rejected`, `completed`)
- `reviewed_by`
- `decision_reason`
- one-time permission reference/state
- `permission_consumed`
- timestamps

Permission consumption must happen only after successful persistence of the new phone value. Design atomic or recoverable state handling based on actual Appwrite capabilities.

### `complaint_warnings`
- `complaint_id`
- `issued_by_principal_id`
- `warning_reason`
- `days_delayed`
- `admin_response`
- `responded_at`
- `created_at`

Multiple warning records may exist while the complaint remains unresolved.

### `department_admin_assignments` / `permission_grants`
Store:
- `user_id`
- `department_id`
- scope (`academic` or `maintenance`)
- permission set
- `is_active`
- `assigned_by`
- created/revoked timestamps

Water/Sanitation maintenance assignments cannot carry academic phone-approval scope.

### `audit_logs`
- event/action
- actor ID and resolved role
- target resource type and ID
- structured details
- timestamp
- optional request/correlation ID

Do not store unnecessary secrets or sensitive payloads in audit details. Application-level audit operations are append-only; restrict update/delete paths and protect credentials.

## 3. Required indexes
Validate actual Appwrite index limits and supported compound index behavior before provisioning. Candidate indexes:
- `profiles.user_id` unique
- `profiles.enrollment_no` unique
- `departments.code` unique
- `complaints.student_department_id + created_at`
- `complaints.maintenance_department_id + status`
- `complaint_supports.complaint_id + user_id`
- `complaint_timeline.complaint_id + created_at`
- `phone_change_requests.student_user_id + status`
- `complaint_warnings.complaint_id + created_at`
- assignment lookup by `user_id + scope + is_active`
- audit lookup by `actor_id`, `target_resource_id`, and `created_at`

## 4. Permissions
Sensitive collections must not be directly readable/writable by browser clients. Route all reads/writes through authenticated Appwrite Cloud Functions. Attachments remain private. Confirm exact Appwrite collection/document permission semantics against the deployed project before migration.

## 5. Migration cautions
Existing `department_code`, `issue_type`, `official_response`, status values, support_count, and attachment settings do not map cleanly to the new model. Do not blindly rename or drop fields. Build a reviewed migration plan with backups, mapping confirmation, dry-run counts, rollback strategy, and explicit approval.
