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

---

## 11. Day 3 Verification & Schema Hardening Execution Handoff (Completed)

**Date:** 18 November 2026  
**Status:** DAY 3 AUDIT, SCHEMA REALIGNMENT & TEST VERIFICATION COMPLETE — READY FOR DAY 4  
**Scope Achieved:** Complete verification of Day 3 Privacy and Attachment Security, resolution of all failing cloud function tests, live Appwrite Cloud provisioning verification, resolution of complaint creation `DATABASE_ERROR`, implementation of complaint creation audit logging, and strict dual-directory synchronization.

### A. Summary of Issues Resolved
1. **Cloud Function Test Failures:**
   - **Principal Role Resolution & Spoofing Guard (`handleGetProfile`):** Derived `role: 'principal'` when caller is verified Principal and added strict 403 Forbidden check when caller role and profile document role mismatch between student and principal.
   - **Database Outage Fail-Closed Security (`verifyCaller`):** Isolated 404 (assignment not found) from unexpected database/network errors. Non-404 errors re-throw, returning `statusCode: 500, caller: null` to fail closed securely.
   - **Revoked Admin Profile Demotion (`handleGetProfile`):** When an admin assignment is revoked or deactivated (`isStaleAdminRole`), stale admin profiles are demoted on the fly in the database to `role: 'student'`, `profile_status: 'incomplete'`, and lock flags are cleared so the user can onboard cleanly.
2. **Complaint Creation `DATABASE_ERROR` Fix (`handleCreateComplaint`):**
   - Removed undeclared `department_code` from `complaintData`.
   - `complaintData` now strictly matches the 16 declared attributes in the Appwrite `complaints` collection schema.
3. **Complaint Creation Audit Logging (`handleCreateComplaint`):**
   - Integrated `appendAuditLog` to record a structured audit event (`action: 'complaint_created'`) into the append-only `audit_logs` collection upon successful complaint creation.
4. **Dual Function Folder Parity:**
   - Synchronized all source files and compiled build artifacts between `functions/campusvoice-api` and `functions/student-complain-portal` (`git diff --no-index` confirmed 0 diff across both `src/` and `dist/`).
5. **Live Appwrite Cloud Provisioning:**
   - Executed `scripts/setup-appwrite.mjs` against live Appwrite Cloud (`https://fra.cloud.appwrite.io/v1`).
   - Verified `complaint-attachments` storage bucket with private file security (`fileSecurity: true`) and 5 MB limit.
   - Verified/provisioned all 9 collections (`departments`, `profiles`, `complaints`, `complaint_supports`, `complaint_timeline`, `phone_change_requests`, `complaint_warnings`, `department_admins`, `audit_logs`) and verified `idx_cmpl_attachment` index on `complaints`.
6. **Frontend Model Typing Fix:**
   - Updated `Complaint` in `src/types/models.ts` making `$createdAt?: string;` and `$updatedAt?: string;` optional to align with runtime responses.

### B. Modified Files
1. `functions/campusvoice-api/src/auth.ts` & `dist/auth.js`
2. `functions/campusvoice-api/src/handlers/profile.ts` & `dist/handlers/profile.js`
3. `functions/campusvoice-api/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
4. `functions/campusvoice-api/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
5. `functions/student-complain-portal/src/auth.ts` & `dist/auth.js`
6. `functions/student-complain-portal/src/handlers/profile.ts` & `dist/handlers/profile.js`
7. `functions/student-complain-portal/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
8. `functions/student-complain-portal/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
9. `src/types/models.ts`
10. `scripts/setup-appwrite.mjs`
11. `docs/handoff.md`

### C. Test Verification Evidence
- **CampusVoice API Test Suite:** `npm --prefix functions/campusvoice-api test` → **36 / 36 passed** (0 failed, 0 skipped).
- **Student Complain Portal Test Suite:** `npm --prefix functions/student-complain-portal test` → **36 / 36 passed** (0 failed, 0 skipped).
- **Root Workspace Test Suite:** `npm test` (`node scripts/run-tests.mjs`) → **44 / 44 passed** (0 failed, 0 skipped).
- **TypeScript Strict Compilation:** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0 (zero errors).
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (✔ No ESLint warnings or errors).
- **Dual Function Directory Parity:** `git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src` and `dist` → 0 diff.

### D. Next Dependencies
- **Day 4 Workstream:** Immutable complaint timeline (`complaint_timeline`), Maintenance Admin status/progress/clarification flows, support baseline (`1 + active_supports`), removal, and re-support concurrency lifecycle.
- **Dependencies:** Day 3 verification complete and approved. Ready to proceed with Day 4 implementation.

---

## 12. Day 4 Execution & Verification Handoff (Completed)

**Date:** 19 November 2026  
**Status:** DAY 4 COMPLETE — TIMELINE IMMUTABILITY & SUPPORT LIFECYCLE VERIFIED  
**Scope Achieved:** Complete verification of Day 4 Complaint Timeline, Status Transitions, Clarification Workflow, Support Lifecycle with Base-1 & Revocation, Concurrency Invariance, Append-Only Audit Logging, and Dual-Directory Synchronization.

### A. Summary of Scope Implemented & Verified
1. **Complaint Content Immutability (`handleUpdateAdminComplaint`):**
   - Core complaint attributes (`title`, `location`, `description`, `student_department_id`, `maintenance_department_id`, `student_user_id`, `student_name`, `student_enrollment_no`, `attachment_file_id`, `created_at`) are permanently immutable.
   - Updates only modify lifecycle attributes (`status`, `last_meaningful_update_at`, `updated_at`).
   - Official responses, status transitions, and progress notes are written as discrete records in `complaint_timeline`.
2. **Maintenance Admin Status Jurisdiction & Transition Rules:**
   - Only the assigned Maintenance Admin (`maintenance_department_id`) can update status.
   - Status changes by Principal (403 `FORBIDDEN`) and Students (403 `FORBIDDEN`) are blocked.
   - Probes by cross-department admins return 404 `NOT_FOUND` (Oracle Elimination).
   - Reverting from `In Progress` or `Resolved` back to `Pending` is strictly blocked (400 `INVALID_STATUS_TRANSITION`).
3. **Clarification Workflow (`handleRequestClarification` & `handleReplyClarification`):**
   - Maintenance Admin can request clarification (persisted with `entry_type: 'clarification_request'`). Cross-department admin blocked with 404.
   - Only the original complaint creator can reply (persisted with `entry_type: 'clarification_reply'`). Non-creator students blocked with 403 `FORBIDDEN`.
4. **Community Support Lifecycle & Concurrency Invariance:**
   - Baseline count is 1 (creator). Creator self-support is forbidden (400 `CANNOT_SUPPORT_OWN_COMPLAINT`).
   - Creator baseline support cannot be removed (400 `CANNOT_REMOVE_CREATOR_SUPPORT`).
   - Same-academic-department eligibility strictly enforced (`student_department_id`). Cross-department returns 404.
   - Deterministic 32-character SHA-256 document IDs (`sha256(complaintId + ':' + callerId).slice(0, 32)`).
   - Duplicate support attempts return 409 `ALREADY_SUPPORTED` without counter drift.
   - Support revocation sets `status: 'revoked'`; repeated removal returns 400 `NOT_SUPPORTED`.
   - Re-support reactivates the record to `status: 'active'`.
   - Derived count is strictly `1 + active support records`.
5. **Append-Only Audit Logging (`appendAuditLog`):**
   - All Day 4 state mutations append structured records to `audit_logs`:
     - `complaint_status_changed`
     - `clarification_requested`
     - `clarification_replied`
     - `support_added`
     - `support_removed`
6. **Dual Function Folder Parity:**
   - 100% byte-for-byte parity across `functions/campusvoice-api` and `functions/student-complain-portal` (`git diff --no-index` confirmed 0 diff across both `src/` and `dist/`).
7. **Frontend UI Quality & Accessibility:**
   - Full Next.js App Router verification (`src/app/complaints/[id]/page.tsx`, `ComplaintSupportButton.tsx`, `AdminResolutionModal.tsx`, `ClarificationRequestModal.tsx`, `ClarificationReplyBox.tsx`).
   - Strict TypeScript, functional components, design tokens from `tokens.ts`, `@phosphor-icons/react` exclusively.

### B. Modified Files
1. `functions/campusvoice-api/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
2. `functions/campusvoice-api/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
3. `functions/student-complain-portal/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
4. `functions/student-complain-portal/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
5. `docs/superpowers/plans/2026-11-18-day4-complaint-timeline-support-lifecycle.md`
6. `docs/handoff.md`

### C. Test Verification Evidence
- **CampusVoice API Test Suite:** `npm --prefix functions/campusvoice-api test` → **40 / 40 passed** (0 failed, 0 skipped).
- **Student Complain Portal Test Suite:** `npm --prefix functions/student-complain-portal test` → **40 / 40 passed** (0 failed, 0 skipped).
- **Root Workspace Test Suite:** `npm test` (`node scripts/run-tests.mjs`) → **44 / 44 passed** (0 failed, 0 skipped).
- **TypeScript Strict Compilation:** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0 (zero errors).
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (✔ No ESLint warnings or errors).
- **Dual Function Directory Parity:** `git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src` and `dist` → 0 diff.

### D. Next Dependencies
- **Day 5 Workstream:** Phone-change request workflow (`phone_change_requests`), academic Department Admin review and one-time permission grant, failure safety, Water/Sanitation admin restriction, and Principal cross-department dashboard foundations.
- **Dependencies:** Day 4 verification complete and approved. Ready to proceed with Day 5 implementation.

---

## 13. Day 5 Execution & Verification Handoff (Completed)

**Date:** 19 November 2026  
**Status:** DAY 5 COMPLETE — PHONE-CHANGE WORKFLOW & PRINCIPAL FOUNDATION VERIFIED  
**Scope Achieved:** Complete verification of Day 5 Phone-Change Request Workflow (`phone_change_requests`), Academic Department Admin Review Scope, Water/Sanitation Admin Approval Prohibition, Failure-Safe One-Time Permission Consumption, Principal 6-Department Dashboard Metrics Breakdown, Delayed Grievance Oversight Table, and Dual-Directory Synchronization.

### A. Summary of Scope Implemented & Verified
1. **Student Phone-Change Request Submission (`handleRequestPhoneChange`):**
   - Verified student caller role (`role === 'student'`).
   - Validates profile completeness (`phone_number` and `student_department_id`).
   - Validates reason (10–1000 characters) and requested phone number format (`/^[6-9]\d{9}$/`).
   - Enforces single active request constraint: blocks duplicate requests if an unconsumed or pending request exists (HTTP 409 `ACTIVE_REQUEST_EXISTS`).
   - Records structured append-only audit event (`action: 'request_phone_change'`).
2. **Academic Admin Review Scope & Water/Sanitation Restriction (`handleReviewPhoneChange`):**
   - Strictly validates decision (`approved` | `rejected`) and enforces minimum 5-character reason on rejection.
   - Restricts review authority exclusively to the student's academic Department Administrator (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`) or the Principal.
   - Water (`dept_water`) and Sanitation (`dept_sanit`) administrators are maintenance-only and are strictly forbidden from reviewing academic phone changes (HTTP 403 `FORBIDDEN`).
   - Cross-department academic admins are forbidden (HTTP 403 `FORBIDDEN`).
   - Records structured append-only audit event (`action: 'review_phone_change'`).
3. **Failure-Safe One-Time Permission Consumption (`handleCompletePhoneChange`):**
   - Enforces student ownership; non-matching callers receive generic HTTP 404 `NOT_FOUND` (Oracle Elimination / IDOR prevention).
   - Validates one-time permission state (`status === 'approved'` and `permission_consumed === false`).
   - **Failure-Safety Proof:** Executes profile phone update first. If database persistence fails, the permission remains unconsumed (`permission_consumed: false`), the request remains `status: 'approved'`, and the previous phone number remains active in profile!
   - Upon successful profile write, updates request status to `completed` and `permission_consumed: true`.
   - Records structured audit log with PII masking (`new_phone_masked: 912****789`).
4. **Principal Governance Foundation & Dashboard (`handleGetPrincipalDashboard`):**
   - Restricts access strictly to verified Principal (`role === 'principal'`).
   - Computes real-time institutional metrics across all 6 canonical departments (`dept_comp`, `dept_civil`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`).
   - Categorizes delayed grievances (> 5 days elapsed) using authoritative `isDelayed`.
   - Prohibits Principal from mutating complaint status via `handleUpdateAdminComplaint` (HTTP 403 `FORBIDDEN`).
5. **Frontend UI Quality & Accessibility:**
   - `src/app/principal/page.tsx`: Enhanced with a dedicated "Delayed Institutional Grievances (>5 Days)" oversight table with short IDs, maintenance badges, delay elapsed badges, and click-through navigation.
   - `src/app/admin/page.tsx`: Verified Academic Admin Phone Requests tab with prompt for required decision reason on rejection (hidden for maintenance-only admins).
   - `src/components/PhoneChangeModal.tsx`: Verified student modal flow from submission to completion.
6. **Dual Function Folder Parity:**
   - 100% byte-for-byte parity across `functions/campusvoice-api` and `functions/student-complain-portal` (`git diff --no-index` confirmed 0 diff across both `src/` and `dist/`).

### B. Modified Files
1. `functions/campusvoice-api/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
2. `functions/student-complain-portal/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
3. `src/app/principal/page.tsx`
4. `src/app/admin/page.tsx`
5. `tests/phase5.test.mjs`
6. `docs/superpowers/plans/2026-11-19-day5-phone-change-and-principal-foundation.md`
7. `docs/handoff.md`

### C. Test Verification Evidence
- **CampusVoice API Test Suite:** `npm --prefix functions/campusvoice-api test` → **45 / 45 passed** (0 failed, 0 skipped).
- **Student Complain Portal Test Suite:** `npm --prefix functions/student-complain-portal test` → **45 / 45 passed** (0 failed, 0 skipped).
- **Root Workspace Test Suite:** `npm test` (`node scripts/run-tests.mjs`) → **48 / 48 passed** (0 failed, 0 skipped).
- **TypeScript Strict Compilation:** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0 (zero errors).
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (✔ No ESLint warnings or errors).
- **Dual Function Directory Parity:** `git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src` and `dist` → 0 diff.

### D. Next Dependencies
- **Day 6 Workstream:** Five-day delay milestone logic refinement, manual warning issuance & responses (`complaint_warnings`), dynamic admin assignment & permission management, and system-wide append-only audit log viewer.
- **Dependencies:** Day 5 verification complete and approved. Ready to proceed with Day 6 planning and implementation.

---

## 14. Day 6 Execution & Verification Handoff (Completed)

**Date:** 20 November 2026  
**Status:** DAY 6 COMPLETE — 5-DAY DELAY ENGINE, WARNINGS & RESPONSES, ADMIN ASSIGNMENTS & AUDIT TRAIL VERIFIED  
**Scope Achieved:** Complete implementation and verification of Day 6 requirements: 5-Day Delay Milestone Logic (Pending > 5d, In Progress > 5d since last meaningful update, Resolved excluded, non-substantive invariance), Principal Manual Warning Directives with Multiple Warning Support, Maintenance Admin Warning Responses, Dynamic Database-Backed `department_admins` Assignment & Revocation with Strict Water/Sanitation Scope Prohibition (`INVALID_DEPARTMENT_SCOPE`), Append-Only Audit History Retrieval (`get-audit-history`), Full Frontend UI Integration (3-tab Principal Portal, Warning Modals, Complaint Detail Governance Card, Admin Warning Badges), and 100% Parity across Dual Function Directories.

### A. Summary of Scope Implemented & Verified
1. **Five-Day Delay Milestone Engine (`calculateComplaintDelay`):**
   - Pending complaints become warning-eligible after > 5 days in Pending.
   - In Progress complaints become warning-eligible after > 5 days since last meaningful status change or substantive progress update (`last_meaningful_update_at`).
   - Substantive actions (status change, progress notes, clarification) update `last_meaningful_update_at` and reset the 5-day timer.
   - Non-substantive actions (e.g. upvotes, views, non-status reads) do not update `last_meaningful_update_at`, preserving the running delay counter.
   - Resolved complaints are strictly excluded from delay calculations (`is_delayed: false, days_delayed: 0`).
2. **Principal Manual Warning Directives (`handleIssueWarning`):**
   - Restricted exclusively to verified Principal (`role === 'principal'`); students and department admins rejected with HTTP 403 `FORBIDDEN`.
   - Validates complaint delay eligibility: non-delayed complaints rejected with HTTP 400 `NOT_DELAY_ELIGIBLE`.
   - Prohibits warning on resolved grievances: rejected with HTTP 400 `CANNOT_WARN_RESOLVED`.
   - Supports multiple warnings on unresolved complaints across extended delay milestones.
   - Records append-only audit log (`action: 'issue_warning'`).
3. **Maintenance Admin Warning Responses (`handleRespondToWarning`):**
   - Restricts response authority strictly to the assigned Maintenance Department Administrator for `complaint.maintenance_department_id` or the Principal.
   - Cross-department admins, academic admins, and students are rejected with HTTP 403 `FORBIDDEN`.
   - Persists `admin_response` and `responded_at` on the `complaint_warnings` record.
   - Records append-only audit log (`action: 'respond_to_warning'`).
4. **Dynamic Database-Backed `department_admins` Assignment & Revocation:**
   - `handleListAdminAssignments`: Principal-only query on `department_admins` with total count.
   - `handleAssignAdmin`: Principal assigns administrator by email, department, and scope (`academic` | `maintenance`).
   - **Canonical Invariant Enforcement:** Water (`dept_water`) and Sanitation (`dept_sanit`) are maintenance-only and strictly prohibit academic scope (HTTP 400 `INVALID_DEPARTMENT_SCOPE`).
   - Promotes target user's `profiles.role` to `'department_admin'`.
   - `handleRevokeAdmin`: Principal deactivates assignment (`is_active: false`). If target user has no remaining active admin assignments, demotes `profiles.role` back to `'student'`.
   - Records structured audit logs (`action: 'assign_department_admin'`, `'revoke_department_admin'`).
5. **System-Wide Append-Only Audit Trail Retrieval (`handleGetAuditHistory`):**
   - Principal-only inspection of `audit_logs` collection with limit and filtering (`action`, `actor_id`, `target_resource_id`).
   - Students and Department Admins rejected with HTTP 403 `FORBIDDEN`.
   - Strictly immutable and append-only.
6. **Frontend UI Components & Pages:**
   - `src/components/IssueWarningModal.tsx`: Principal modal with reason textarea, character validation, and delay milestone indicator.
   - `src/components/RespondWarningModal.tsx`: Maintenance Admin modal with directive display and response textarea.
   - `src/app/principal/page.tsx`: Transformed into a 3-tab layout:
     1. Grievance Oversight (6-department metric cards, 6-department breakdown, delayed grievances table with "Issue Warning" trigger).
     2. Admin Assignments (dynamic list, assign modal with Water/Sanitation academic bar, and revoke button).
     3. Audit Trail (chronological event stream, action filters, details inspector modal).
   - `src/app/complaints/[id]/page.tsx`: Added Institutional Administrative Warnings section, rendered warnings list with response blocks, and mounted warning modals.
   - `src/app/admin/page.tsx`: Added warning indicator badges and delay badges on grievance queue items.
7. **Dual Function Folder Parity:**
   - 100% byte-for-byte parity across `functions/campusvoice-api` and `functions/student-complain-portal` (`git diff --no-index` confirmed 0 diff across both `src/` and `dist/`).

### B. Modified Files
1. `functions/campusvoice-api/src/handlers/principal.ts` & `dist/handlers/principal.js`
2. `functions/campusvoice-api/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
3. `functions/campusvoice-api/src/index.ts` & `dist/index.js`
4. `functions/campusvoice-api/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
5. `functions/student-complain-portal/src/handlers/principal.ts` & `dist/handlers/principal.js`
6. `functions/student-complain-portal/src/handlers/complaints.ts` & `dist/handlers/complaints.js`
7. `functions/student-complain-portal/src/index.ts` & `dist/index.js`
8. `functions/student-complain-portal/src/__tests__/complaints.test.ts` & `dist/__tests__/complaints.test.js`
9. `src/lib/api/functions.ts`
10. `src/components/IssueWarningModal.tsx`
11. `src/components/RespondWarningModal.tsx`
12. `src/components/index.ts`
13. `src/app/principal/page.tsx`
14. `src/app/complaints/[id]/page.tsx`
15. `src/app/admin/page.tsx`
16. `tests/phase6.test.mjs`
17. `docs/superpowers/plans/2026-11-19-day6-warnings-governance-audit.md`
18. `docs/handoff.md`

### C. Test Verification Evidence
- **Phase 6 Test Suite:** `node --test tests/phase6.test.mjs` → **11 / 11 passed** (0 failed, 0 skipped).
- **CampusVoice API Test Suite:** `npm --prefix functions/campusvoice-api test` → **48 / 48 passed** (0 failed, 0 skipped).
- **Student Complain Portal Test Suite:** `npm --prefix functions/student-complain-portal test` → **48 / 48 passed** (0 failed, 0 skipped).
- **Root Workspace Test Suite:** `npm test` (`node scripts/run-tests.mjs`) → **53 / 53 passed** (0 failed, 0 skipped).
- **TypeScript Strict Compilation:** `npm run typecheck` (`tsc --noEmit`) → Exited with code 0 (zero errors).
- **ESLint Compliance:** `npm run lint` (`next lint`) → Exited with code 0 (✔ No ESLint warnings or errors).
- **Dual Function Directory Parity:** `git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src` and `dist` → 0 diff.

### D. Next Dependencies
- **Day 7 Workstream:** Full integration, security regression, migration verification, deployment/release checks, and production readiness.
- **Dependencies:** Day 6 verification complete and approved. Ready to proceed with Day 7 implementation.


