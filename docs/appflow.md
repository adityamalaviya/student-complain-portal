# CampusVoice — Application Flow (Updated)

**Version:** 2.0.0  
**Updated:** 10 November 2026  
**Status:** Current approved requirements


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


## 1. Sign-in and first-time onboarding
1. User selects Continue with Google.
2. Appwrite Auth completes OAuth.
3. Frontend obtains the authenticated session/JWT using the supported Appwrite mechanism.
4. Appwrite Function verifies the caller and loads the trusted profile.
5. Existing complete student profile goes to `/dashboard`; Department Admin goes to its authorized admin workspace; Principal goes to `/principal`.
6. Incomplete student profile goes to onboarding.
7. Onboarding collects name, enrollment number, and phone number.
8. Backend validates all fields, extracts the enrollment code from `[7:9]`, resolves only a confirmed mapping, and saves the academic department. Unknown mappings are never guessed.
9. After save, name and enrollment are locked; phone is locked except through the approved workflow.

## 2. Student complaint creation
1. Student opens `/complaints/new`.
2. UI loads maintenance departments from the trusted backend.
3. Student enters title, chooses one maintenance department, location, description, priority, and optional attachment.
4. Backend derives creator identity and `student_department_id` from the trusted profile. It validates the selected `maintenance_department_id`.
5. Backend validates attachment existence, ownership, actual type, size (maximum 5 MB), and private access.
6. Backend creates an immutable complaint with status `Pending` and initial support count `1`.
7. The complaint becomes visible to students in the creator's academic department and manageable by the selected Maintenance Department Admin.

## 3. Student complaint feed and details
- Feed query is scoped by `student_department_id`.
- It does not use `maintenance_department_id` to decide student visibility.
- Peer response projection removes creator name, enrollment number, phone number, and private attachment references.
- Creator sees full own details.
- The concerned Maintenance Admin and Principal receive full details only after server-side authorization.
- There is no public feed or public-issue filter.

## 4. Support flow
1. Eligible peer opens a visible complaint.
2. Backend verifies same academic department and rejects creator self-support.
3. Backend creates one active support record using a deterministic unique key or equivalent database-supported uniqueness strategy.
4. Repeated active support is rejected without increasing count.
5. Student may remove their own active support.
6. Student may support again after removal.
7. Displayed count is calculated as `1 + active support records`; concurrency must not cause counter drift.

## 5. Maintenance Admin flow
1. Admin authenticates.
2. Backend resolves active admin assignment and maintenance scope from trusted records.
3. Admin sees complaints where `maintenance_department_id` matches their assignment.
4. Admin may add progress updates, request clarification, and reply in the timeline.
5. Only the concerned Maintenance Admin may change status.
6. Original complaint document is not overwritten; status/progress events are stored as timeline entries.
7. Admin can see relevant creator details within their authorized scope.

## 6. Phone-change flow
1. Student submits a request to their own academic Department Admin.
2. Backend verifies the student's academic department and admin scope.
3. Admin approves or rejects.
4. Approval creates a one-time update permission.
5. Student submits a new valid 10-digit phone number.
6. Backend saves the new value and consumes permission only after successful persistence.
7. On failure, old number remains active and permission remains available.
8. Request, decision, and outcome are audit logged.

## 7. Principal flow
- Principal views all six departments, metrics, complaint history, delayed cases, and authorized student details.
- Principal can issue manual warnings only for eligible unresolved complaints and can issue multiple warnings while unresolved.
- Department Admin warning responses are visible to Principal.
- Principal manages department records, Department Admin assignments, accounts, permission grants, and system settings.
- Principal cannot change complaint status.

## 8. Five-day eligibility
- Pending: more than five days since entering Pending.
- In Progress: more than five days since last meaningful status change or substantive progress update.
- Views, refreshes, minor edits, and unrelated activity do not reset the timer.
- Resolved complaints are excluded.

## 9. Visibility matrix

| Viewer | Complaint created by same academic department | Complaint created by another academic department |
|---|---|---|
| Student peer | View with creator PII and private attachments removed; may support | No access |
| Complaint creator | Full own complaint | Full own complaint |
| Maintenance Admin | Full details only when assigned maintenance department matches | Full details only when assigned maintenance department matches |
| Principal | Authorized full details | Authorized full details |

## 10. Error and empty states
- Invalid or unmapped enrollment code: no department assignment; explain that verification is required.
- Invalid phone format: field-level validation; no save.
- Unauthorized department access: generic not-found/denied response without data leakage.
- Duplicate active support: controlled response with current server-derived count.
- Removed support: refresh state and count from backend.
- Attachment rejected: explain size/type/ownership constraint.
- Phone-change save failure: retain old phone and do not consume permission.
- Resolved complaint: warning action unavailable.
- Network/API failure: never display mutation success unless backend confirms it.

## 11. Route inventory
- `/sign-in`
- `/auth/callback`
- `/onboarding`
- `/dashboard`
- `/complaints/new`
- `/complaints/[id]`
- `/admin` (scoped Department Admin workspace)
- `/principal`
- Phone-change request/review views may be nested under student/admin workspaces.

## 12. No unresolved public-visibility mode
All complaints are scoped to the creator's academic department for student peer visibility. The selected maintenance department controls operational assignment only.
