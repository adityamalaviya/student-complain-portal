# CampusVoice — Appwrite Architecture & Security Specification (Updated)

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


## 1. Authentication lifecycle
1. Frontend starts Google OAuth using Appwrite Web SDK.
2. Appwrite completes authentication and returns the user to the configured callback.
3. Frontend obtains a supported authenticated token/session.
4. Function verifies identity using the documented Appwrite runtime mechanism.
5. Function resolves profile, role, department scope, and active permission grants from trusted storage.
6. Every protected action checks resource-level authorization again.

Do not assume a Function automatically inherits the browser's session context. Verify the exact Appwrite Function runtime and JWT/session forwarding behavior in the deployed version.

## 2. Roles and scopes
- `student`
- `department_admin`
- `principal`

Department Admin assignments must specify academic and/or maintenance scope. A Water/Sanitation maintenance assignment cannot be used for academic student phone-change approval. Additional system permissions are explicit grants to existing accounts, with actor, reason, timestamp, revocation, and audit event.

## 3. Data access
Sensitive collections use no browser client read/write access. All business data operations are mediated by Functions. Public configuration such as project ID is not a secret; server API keys are secrets and must remain Function-only with least privilege.

## 4. Complaint access control
- Student list/detail: caller's academic department equals complaint `student_department_id`.
- Student creator: full own complaint.
- Peer student: redacted projection only.
- Maintenance Admin: full details only when assigned `maintenance_department_id` matches.
- Principal: authorized cross-department view.
- Return generic not-found/denied behavior for unauthorized resource probes where appropriate.

Peer projection must remove creator name, enrollment number, phone number, attachment file ID, attachment URL, and any other sensitive metadata before serialization.

## 5. Attachment controls
- Private bucket/object access.
- Maximum 5 MB.
- PDF/JPG/JPEG/PNG only.
- Validate file existence, authenticated uploader ownership, actual MIME/content, byte size, and complaint linkage server-side.
- Never accept an arbitrary client-supplied file ID as proof of authorization.
- Do not generate public URLs.

## 6. Function security checklist
- Verify JWT/session and derive user ID server-side.
- Validate payload schema and size.
- Resolve trusted profile.
- Check role and scoped permission.
- Check resource ownership/department relationship.
- Apply privacy projection.
- Rate-limit sensitive operations where appropriate.
- Avoid leaking stack traces or existence information.
- Log security-relevant outcomes without storing secrets.
- Keep secrets out of frontend bundles and logs.

## 7. Append-only audit controls
Audit all complaint lifecycle, support, timeline, phone-change, warning, assignment, permission, and settings actions. Ordinary app roles have no update/delete operation for audit entries. Use a dedicated server-side append path and least-privilege credentials. Do not claim cryptographic immutability unless separately implemented and verified.

## 8. Multi-step mutation safety
For status transition + timeline + audit, support changes + count projection, and phone update + permission consumption + audit, use Appwrite-supported transactions if available. If unavailable, implement explicit pending/completed state, idempotency, compensation/reconciliation, and failure-path tests. Never describe a multi-document operation as atomic without proof.

## 9. Required security tests
- Peer PII response projection.
- Cross-academic-department read denial.
- Cross-maintenance-admin queue denial.
- Principal status-change denial.
- Resolved warning denial.
- Water/Sanitation phone-approval denial.
- Attachment IDOR and oversized/invalid MIME rejection.
- Concurrent support and re-support.
- Phone persistence failure preserves old number and permission.
- Audit update/delete denied through application paths.
- Secret scan of frontend bundle and logs.
