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
Six departments exist with canonical internal document IDs independent of enrollment codes:
1. `dept_civil` (`Civil`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
2. `dept_comp` (`Computer`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
3. `dept_elec` (`Electrical`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
4. `dept_mech` (`Mechanical`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
5. `dept_water` (`Water`) — Maintenance-only (`is_academic: false`, `is_maintenance: true`)
6. `dept_sanit` (`Sanitation`) — Maintenance-only (`is_academic: false`, `is_maintenance: true`)

Keep separate identifiers:
- `student_department_id`: the student's academic department and peer-visibility jurisdiction (restricted to the 4 active academic departments).
- `maintenance_department_id`: the department responsible for resolving a complaint (any of the 6 active maintenance departments).

Enrollment department code is extracted only from characters 8–9 using `enrollment_no[7:9]` (zero-based slice `[7:9]`). Confirmed mappings in `ENROLLMENT_CODE_MAPPINGS` are:
- `06` → `dept_civil` (Civil)
- `07` → `dept_comp` (Computer)
- `09` → `dept_elec` (Electrical)
- `19` → `dept_mech` (Mechanical)

Water (`dept_water`) and Sanitation (`dept_sanit`) NEVER appear in enrollment-code mappings and have no enrollment codes. Codes `03`, `04`, `05`, `08` and aliases `water`, `sanitation` are rejected. Unknown, unconfirmed, or inactive mappings are rejected without guessing or fallback assignment.

**Live Appwrite Migration Status:** Pending. Do not assume local provisioning script updates migrate live Appwrite documents.

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
Canonical document `$id` values (independent of enrollment codes):
- `dept_civil` (`Civil`, `is_academic: true`, `is_maintenance: true`, `is_active: true`)
- `dept_comp` (`Computer`, `is_academic: true`, `is_maintenance: true`, `is_active: true`)
- `dept_elec` (`Electrical`, `is_academic: true`, `is_maintenance: true`, `is_active: true`)
- `dept_mech` (`Mechanical`, `is_academic: true`, `is_maintenance: true`, `is_active: true`)
- `dept_water` (`Water`, `is_academic: false`, `is_maintenance: true`, `is_active: true`)
- `dept_sanit` (`Sanitation`, `is_academic: false`, `is_maintenance: true`, `is_active: true`)

Attributes:
- `$id` (canonical internal ID — primary key)
- `name` (string 100, required)
- `is_academic` (boolean)
- `is_maintenance` (boolean)
- `is_active` (boolean)
- timestamps

`departments.code` and `idx_dept_code` / `idx_code` are removed from the target schema. Enrollment mappings live strictly in `ENROLLMENT_CODE_MAPPINGS`, never as a required attribute on `departments` documents. Water and Sanitation must never have enrollment codes or placeholder `code` attributes.

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
- `created_at`

Note: Substantive progress updates are recorded using `entry_type: 'progress_update'` rather than requiring a separate `is_substantive` attribute on Appwrite documents. Resolution timestamps (`resolved_at`) and latest `official_response` summaries are derived from persisted `complaint_timeline` entries (`status_change` with `new_status: 'Resolved'` and `admin_response`/`progress_update`) without storing `official_response` or `resolved_at` directly on `complaints`.

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
- `profiles.enrollment_no` key/unique
- `profiles.student_department_id` key
- `complaints.student_department_id + created_at`
- `complaints.maintenance_department_id + status`
- `complaints.attachment_file_id` key
- `complaint_supports.complaint_id + user_id`
- `complaint_timeline.complaint_id + created_at`
- `phone_change_requests.student_user_id + status`
- `complaint_warnings.complaint_id + created_at`
- assignment lookup by `user_id + scope + is_active`
- audit lookup by `actor_id`, `target_resource_id`, and `created_at`

Note: `departments.code` unique index (`idx_code` / `idx_dept_code`) is obsolete and must not be recreated; canonical department lookup uses `$id` directly.

## 4. Permissions
Sensitive collections must not be directly readable/writable by browser clients. Route all reads/writes through authenticated Appwrite Cloud Functions. Attachments remain private. Confirm exact Appwrite collection/document permission semantics against the deployed project before migration.

## 5. Migration-Impact Report & Safe Migration Procedure (Pending Live Execution)
### Existing Live `$id` & Schema Conflicts
1. **Immutable Document `$id` Conflict:** Pre-recovery Appwrite provisioning created `departments` documents using enrollment codes as document `$id` values (`'06'` for Civil, `'07'` for Computer; and if Day 1 was run, potentially `'03'`, `'04'`, `'water'`, `'sanitation'`). Appwrite document `$id` values are immutable and cannot be renamed in-place to `dept_civil`..`dept_sanit`.
2. **Required `departments.code` Attribute & Unique Index Conflict:** Live `departments` was provisioned with `code` as a `required: true` string attribute and unique index `idx_code` (or `idx_dept_code`). Creating the 6 canonical documents (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`) without `code` will fail schema validation until `code` is made optional or retired, and inserting placeholder `code` values is prohibited.
3. **Legacy References in `profiles` and `complaints`:** Pre-recovery records store `department_code` (`'06'`, `'07'`) rather than `student_department_id` / `maintenance_department_id`.
4. **Admin Authorization Gap:** Only `ADMIN_ALLOWLIST_06` (`dept_civil`) and `ADMIN_ALLOWLIST_07` (`dept_comp`) exist in legacy env allowlists; `dept_elec`, `dept_mech`, `dept_water`, and `dept_sanit` admins depend on provisioning DB records in `department_admins`.

### Safe Migration Procedure (Approved Execution Only)
1. **Export & Backup:** Export all live documents from `departments`, `profiles`, `complaints`, `complaint_supports`, and storage metadata before any modification.
2. **Non-Destructive Attribute Relaxation:** Add missing schema attributes (`is_academic`, `is_maintenance`, `is_active`, `student_department_id`, `maintenance_department_id`, etc.) and update `departments.code` on live Appwrite from `required: true` to `required: false` (do not delete live attributes or documents during transition).
3. **Seed Canonical Department Documents:** Create the 6 canonical documents (`$id` = `dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`) with `{ name, is_academic, is_maintenance, is_active }` and NO `code` attribute values.
4. **Dry-Run & Backfill:** Map legacy `department_code = '06'` → `dept_civil` and `'07'` → `dept_comp` across `profiles.student_department_id` and `complaints` (`student_department_id` / reviewed `maintenance_department_id`), flagging any unexpected values without guessing.
5. **Provision `department_admins`:** Populate DB-backed `department_admins` assignments with canonical `department_id` and explicit `scope` (`academic` or `maintenance`, barring `dept_water`/`dept_sanit` from `academic`).
6. **Deploy & Verify Before Cleanup:** Deploy updated Functions and frontend, verify end-to-end reads/writes, and only after rollback window confirmation retire legacy `$id = '06'`/`'07'` documents, obsolete `idx_code`/`idx_dept_code` index, and `departments.code` attribute.
