# CampusVoice — Architecture Decision Records (Updated)

**Version:** 2.0.0 | **Date:** 10 November 2026  
**Status:** Current requirements decisions; legacy ADRs superseded where conflicting


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


## ADR-001: Six-department model with separate academic and maintenance jurisdiction
**Decision:** Maintain six departments with canonical database IDs (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`) independent of enrollment codes, separating `student_department_id` from `maintenance_department_id`. Civil/Computer/Electrical/Mechanical serve both academic and maintenance scopes; Water/Sanitation are maintenance-only with zero enrollment codes.

**Mapping guard:** Code extraction is fixed at `enrollment_no[7:9]`. Confirmed mappings are `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, and `19` → `dept_mech`. Codes `03`, `04`, `05`, `08`, aliases `water`/`sanitation`, and all unknown or inactive codes are rejected without guessing. Live Appwrite migration from legacy `$id = '06'/'07'` documents remains pending.

## ADR-002: Three main roles and explicit scoped grants
**Decision:** Student, Department Admin, Principal. No Super Admin. System-management powers may be granted to selected existing accounts as explicit server-side permission grants with audit and revocation.

## ADR-003: Appwrite-only backend
**Decision:** Next.js App Router + TypeScript, Appwrite Cloud Auth, Appwrite Cloud Database, Appwrite Cloud Functions, Vercel. Do not add FastAPI or another backend service.

## ADR-004: Complaint visibility differs from maintenance assignment
**Decision:** Student peer feed uses creator's academic department. Maintenance assignment routes work to the selected maintenance department. Public complaint mode is removed.

## ADR-005: Complaint immutability and event timeline
**Decision:** Original complaint content is immutable after creation. Status transitions, progress, clarifications, replies, and admin responses are separate timeline events. If a current-status projection is used, it is derived and reconciled against the event log.

## ADR-006: Support baseline and revocation
**Decision:** Initial count is one for the creator. Other eligible students may add/remove their active support and support again later. Displayed count is baseline one plus active support records. Backend concurrency strategy must be proven.

## ADR-007: Phone-change approval
**Decision:** Student phone changes are requested through the student's own academic Department Admin. Approval grants one-time permission. Permission is consumed only after successful persistence. Water/Sanitation maintenance admins cannot approve.

## ADR-008: Principal warning governance
**Decision:** Principal may issue manual warnings only for unresolved complaints eligible after the five-day meaningful-update rule. Multiple warnings are allowed while unresolved. Principal cannot change status.

## ADR-009: Append-only audit history
**Decision:** Record all specified lifecycle and privileged operations. Application operations expose no normal update/delete path for audit events. Operational controls and least-privilege credentials must support the policy.

## ADR-010: Seven-day delivery target
**Decision:** Plan for approximately 78 focused engineering hours across 7 calendar days (about 11 hours/day for six days and 12 hours on final verification day). This is an aggressive target, not a guarantee. Security acceptance criteria cannot be waived to meet the date.
