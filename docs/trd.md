# CampusVoice — Technical Requirements Document (Updated)

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
Six departments exist with canonical internal IDs independent of enrollment codes:
1. `dept_civil` (`Civil`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
2. `dept_comp` (`Computer`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
3. `dept_elec` (`Electrical`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
4. `dept_mech` (`Mechanical`) — Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
5. `dept_water` (`Water`) — Maintenance-only (`is_academic: false`, `is_maintenance: true`)
6. `dept_sanit` (`Sanitation`) — Maintenance-only (`is_academic: false`, `is_maintenance: true`)

Keep separate identifiers:
- `student_department_id`: the student's academic department and peer-visibility jurisdiction (restricted to the 4 active academic departments).
- `maintenance_department_id`: the department responsible for resolving a complaint (any of the 6 active maintenance departments).

Enrollment department code is extracted only from characters 8–9 using `enrollment_no[7:9]` (zero-based slice `[7:9]`). Confirmed mappings in `ENROLLMENT_CODE_MAPPINGS` are `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, and `19` → `dept_mech`. Water and Sanitation have zero enrollment codes and must never appear in enrollment-code mappings. Codes `03`, `04`, `05`, `08`, aliases `water`/`sanitation`, and unmapped/inactive codes are rejected without guessing. Appwrite live migration remains pending.

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


## 1. Selected stack
- Next.js App Router + TypeScript.
- Appwrite Cloud Auth with Google OAuth.
- Appwrite Cloud Database.
- Appwrite Cloud Functions.
- Vercel frontend hosting.
- Appwrite Storage for private attachments.
- Frontend validation for usability; authoritative validation repeated in Functions.

## 2. Authentication
- Configure Google OAuth in Appwrite.
- Verify callback/session/JWT behavior against the deployed Appwrite SDK/runtime version.
- Every protected Function verifies caller identity.
- Load trusted profile and scoped grants server-side.
- Reject missing, expired, invalid, or revoked credentials.
- No secrets in `NEXT_PUBLIC_*`.

## 3. Authorization rules
- Student must have complete profile for complaint creation/support.
- Student feed scope: `student_department_id`.
- Admin queue scope: `maintenance_department_id`.
- Academic Admin scope governs phone-change approvals.
- Principal has cross-department monitoring/management rights but no complaint status mutation.
- Every endpoint repeats authorization; route hiding is not security.

## 4. Enrollment mapping
- Extract `enrollment_no.slice(7, 9)`.
- Preserve enrollment number as string.
- Confirmed academic codes: `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, `19` → `dept_mech`.
- Water (`dept_water`) and Sanitation (`dept_sanit`) have zero enrollment codes.
- Unknown, unconfirmed, inactive, and disallowed codes (`03`, `04`, `05`, `08`) must be rejected.
- Validate full format only from authoritative institutional examples.

## 5. Backend operations
Use one or more Appwrite Cloud Functions according to approved deployment design. Logical operations include profile, department listing, complaints, support add/remove/state, admin dashboard/queue, timeline events, phone-change request/review/complete, Principal dashboard, warning issue/response, department/admin/permission management, settings, and audit history.

## 6. Data and storage
See `schema.md`. All sensitive database operations go through trusted Functions. Attachments must be private and checked server-side for ownership, existence, actual content type, and size <= 5 MB. Allowed types: PDF/JPG/JPEG/PNG.

## 7. Reliability and concurrency
- Use idempotency where appropriate.
- Prevent duplicate active support records under concurrency.
- Keep support count derived from active support records plus creator baseline.
- Couple timeline events, projections, and audit events transactionally where Appwrite supports it; otherwise document recoverable state and reconciliation.
- Phone-change permission consumption must not occur before successful phone persistence.

## 8. Testing
Test enrollment mapping, unmapped codes, onboarding locks, phone validation, department visibility, peer PII redaction, attachment access, support self/duplicate/remove/re-support/concurrency, complaint immutability, timeline authorization, admin scope, Principal restrictions, five-day timer, warnings, phone-change failure-safety, audit protection, and deployed auth/permissions.

## 9. Deployment
- Frontend to Vercel.
- Backend to Appwrite Cloud Functions.
- Configure OAuth origins and redirects.
- Use least-privilege Function API key scopes.
- Verify deployed flows end-to-end before claiming release complete.
