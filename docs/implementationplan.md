# CampusVoice — Implementation Plan (7-Day Realignment)

**Updated:** 10 November 2026  
**Target completion:** 16 November 2026  
**Capacity target:** 78 focused engineering hours  
**Mode:** Reuse existing source code; implement only against approved requirements.


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


## Planning assumptions
- Seven calendar workdays are available counting 10–16 November inclusive.
- Target is approximately 11 hours on Days 1–6 and 12 hours on Day 7.
- This is an aggressive estimate, not a promise. Any unconfirmed mapping, Appwrite limitation, migration issue, or critical regression must be escalated rather than hidden.
- No feature is complete until acceptance tests pass.

## Day 1 — Domain and database foundation (11 hours)
- Confirm institutional department names/code mappings; no guessing.
- Model six departments with academic/maintenance flags.
- Separate student academic and complaint maintenance identifiers.
- Design scoped admin assignments and permission grants.
- Design timeline, phone-change, warning, and audit collections.
- Review migration/backfill/rollback plan before applying any schema changes.
**Exit:** schema reviewed, mapping confirmed, migration plan approved, schema checks pass.

## Day 2 — Onboarding and complaint creation (11 hours)
- Add phone number to first-time profile setup.
- Server-side format validation: exactly 10 digits, starts 6–9.
- Lock name/enrollment and phone according to policy.
- Add maintenance department selector.
- Derive student department and creator identity server-side.
- Remove public complaint form/API/schema behavior.
**Exit:** onboarding and complaint creation integration tests pass.

## Day 3 — Privacy and attachment security (11 hours)
- Student feeds filtered by `student_department_id`.
- Admin queues filtered by `maintenance_department_id`.
- Server-side peer response projection removes creator PII and private attachment references.
- Verify creator, concerned Maintenance Admin, and Principal full-detail access.
- Validate attachment ownership, existence, actual MIME/type, 5 MB maximum, and private access.
**Exit:** privacy, IDOR, attachment, and cross-department tests pass.

## Day 4 — Timeline and support lifecycle (11 hours)
- Make original complaint immutable after creation.
- Add timeline events for status, progress, clarification, replies, and official responses.
- Restrict status changes to concerned Maintenance Admin.
- Implement support baseline 1, creator self-support prevention, same-academic-department eligibility, remove/re-support.
- Prove concurrency-safe active support uniqueness and derived count.
**Exit:** timeline integrity and support lifecycle tests pass.

## Day 5 — Phone-change workflow and Principal foundation (11 hours)
- Student request routed to own academic Department Admin.
- Admin approve/reject.
- One-time update permission.
- Consume permission only after successful database save; preserve old phone and permission on failures.
- Block Water/Sanitation Admin approval.
- Principal cross-department dashboard foundation and role authorization.
**Exit:** phone workflow failure-safety and Principal authorization tests pass.

## Day 6 — Warnings, governance, audit history (11 hours)
- Implement Pending/In Progress five-day eligibility.
- Meaningful status/progress events reset timer; views/minor edits do not.
- Manual Principal warnings, multiple warnings while unresolved, exclude Resolved.
- Admin warning responses.
- Department/admin assignment, permission grant/revocation, settings management.
- Append-only audit events for all required actions.
**Exit:** warning logic, governance, and audit coverage tests pass.

## Day 7 — Stabilization and release verification (12 hours)
- Run full typecheck, lint, unit, integration, and E2E suites.
- Test role matrix and department isolation.
- Test peer privacy and attachment access.
- Test support concurrency and phone failure paths.
- Test Principal restrictions and warning eligibility.
- Review audit-log protection and secret exposure.
- Verify Appwrite production configuration, OAuth, Function invocation, database permissions, and Vercel deployment.
- Fix only release-blocking defects; document remaining issues honestly.
**Exit:** no open critical/high findings, all acceptance criteria pass, deployment verified end-to-end.

## Definition of done
- Requirements implemented in actual backend and frontend.
- Server-side authorization verified for every protected operation.
- Critical/high security tests pass.
- No unresolved department mapping assumptions.
- No peer PII leakage.
- No unauthorized status changes/warnings.
- Migration and rollback strategy reviewed.
- Handoff updated with exact test evidence and known limitations.

## Risk and contingency
If the schedule slips, defer cosmetic polish and nonessential analytics before security, privacy, data integrity, or authorization. Do not reduce testing or silently drop a requirement. Reforecast the deadline when actual blockers are found.
