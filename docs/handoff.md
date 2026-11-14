# CampusVoice — Project Handoff (Updated Baseline)

**Updated:** 10 November 2026  
**Status:** Existing implementation is an older-spec baseline; new requirements require a gap-driven realignment.  
**Target:** 16 November 2026  
**Planned effort:** Approximately 78 focused engineering hours over 7 days.


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

Enrollment department code is extracted only from characters 8–9 using `enrollment_no[7:9]` (zero-based slice `[7:9]`). Confirmed mappings in `ENROLLMENT_CODE_MAPPINGS` are `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, and `19` → `dept_mech`. Water and Sanitation have zero enrollment codes and must never appear in enrollment-code mappings. Disallowed codes (`03`, `04`, `05`, `08`), aliases (`water`, `sanitation`), and unmapped/inactive codes are rejected without guessing. Appwrite live schema/document migration remains pending.

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


## 1. Existing baseline
Previous handoff claims Phases 1–6 were completed against an older two-department/public-issue specification. Those claims are historical only and do not prove compliance with the current requirements. Existing implementation must be inspected and verified before changes.

## 2. Current critical gaps from the requirement-gap audit
- Two-department assumptions conflict with six-department model.
- One department field conflates academic and maintenance scope.
- Public complaint implementation remains and must be removed.
- Peer complaint API responses expose creator name/enrollment and require server-side redaction.
- Principal, warnings, phone-change workflow, timeline, and append-only audit history are missing.
- Support baseline/revocation/concurrency behavior needs refactoring.
- Attachment limit/type/ownership validation needs correction.
- Static admin allowlists need replacement with scoped, auditable assignments/grants.

These are audit-report findings based on the inspected repository snapshot; rerun tests after implementation.

## 3. Reusable foundations
- Next.js App Router + TypeScript.
- Appwrite Google OAuth foundation.
- Server-side profile lookup and enrollment slice `[7:9]`.
- Deterministic support identity strategy, subject to rework for revocation.
- Existing UI tokens/components where compatible.

## 4. Seven-day implementation target
| Day | Workstream | Hours | Exit criteria |
|---|---|---:|---|
| 1 | Schema design/provisioning, six departments, separate department scopes, scoped admin model | 11 | Reviewed schema/migration plan; confirmed mapping; local schema checks |
| 2 | Onboarding phone field/validation/locking; complaint creation with maintenance selector; public feature removal | 11 | Server validation and create-flow tests pass |
| 3 | Academic visibility, peer PII/attachment redaction, private attachment validation | 11 | Cross-department and privacy regression tests pass |
| 4 | Immutable complaint + timeline, status transitions, clarification/progress, support baseline and withdrawal | 11 | Timeline, status authorization, support lifecycle/concurrency tests pass |
| 5 | Phone-change request/review/one-time permission and Principal dashboard foundations | 11 | Approval scope and failure-safety tests pass |
| 6 | Five-day delay engine, warnings/responses, admin/permission management, audit instrumentation | 11 | Warning eligibility and audit coverage tests pass |
| 7 | Full integration, security regression, migration verification, deployment/release checks | 12 | No open critical/high issue; end-to-end acceptance suite passes |

**Total: 78 hours.** The schedule is aggressive and assumes the repository is stable, Appwrite access is available, mappings are confirmed, and no major infrastructure blocker appears. Do not skip security tests or claim completion if acceptance criteria fail.

## 5. Mandatory daily workflow
1. Inspect current branch and working tree.
2. Confirm phase scope and acceptance criteria.
3. Implement only the day's approved scope.
4. Run typecheck, lint, targeted tests, and security tests.
5. Review findings and fix regressions.
6. Update handoff with files changed, tests run, results, known gaps, and next dependencies.
7. Do not proceed to an unapproved scope if a critical blocker remains.

## 7. Day 1 Execution Handoff: Domain & Database Foundation (Completed)

**Date:** 10 November 2026  
**Status:** DAY 1 FOUNDATION COMPLETE — READY FOR APPROVAL GATE  
**Scope Achieved:** Domain models, separation of student and maintenance department jurisdictions, 3 primary roles (no super_admin), profile phone locking, immutable complaint and timeline models, base-1 support lifecycle, phone change failure-safety, Principal warning governance, append-only audit records, and Appwrite collection architecture.

### A. Modified & Created Files
1. `src/types/models.ts` — Updated domain types with 6 departments, dual department IDs, 3 roles, timeline, phone change, warnings, admin assignments, audit logs.
2. `functions/campusvoice-api/src/types.ts` — Mirrored backend Cloud Function domain types.
3. `src/lib/schemas/index.ts` — Implemented strict Zod runtime validation schemas (phone `/^[6-9]\d{9}$/`, 12-digit enrollment, dual department IDs, timeline, warnings, audit).
4. `scripts/setup-appwrite.mjs` — Realigned automated provisioning script for all 9 collections with empty permissions (`$permissions = []`) and 5 MB storage ceiling.
5. `tests/day1-database-foundation.test.mjs` — Automated test suite covering all 12 Day 1 acceptance criteria.
6. `docs/schema.md` — Updated schema specification documenting core attributes (`status`, `support_count`, `last_meaningful_update_at`) and all 9 collections.
7. `antigravity.md` — Updated root IDE context to align with the authoritative 10 November 2026 baseline.

### B. Database Collections & Architecture Foundation
- `departments`: 6 institutional departments (4 dual academic/maintenance, 2 maintenance-only).
- `profiles`: Student/admin profiles with phone number, academic department ID, and granular lock flags (`name_locked`, `enrollment_locked`, `phone_locked`).
- `complaints`: Core attributes include `student_department_id`, `maintenance_department_id`, `status` (initial 'Pending'), `support_count` (base 1), `last_meaningful_update_at`.
- `complaint_supports`: Active/revoked state tracking supporting base-1 calculation: `1 + active support records`.
- `complaint_timeline`: Discrete lifecycle records for status changes, progress updates, clarification requests, and student replies.
- `phone_change_requests`: Academic Department Admin approval workflow with failure-safe one-time permission consumption.
- `complaint_warnings`: Principal manual warnings for delayed unresolved complaints (>5 days) and admin responses.
- `department_admins`: Dynamic database-backed admin assignments with explicit `scope: 'academic' | 'maintenance'`.
- `audit_logs`: Append-only audit records capturing all lifecycle and administrative mutations.
- `complaint-attachments` Storage Bucket: 5 MB ceiling, restricted to `['jpg', 'jpeg', 'png', 'pdf']`.

### C. Test Verification Evidence
- **Automated Test Suite:** `node --test tests/day1-database-foundation.test.mjs`
  - Tests Run: 12
  - Passed: 12
  - Failed: 0
  - Duration: ~125 ms
- **TypeScript Strict Compilation:** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0 (zero errors).
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (✔ No ESLint warnings or errors).
- **Appwrite Provisioning Dry-Run:** `node scripts/setup-appwrite.mjs` → Exited with code 0 (Schema validated, non-destructive safety verified).

### D. Day 2 Dependencies
- Day 2 Workstream: Student Onboarding & Complaint Creation.
- Dependencies: Requires user approval of Day 1 handoff before frontend UI or backend handler implementation begins.

---

## 8. Day 2 Execution Handoff: Student Onboarding & Complaint Creation (Completed)

**Date:** 10 November 2026  
**Status:** DAY 2 WORKSTREAM COMPLETE — READY FOR DAY 3 APPROVAL GATE  
**Scope Achieved:** Mandatory 10-digit phone collection & server-side validation (`/^[6-9]\d{9}$/`), profile credential locking (`name_locked`, `enrollment_locked`, `phone_locked`), 6-department registry & maintenance department selector on complaint creation, server-derived creator identity and `student_department_id`, and complete removal of public complaint UI/schema/API behavior.

### A. Modified & Created Files (Day 2)
1. `functions/campusvoice-api/src/departments.ts` (new) — Backend canonical 6-department registry, `[7:9]` enrollment extraction/mapping (`06` Civil, `07` Computer; unmapped rejected), phone & name regexes, status normalization, and typed `DatabaseClientLike` interface.
2. `functions/campusvoice-api/src/index.ts` — Updated `health` response `active_departments` to return all 6 institutional departments.
3. `functions/campusvoice-api/src/handlers/profile.ts` — Updated `handleGetProfile`, `handleCompleteOnboarding`, and `handleListDepartments` to enforce 10-digit phone validation, derive `student_department_id` server-side, lock name/enrollment/phone, block admin/principal onboarding, and return all 6 departments.
4. `functions/campusvoice-api/src/handlers/complaints.ts` — Updated `handleCreateComplaint` and complaint/admin handlers to require valid active `maintenance_department_id`, derive `student_department_id` & identity from trusted profile, initialize `status: 'Pending'` and `support_count: 1`, and reject/remove `issue_type: 'public'` and `feed_type: 'public'`.
5. `functions/campusvoice-api/dist/*` — Recompiled Appwrite Cloud Function build artifacts with zero TypeScript errors.
6. `src/lib/utils/department.ts` — Added `resolveDepartment`, `getAcademicDepartments`, and `getMaintenanceDepartments` helpers.
7. `src/lib/schemas/index.ts` — Made `phone_number` required in `OnboardingSchema`, removed `issue_type` from `ComplaintCreateSchema`, and enforced `isMaintenanceDepartment` validation on `maintenance_department_id`.
8. `src/lib/api/functions.ts` — Forwarded `phone_number` in `apiCompleteOnboarding`, removed `issue_type` from `apiCreateComplaint`, and removed `feed_type: 'public'` from `ListComplaintsParams`.
9. `src/lib/hooks/useAuth.tsx` & `src/app/auth/callback/page.tsx` — Updated `isOnboarded` checks for locked phone completeness and added `isPrincipal` flag.
10. `src/app/onboarding/page.tsx` — Added mandatory 10-digit phone field with live `/^[6-9]\d{9}$/` validation, updated enrollment `[7:9]` card using `extractAndMapEnrollment`, and updated lock notice for name, enrollment, and phone.
11. `src/app/complaints/new/page.tsx` — Replaced read-only single department with a 6-department Maintenance Department selector loaded via `apiListDepartments`, displayed read-only Academic Department context, enforced 5 MB & PDF/JPG/JPEG/PNG attachment file-selection checks, and removed the "Visibility Scope" public toggle.
12. `src/app/dashboard/page.tsx`, `src/app/complaints/[id]/page.tsx`, `src/app/admin/page.tsx`, `src/app/api/health/route.ts` — Removed public feed/issue UI, aligned canonical statuses (`Pending`, `In Progress`, `Resolved`), and displayed maintenance & academic department context across all 6 departments.
13. `src/components/DepartmentBadge.tsx`, `src/components/ComplaintStatusBadge.tsx`, `src/components/SearchAndFilterBar.tsx`, `src/components/ComplaintCard.tsx`, `src/components/AdminResolutionModal.tsx` — Removed public badges/tabs, added 6-department icons, and normalized status display/filters.
14. `functions/campusvoice-api/src/__tests__/profile.test.ts`, `functions/campusvoice-api/src/__tests__/complaints.test.ts`, `tests/phase2.test.mjs`, `tests/phase3.test.mjs` — Added Day 2 integration & source-verification tests (preserving all existing tests unchanged).
15. `src/app/antigravity.md`, `src/components/antigravity.md`, `src/lib/schemas/antigravity.md`, `functions/campusvoice-api/antigravity.md` — Updated module documentation.

### B. Known Gaps / Deferred to Subsequent Days
- **Day 3 Scope:** Peer PII/attachment redaction (`student_name`, `student_enrollment_no`, `attachment_file_id` masking in `handleListComplaints` and `handleGetComplaint`), Appwrite Storage file upload & server-side existence/ownership/MIME/5 MB validation.
- **Day 4 Scope:** Complaint immutability timeline (`complaint_timeline`), `remove-support` & re-support lifecycle, atomic/derived `1 + active_supports` count.
- **Day 5–6 Scope:** Phone-change approval workflow, database-backed `department_admins` / `principal` authorization, 5-day delay & warning engine, append-only `audit_logs`.
- **Deployment / Live Appwrite:** Live Appwrite Cloud schema migration (`scripts/setup-appwrite.mjs`) and Cloud Function redeployment are not yet executed and require explicit approval/migration plan execution.

### C. Day 3 Dependencies
- Day 3 Workstream: Academic-department feed isolation, server-side peer PII & attachment redaction, and private attachment upload + server validation.
- Dependencies: Review Day 2 test/build evidence and approve transition to Day 3.

---

## 9. Day 3 Execution Handoff: Privacy and Attachment Security (Completed)

**Date:** 11 November 2026  
**Status:** DAY 3 WORKSTREAM COMPLETE — READY FOR DAY 4 APPROVAL GATE  
**Scope Achieved:** Academic-department student feed isolation (`student_department_id`), maintenance-department admin queue isolation (`maintenance_department_id`) across all 6 maintenance departments, server-side peer PII and attachment metadata redaction (`handleListComplaints`, `handleGetComplaint`), full-detail authorization for Creator, concerned Maintenance Admin, and Principal (including creator phone lookup and `get-support-state` cross-department guard), private Appwrite Storage upload + server-side existence/ownership/private-permission/5 MB/MIME/magic-byte validation + post-create permission lockdown (`[]`), and authorized-only `get-complaint-attachment` download.

### A. Modified & Created Files (Day 3)
1. `functions/campusvoice-api/src/types.ts` & `src/types/models.ts` — Made creator PII fields (`student_user_id`, `student_name`, `student_enrollment_no`) optional for peer-redacted projections; added `student_phone_number`, `is_own_complaint`, and `ComplaintAttachmentData`.
2. `functions/campusvoice-api/src/db.ts` & `functions/campusvoice-api/src/departments.ts` — Added `departmentAdminsCollectionId`, `storageBucketId`, `Storage` server client, and `StorageClientLike` interface.
3. `functions/campusvoice-api/src/auth.ts` — Enhanced `verifyCaller` to resolve database-backed `department_admins` assignments and `principal` profile role while preserving legacy env allowlist fallback when no DB admin records exist.
4. `functions/campusvoice-api/src/handlers/complaints.ts` & `functions/campusvoice-api/src/index.ts` — Implemented `projectComplaint` server-side peer PII/attachment redaction, `resolveAuthorizedMaintenanceDeptIds` across all 6 departments (blocking academic-only or revoked admins from maintenance queues), `handleGetComplaint` / `handleGetSupportState` role & oracle-elimination guards, `validateAttachmentForComplaint` (existence, uploader-only `$permissions` ownership, replay linkage check, `<= 5 MB`, MIME + extension + magic bytes, and `$permissions = []` lockdown), and `handleGetComplaintAttachment` (`get-complaint-attachment`).
5. `functions/campusvoice-api/dist/*` — Recompiled Appwrite Cloud Function build artifacts with zero TypeScript errors.
6. `scripts/setup-appwrite.mjs` — Hardened `complaint-attachments` storage bucket (`Permission.create(Role.users())`, `fileSecurity: true`, `5242880` bytes, `['jpg', 'jpeg', 'png', 'pdf']` on both create and update) and added `idx_cmpl_attachment` index on `complaints`.
7. `src/lib/schemas/index.ts`, `src/lib/appwrite/client.ts`, `src/lib/api/functions.ts` — Added `attachment_file_id` format validation, `attachmentsBucketId` config, and `apiGetComplaintAttachment`.
8. `src/app/complaints/new/page.tsx` — Wired private Appwrite Storage file upload (`Permission.read(Role.user(...))` + `Permission.delete(Role.user(...))`), extension + MIME + 5 MB UX validation, attachment clear button, and orphan deletion if complaint creation fails.
9. `src/app/complaints/[id]/page.tsx` — Added conditional `Authorized Submitter Details` card (only rendered when authorized backend fields are present) and private `Download` button calling `apiGetComplaintAttachment` (zero public Storage URLs).
10. `src/app/dashboard/page.tsx`, `src/app/admin/page.tsx`, `src/components/AdminResolutionModal.tsx` — Updated `My Submissions` filtering to use `is_own_complaint` and safely guarded optional creator fields in admin views.
11. `functions/campusvoice-api/src/__tests__/complaints.test.ts` & `tests/phase3.test.mjs` — Added Day 3 privacy, IDOR, role matrix, attachment security, and source-verification tests (preserving all existing tests intact).
12. `functions/campusvoice-api/antigravity.md`, `src/app/antigravity.md`, `src/types/antigravity.md`, `src/lib/api/antigravity.md`, `src/lib/schemas/antigravity.md` — Updated module documentation.

### B. Test Verification Evidence (Day 3)
- **TypeScript Strict Compilation (Frontend):** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0.
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (`✔ No ESLint warnings or errors`).
- **Cloud Function Build & Tests:** `npm --prefix functions/campusvoice-api run build:local` & `npm --prefix functions/campusvoice-api test` → 19/19 passed (0 failed, 0 skipped).
- **Workspace Test Suites:** `node --test tests/*.test.mjs` → 39/39 passed (0 failed, 0 skipped).
- **Appwrite Provisioning Dry-Run:** `node scripts/setup-appwrite.mjs` → Exited with code 0 (dry-run only; no live Appwrite changes performed).
- **Next.js Production Build:** `npm run build` → Exited with code 0.

### C. Known Gaps / Deferred to Subsequent Days
- **Day 4 Scope:** Immutable complaint timeline (`complaint_timeline`), status/progress/clarification/reply timeline endpoints replacing direct `official_response` returns, base-1 support count derivation (`1 + active_supports`), `remove-support` & re-support lifecycle, and support concurrency verification.
- **Day 5–6 Scope:** Phone-change approval workflow, Principal dashboard (`/principal`), 5-day delay & warning engine, Principal admin/permission/settings management, removal of legacy env admin allowlists, and append-only `audit_logs`.
- **Deployment / Live Appwrite:** Live Appwrite Cloud schema/bucket provisioning (`scripts/setup-appwrite.mjs`) and `campusvoice-api` Cloud Function redeployment are not yet executed and require explicit approval.

### D. Day 4 Dependencies
- Day 4 Workstream: Complaint timeline immutability (`complaint_timeline`), Maintenance Admin status/progress/clarification flows, and support baseline/removal/re-support lifecycle.
- Dependencies: Review Day 3 verification evidence and approve transition to Day 4.

---

## 10. Step 5 Recovery Handoff: Canonical Department Registry (Completed Locally — Migration Pending)
**Date:** 11 November 2026
**Status:** CANONICAL DEPARTMENT REGISTRY IMPLEMENTED & VERIFIED LOCALLY — LIVE APPWRITE MIGRATION PENDING
**Scope Achieved:**
- Established exact parity between frontend (`src/lib/utils/department.ts`) and backend (`functions/campusvoice-api/src/departments.ts`) registries with the 6 canonical internal IDs (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`), completely independent of enrollment codes.
- Configured confirmed enrollment mappings in `ENROLLMENT_CODE_MAPPINGS`: `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, `19` → `dept_mech`.
- Removed invented codes (`03`, `04`, `05`, `08`), Water/Sanitation enrollment-code aliases (`water`, `sanitation`), hardcoded `06`/`07` onboarding preview mappings, unsafe `dept_comp` fallbacks, and code-based `DepartmentBadge` assumptions.
- Enforced Water and Sanitation as maintenance-only (`is_academic: false`, `is_maintenance: true`) with zero enrollment codes, rejected as student academic departments and academic admin scopes while selectable as active maintenance departments.
- Updated `src/types/models.ts`, `functions/campusvoice-api/src/types.ts`, and `src/lib/schemas/index.ts` with `DepartmentId`, `AcademicDepartmentId`, `MaintenanceDepartmentId`, and `EnrollmentMapping`, removing required `code` from `Department` and `DepartmentSchema`.
- Updated `scripts/setup-appwrite.mjs` to seed canonical `$id` values without `departments.code` or `idx_dept_code` (not executed against live Appwrite).

### Pending Live Migration & Unresolved Authorization Dependencies
- **Live Appwrite Migration Pending:** Existing live `departments` documents have immutable `$id` values (`'06'`, `'07'`) and required `departments.code` / unique index (`idx_code` / `idx_dept_code`). Safe migration steps are documented in `docs/schema.md` Section 5.
- **Unresolved Admin Authorization Dependency:** Legacy env allowlists exist only for `ADMIN_ALLOWLIST_06` (`dept_civil`) and `ADMIN_ALLOWLIST_07` (`dept_comp`). Administrators for `dept_elec`, `dept_mech`, `dept_water`, and `dept_sanit` require verified DB records in `department_admins` (not invented in env allowlists).
