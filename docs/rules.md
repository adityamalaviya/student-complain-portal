# CampusVoice — Business and Engineering Rules (Updated)

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


## Enforcement rules
1. The latest approved requirements in this document set override legacy documents and code.
2. Never guess institutional department mappings. Confirm names and code mapping before enabling unmapped departments.
3. Never conflate academic and maintenance department identifiers.
4. Never accept client-provided identity, role, department, support count, or permission as authoritative.
5. Never expose peer creator PII or private attachment details.
6. Never add public complaint behavior.
7. Never allow a student to support their own complaint.
8. Never allow cross-academic-department support.
9. Never allow more than one active support record for a student/complaint pair.
10. Never mutate the original complaint content after creation.
11. Never allow Principal to change complaint status.
12. Never allow a Water or Sanitation Admin to approve student phone changes.
13. Never issue warnings for resolved complaints.
14. Never reset delay clocks for minor edits, views, refreshes, or unrelated actions.
15. Never mark a mutation successful before the backend confirms persistence.
16. Never expose Appwrite server API keys or secrets to frontend code.
17. Every protected operation must repeat authorization on the server.
18. Audit logs must be protected from ordinary update/delete operations.
19. Keep implementation inside Next.js + Appwrite Cloud Functions + Appwrite Cloud Database.
20. Do not deploy or alter production data during read-only audit or planning stages.

## Approval gates
- Requirement/document review.
- Architecture and schema review.
- Explicit approval for design work.
- Explicit approval for each implementation phase.
- Test and security review after each phase.
- Update handoff and request approval before the next phase.
