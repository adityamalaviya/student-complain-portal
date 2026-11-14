# CampusVoice — UI/UX Design Specification (Updated)

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


## 1. Design direction
Use a modern, accessible college portal. Reuse the approved visual language and components where they remain compatible. Do not let legacy screens imply removed product behavior.

## 2. Required screens
1. Google OAuth sign-in.
2. First-time student profile setup (name, enrollment, phone).
3. Student dashboard with academic-department complaint feed.
4. Raise complaint form with six-maintenance-department selector.
5. Complaint details with privacy-aware peer/creator/staff variants.
6. Support and remove-support states.
7. Complaint timeline with status, progress, clarification, and replies.
8. Student phone-change request and status.
9. Department Admin dashboard scoped to maintenance assignment.
10. Department Admin complaint management, progress update, clarification, status change, and warning response.
11. Academic Department Admin phone-change review.
12. Principal dashboard across six departments.
13. Principal warning issuance and warning history.
14. Principal department/admin/permission/settings management.
15. Audit history viewer for authorized Principal/granted accounts.
16. Loading, empty, validation-error, network-error, and access-denied states.

## 3. Key interaction requirements
- Student's academic department is displayed as profile context, not editable.
- Complaint form lets student select maintenance department.
- Do not show public/private issue-type toggle or public feed.
- Peer complaint cards do not display creator identity or private attachments.
- Creator sees their own identity and private attachment controls.
- Admin and Principal views expose only fields permitted by backend authorization.
- Support control toggles between Support and Remove support.
- Timeline is chronological and distinguishes status changes, progress updates, clarification requests/replies, and admin responses.
- Principal warning action is disabled/absent for resolved or not-yet-eligible complaints.
- Principal has no status-change control.
- Phone-change status explains pending, approved, rejected, and completed states without implying the update succeeded before persistence.

## 4. Accessibility and states
- Keyboard navigable controls and visible focus.
- Labels and field-level validation.
- Responsive layouts for desktop/mobile.
- Confirm destructive/irreversible user actions clearly.
- Do not render sensitive values in hidden DOM elements; privacy must be enforced by backend projection, not CSS.
- Never display a success toast before backend confirmation.

## 5. Stitch MCP gate
Do not invoke Stitch MCP during a read-only audit or before explicit design-stage approval. When approved, design the screens above and wait for user approval before implementation.
