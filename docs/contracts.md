# CampusVoice — API Contracts (Updated)

**Version:** 2.0.0 | **Date:** 10 November 2026


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


## 1. Contract conventions
- All business operations run through Appwrite Cloud Functions.
- Authenticate caller from supported Appwrite identity propagation and verify it server-side.
- Resolve profile, role, assignments, and permissions from trusted data.
- Standard success: `{ "success": true, "data": ... }`.
- Standard error: `{ "success": false, "error": "...", "code": "..." }`.
- Use generic not-found behavior for resources the caller is not authorized to discover.
- Bound pagination and validate every input server-side.

## 2. Logical operations

| Operation | Access | Responsibility |
|---|---|---|
| `get-profile` | Authenticated | Current caller's profile and onboarding state |
| `complete-onboarding` | Authenticated, incomplete student | Save name, enrollment, phone and derived academic department |
| `list-departments` | Authenticated | Return active department directory and academic/maintenance flags |
| `list-complaints` | Student | Return only same-academic-department complaints with peer-safe projection |
| `create-complaint` | Complete student | Create complaint for selected maintenance department |
| `get-complaint` | Authorized viewer | Return creator/full staff projection or peer-redacted projection |
| `support-complaint` | Eligible student | Create one active support |
| `remove-support` | Supporting student | Revoke own active support |
| `get-support-state` | Authorized viewer | Return server-derived active state/count |
| `get-admin-dashboard` | Scoped Department Admin | Metrics for assigned maintenance department |
| `list-admin-complaints` | Scoped Maintenance Admin | Queue by `maintenance_department_id` |
| `add-progress-update` | Concerned Maintenance Admin | Append substantive progress timeline entry |
| `request-clarification` | Concerned Maintenance Admin | Append clarification request |
| `reply-clarification` | Complaint creator | Append student reply |
| `update-complaint-status` | Concerned Maintenance Admin | Append status event; Principal forbidden |
| `request-phone-change` | Student | Create request routed to own academic Department Admin |
| `review-phone-change` | Own academic Department Admin | Approve/reject request |
| `complete-phone-change` | Requesting student | Save new phone using one-time permission |
| `get-principal-dashboard` | Principal | Cross-department metrics and delayed cases |
| `issue-warning` | Principal | Create warning for eligible unresolved complaint |
| `respond-to-warning` | Concerned Department Admin | Append response to warning |
| `manage-departments` | Principal or explicit grant | Manage six department records |
| `manage-admin-assignments` | Principal or explicit grant | Assign/revoke scoped admin grants |
| `manage-permissions` | Principal or explicit grant | Grant/revoke explicit permissions |
| `manage-settings` | Principal or explicit grant | Manage approved system settings |
| `get-audit-history` | Principal or explicit grant | Read protected audit events |

## 3. Important payload rules
### `complete-onboarding`
Input: `{ name, enrollment_no, phone_number }`. Backend extracts code using `[7:9]` and maps only confirmed codes. Client cannot submit authoritative department ID or role.

### `create-complaint`
Input: `{ title, maintenance_department_id, location, description, priority, attachment_file_id? }`. Backend derives student user, name, enrollment, and `student_department_id`.

### `support-complaint` / `remove-support`
Input: `{ complaint_id }`. Caller identity and academic department are derived from trusted profile. Count is not accepted from client.

### `update-complaint-status`
Input: `{ complaint_id, new_status, content }`. Only concerned Maintenance Admin may invoke. Write timeline event and protected audit event. Do not mutate original complaint content.

### Phone change
Request/review/complete operations must verify academic admin scope, one-time permission state, phone format, and failure-safe consumption. A failed database save must leave old phone active and permission unconsumed.

## 4. Server response privacy
For peer students, never serialize creator name, enrollment number, phone number, attachment file ID, attachment URL, or other private metadata. Do not rely on UI hiding. Full projection is limited to creator, concerned Maintenance Admin, and Principal after authorization.

## 5. Idempotency and concurrency
Support creation/removal, warning issuance, phone permission consumption, timeline writes, and audit writes need explicit idempotency/concurrency behavior. Verify Appwrite's actual transaction support. Do not claim atomicity unless demonstrated by implementation and tests.
