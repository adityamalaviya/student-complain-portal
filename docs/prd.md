# CampusVoice — Product Requirements Document (Updated)

**Version:** 2.0.0  
**Date:** 10 November 2026  
**Status:** Latest approved product baseline


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


## 1. Product objective
Provide students with a department-scoped complaint portal that routes facilities/maintenance problems to the responsible maintenance team while protecting student identity and giving institutional leadership oversight.

## 2. User groups
### Student
- Completes first-login profile.
- Creates complaints for any maintenance department.
- Views complaints created by students in their own academic department.
- Supports and withdraws support from eligible peer complaints.
- Tracks timeline, clarification requests, official responses, and status.
- Requests phone-number changes through their own academic Department Admin.

### Department Admin
- Has explicitly assigned academic and/or maintenance scopes.
- Maintenance scope: manages complaints routed to that maintenance department.
- Academic scope: reviews phone-change requests from students in that academic department.
- Adds progress updates, clarification requests, responses, and status transitions where authorized.
- Cannot access unrelated department queues.

### Principal
- Monitors all six departments.
- Reviews metrics, complaint history, delayed cases, warnings, and admin responses.
- Manages department/admin assignments, permission grants, and system settings.
- Cannot change complaint status.

## 3. Core functional requirements
1. Six-department directory with academic/maintenance classification.
2. Server-derived student academic department using confirmed enrollment mappings.
3. First-login collection of name, enrollment number, and phone.
4. Locked identity fields with authorized phone-change workflow.
5. Complaint creation with maintenance-department selection.
6. Private attachment validation and access.
7. Student feed based on creator's academic department.
8. Peer PII and private attachment redaction at the backend.
9. Creator, concerned Maintenance Admin, and Principal authorized full-detail access.
10. Support baseline of one, self-support prevention, same-academic-department eligibility, withdrawal, re-support, and concurrency safety.
11. Complaint immutable source record plus separate timeline.
12. Maintenance Admin-only status changes.
13. Principal dashboard, manual warnings, warning responses, and system management.
14. Five-day meaningful-update delay rules.
15. Append-only audit history for security-sensitive and lifecycle operations.

## 4. Non-functional requirements
- Strict server-side authorization.
- Department isolation and generic denial behavior.
- No secrets in frontend bundles.
- Private attachments with server-side actual type/size checks.
- Consistent error contracts and pagination.
- Auditable administrative operations.
- Accessible responsive UI with loading, empty, validation, and access-denied states.
- Regression tests for privacy, authorization, and concurrent support.

## 5. Acceptance criteria
- Computer student can create an Electrical maintenance complaint; other Computer students can see/support it; Electrical Admin manages it; other academic-department students cannot see it.
- Peer API payload contains no creator name, enrollment, phone, or private attachment reference.
- Creator and authorized staff can see full details.
- Student cannot support own complaint or support from another academic department.
- Support can be withdrawn and later restored; count remains baseline 1 plus active supports.
- Original complaint content is unchanged after creation; updates appear as timeline events.
- Only assigned Maintenance Admin can change status.
- Principal can issue warnings only on eligible unresolved complaints and cannot change status.
- Phone change is approved by the student's academic Department Admin; failed save leaves old phone and permission intact.
- All required lifecycle and permission events appear in protected audit history.

## 6. Explicit exclusions
- Public complaint feed or public complaint visibility mode.
- Super Admin role.
- Separate FastAPI/backend service.
- Client-side-only security enforcement.
