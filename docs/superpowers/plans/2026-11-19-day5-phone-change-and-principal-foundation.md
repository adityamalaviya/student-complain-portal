# Day 5: Phone-Change Workflow and Principal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement, harden, and verify all Day 5 requirements: student phone-change request submission to their own academic Department Admin; academic admin review (approval/rejection with reason); one-time update permission grant; failure-safe permission consumption (permission consumed ONLY after successful database save; old phone and permission preserved on failure); Water and Sanitation admin approval prohibition; cross-department admin isolation; Principal authentication, authorization, and 6-department governance dashboard foundation; append-only audit logging; dual-directory function synchronization; and complete test suite verification.

**Architecture:**
- **Backend (Appwrite Cloud Function `campusvoice-api`):**
  - `phoneChange.ts`: Implements `handleRequestPhoneChange`, `handleReviewPhoneChange`, `handleCompletePhoneChange`, and `handleListPhoneChangeRequests`. Validates phone numbers against `/^[6-9]\d{9}$/`. Enforces academic admin scope check (`scope: 'academic' && department_id === academicDeptId`). Strictly blocks Water (`dept_water`) and Sanitation (`dept_sanit`) admins (403 `FORBIDDEN`). Protects against IDOR using generic 404 (Oracle Elimination). Implements failure-safe two-phase update where profile phone is updated first, and permission is marked consumed only upon successful profile write.
  - `principal.ts`: Implements `handleGetPrincipalDashboard`. Aggregates institutional metrics across all 6 canonical departments (`dept_comp`, `dept_civil`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`). Identifies 5-day delayed complaints. Enforces strict role guard (`role === 'principal'`). Forbids Principal from changing complaint status in `handleUpdateAdminComplaint` (403 `FORBIDDEN`).
  - `audit.ts`: Appends structured, tamper-resistant audit entries in `audit_logs` for `request_phone_change`, `review_phone_change`, and `complete_phone_change` (with PII masking).
- **Frontend (Next.js App Router):**
  - `src/components/PhoneChangeModal.tsx`: Complete student modal with phone status tracking, change request form, and one-time permission update submission.
  - `src/app/admin/page.tsx`: Scoped review tab for academic Department Admins with pending counts, quick approval/rejection actions, and decision reason capture. Excluded for maintenance-only admins.
  - `src/app/principal/page.tsx`: Institutional governance dashboard displaying real-time metrics for all 6 departments and delayed complaint oversight table.
- **Testing & Safety:**
  - Mock database testing in `functions/campusvoice-api/src/__tests__/complaints.test.ts` (and mirrored in `functions/student-complain-portal`).
  - Unit/integration simulation in `tests/phase5.test.mjs`.
  - Strict preservation of test integrity. No new test folders.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict mode, zero `any`), Appwrite Cloud Node SDK (`node-appwrite`), Tailwind CSS, `@phosphor-icons/react`, Node.js test runner (`node:test`).

**Spec:** `docs/handoff.md`, `docs/CampusVoice_Requirement_Gap_Audit_Updated_7_Day_Plan.txt`, `docs/contracts.md`, `docs/schema.md`.

---

## Global Constraints

- **Credentials & Secrets:** NEVER read, log, or expose `.env`, `.env.*`, or `secrets/**`. Store secrets in environment variables only.
- **Permissions:** All Appwrite collections (`phone_change_requests`, `profiles`, `complaints`, `complaint_warnings`, `audit_logs`, etc.) use strictly empty client permissions (`$permissions = []`). All mutations and reads execute server-side via server API keys.
- **TypeScript Quality:** Strict mode always — zero `any` types allowed, zero `as unknown as X` type casts.
- **Design Tokens & Icons:** Tailwind CSS tokens from `src/styles/tokens.ts`. `@phosphor-icons/react` exclusively — no other icon libraries.
- **Test Integrity:** Preserve test-case integrity: never change, weaken, delete, or rewrite a failing test merely to obtain a passing result. Store test cases in existing test files only (`tests/phase5.test.mjs`, `functions/campusvoice-api/src/__tests__/complaints.test.ts`). Do NOT create new test folders. Show complete test output.
- **Dual Directory Parity:** Both `functions/campusvoice-api` and `functions/student-complain-portal` must remain in exact 100% source and build parity (`git diff --no-index` must be 0).
- **Commit Format:** `AG-XXX: [type]([scope]): [description]`

---

### Task 1: Phone-Change Backend Handlers Audit, Hardening & Failure-Safety Verification

**Files:**
- Inspect & Verify: `functions/campusvoice-api/src/handlers/phoneChange.ts`
- Modify if needed: `functions/campusvoice-api/src/handlers/phoneChange.ts`
- Mirror: `functions/student-complain-portal/src/handlers/phoneChange.ts`

**Interfaces:**
- Consumes: `AuthenticatedCaller`, `DatabaseClientLike`, `appendAuditLog`
- Implements:
  - `handleRequestPhoneChange`:
    - Role guard: student only (403 `FORBIDDEN`).
    - Requires complete profile with assigned `student_department_id` and existing `phone_number`.
    - Validates `reason` (10-1000 characters).
    - If `requested_phone_number` provided: validates regex `/^[6-9]\d{9}$/` and verifies it differs from current phone.
    - Active request guard: 409 `ACTIVE_REQUEST_EXISTS` if pending or approved-unconsumed request exists.
    - Creates `phone_change_requests` record with `$permissions: []`.
    - Appends audit log: `action: 'request_phone_change'`.
  - `handleReviewPhoneChange`:
    - Decision: `approved` | `rejected`. If rejected, `decision_reason` is required (5-1000 chars).
    - Request must be in `pending` status.
    - Scope guard: Only academic Department Admin for student's `academic_department_id` (or Principal) can review.
    - Water & Sanitation restriction: Maintenance-only admins have no academic assignments and are strictly blocked (403 `FORBIDDEN`).
    - Cross-department academic admin blocked (403 `FORBIDDEN`).
    - Appends audit log: `action: 'review_phone_change'`.
  - `handleCompletePhoneChange`:
    - Role guard: student only (403 `FORBIDDEN`).
    - Validates `new_phone_number` with `/^[6-9]\d{9}$/` and ensures it differs from `old_phone_number`.
    - Ownership & IDOR guard: non-matching student receives generic 404 `NOT_FOUND`.
    - Permission check: request must be `status === 'approved'` and `permission_consumed !== true` (403 `PERMISSION_NOT_AVAILABLE`).
    - **Failure Safety Invariant:**
      1. Step 1: Writes `phone_number: new_phone_number`, `phone_locked: true` to `profiles`.
      2. If Step 1 fails: returns 500 `PROFILE_SAVE_FAILED`. Permission remains UNCONSUMED (`permission_consumed: false`) and old phone remains intact in profile!
      3. Step 2: ONLY after profile write succeeds, updates request to `status: 'completed'`, `permission_consumed: true`.
    - Appends audit log: `action: 'complete_phone_change'` (with phone masked).
  - `handleListPhoneChangeRequests`:
    - Role-based scoping:
      - Student sees only own requests (`student_user_id == caller.id`).
      - Academic Admin sees only requests for their assigned academic department (`academic_department_id`).
      - Water/Sanitation maintenance admin receives 403 `FORBIDDEN`.
      - Principal sees all requests across departments.

- [ ] **Step 1: Inspect `phoneChange.ts` for schema, error code, and failure-safety invariants**
- [ ] **Step 2: Ensure dual-directory parity between `campusvoice-api` and `student-complain-portal`**

---

### Task 2: Backend Cloud Function Test Suite for Phone-Change Workflow

**Files:**
- Modify: `functions/campusvoice-api/src/__tests__/complaints.test.ts`
- Mirror: `functions/student-complain-portal/src/__tests__/complaints.test.ts`

**Interfaces:**
- Consumes: `handleRequestPhoneChange`, `handleReviewPhoneChange`, `handleCompletePhoneChange`, `handleListPhoneChangeRequests`
- Implements comprehensive automated tests covering:
  1. `handleRequestPhoneChange`:
     - Successful submission by student with complete profile.
     - Rejection for incomplete profile (no phone number).
     - Rejection for non-student caller (admin / principal).
     - Rejection for invalid reason (< 10 chars or > 1000 chars).
     - Rejection for invalid requested phone format.
     - Conflict 409 when an active request already exists.
     - Audit log verification.
  2. `handleReviewPhoneChange`:
     - Successful approval by assigned academic Department Admin.
     - Successful rejection with valid `decision_reason`.
     - Rejection when `decision_reason` is missing on reject.
     - 403 `FORBIDDEN` when Water or Sanitation maintenance admin attempts to review.
     - 403 `FORBIDDEN` when cross-department academic admin attempts to review.
     - 403 `FORBIDDEN` when student attempts to review.
     - Audit log verification.
  3. `handleCompletePhoneChange` & Failure Safety:
     - Successful phone update, profile locking, and permission consumption.
     - 404 generic not-found when non-owner student attempts completion (IDOR protection).
     - 403 when request is not approved or already consumed.
     - 400 when new phone equals old phone.
     - **Failure-Safety Proof:** When profile update fails/throws an error, verify that request document retains `permission_consumed: false`, request status is NOT completed, and old phone number in profile remains active!
     - Audit log verification with masked phone number.
  4. `handleListPhoneChangeRequests`:
     - Student sees only their own requests.
     - Academic Admin sees only requests matching their academic department.
     - Water & Sanitation maintenance admin receives 403 `FORBIDDEN`.
     - Principal sees requests across all academic departments.

- [ ] **Step 1: Write automated tests in `functions/campusvoice-api/src/__tests__/complaints.test.ts`**
- [ ] **Step 2: Mirror to `functions/student-complain-portal/src/__tests__/complaints.test.ts`**
- [ ] **Step 3: Run backend test runner**
  ```bash
  npm --prefix functions/campusvoice-api run build
  npm --prefix functions/campusvoice-api test
  ```
  Expected: All tests pass (exited with code 0).

---

### Task 3: Backend Principal Governance Foundation & Dashboard Verification

**Files:**
- Inspect & Verify: `functions/campusvoice-api/src/handlers/principal.ts`
- Modify if needed: `functions/campusvoice-api/src/handlers/principal.ts`
- Modify: `functions/campusvoice-api/src/__tests__/complaints.test.ts`
- Mirror: `functions/student-complain-portal/src/handlers/principal.ts`, `functions/student-complain-portal/src/__tests__/complaints.test.ts`

**Interfaces:**
- Consumes: `handleGetPrincipalDashboard`
- Implements:
  - Role guard: `role === 'principal'`. Students and Department Admins receive 403 `FORBIDDEN`.
  - Aggregates complaints across all 6 institutional departments:
    - `dept_comp` (Computer)
    - `dept_civil` (Civil)
    - `dept_elec` (Electrical)
    - `dept_mech` (Mechanical)
    - `dept_water` (Water)
    - `dept_sanit` (Sanitation)
  - Computes `department_breakdown` with counts for: `total`, `pending`, `in_progress`, `resolved`, `delayed`.
  - Evaluates 5-day delay eligibility using authoritative `isDelayed`.
  - Returns `delayed_complaints` with `days_delayed`, `warning_count`, `warnings`, and `is_warning_eligible`.
  - Verifies Principal cannot change complaint status (tested against `handleUpdateAdminComplaint` returning 403 `FORBIDDEN`).

- [ ] **Step 1: Verify `handleGetPrincipalDashboard` and add automated tests in `complaints.test.ts`**
- [ ] **Step 2: Mirror test and handler to `functions/student-complain-portal`**
- [ ] **Step 3: Build and run tests**
  ```bash
  npm --prefix functions/campusvoice-api run build
  npm --prefix functions/campusvoice-api test
  ```
  Expected: All tests pass.

---

### Task 4: Frontend Principal Dashboard Enhancement

**Files:**
- Modify: `src/app/principal/page.tsx`

**Interfaces:**
- Consumes: `useAuth`, `apiGetPrincipalDashboard`, `PrincipalDashboardData`
- Enhances:
  - Render a dedicated **Delayed Institutional Grievances (>5 Days)** section when `delayed_complaints.length > 0`.
  - For each delayed complaint, display:
    - Complaint Title and Short ID `#CV-XXXXXX`
    - Department Badge (maintenance department)
    - Status Badge
    - Delay Badge (`Clock` icon, days delayed in amber/red)
    - Warning count badge (if warnings exist)
    - Click-through navigation to `/complaints/[id]`
  - Ensure empty state when zero complaints are delayed ("All complaints are currently progressing within standard institutional response windows").
  - Preserve all existing 6-department breakdown cards and recent complaints table.
  - Comply with Tailwind design tokens, dark mode variants, and `@phosphor-icons/react` exclusively.

- [ ] **Step 1: Update `src/app/principal/page.tsx` to render Delayed Complaints section**
- [ ] **Step 2: Run typecheck and lint**
  ```bash
  npm run typecheck
  npm run lint
  ```
  Expected: Zero errors and zero warnings.

---

### Task 5: Frontend Phone Change Student & Admin UI Verification

**Files:**
- Inspect & Verify: `src/components/PhoneChangeModal.tsx`, `src/app/dashboard/page.tsx`, `src/app/admin/page.tsx`
- Modify if needed: `src/app/admin/page.tsx`, `src/components/PhoneChangeModal.tsx`

**Interfaces:**
- Consumes: `apiRequestPhoneChange`, `apiReviewPhoneChange`, `apiCompletePhoneChange`, `apiListPhoneChangeRequests`
- Verifies:
  - Student Dashboard (`src/app/dashboard/page.tsx`):
    - Trigger button displays current verified phone number `+91 XXXXXXXXXX`.
    - Clicking opens `PhoneChangeModal`.
    - Handles pending state, approved state with one-time input, and failure recovery.
  - Academic Admin Dashboard (`src/app/admin/page.tsx`):
    - "Phone Change Requests" tab is displayed ONLY when `isAcademicAdmin === true`.
    - Water & Sanitation maintenance admins do NOT see the tab.
    - Quick Approve / Quick Reject buttons with confirmation and decision reason.
    - Error and success feedback banners.
  - Strict compliance with tokens and `@phosphor-icons/react`.

- [ ] **Step 1: Verify `PhoneChangeModal.tsx` and `src/app/admin/page.tsx`**
- [ ] **Step 2: Run typecheck and lint**
  ```bash
  npm run typecheck
  npm run lint
  ```
  Expected: Zero errors.

---

### Task 6: Dual Directory Parity & Full Functions Compilation

**Files:**
- Synchronize: `functions/campusvoice-api` and `functions/student-complain-portal`
- Build: `dist/` in both directories

**Interfaces:**
- Guarantees:
  - `git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src` returns 0.
  - `git diff --no-index functions/campusvoice-api/dist functions/student-complain-portal/dist` returns 0.
  - All unit test suites pass in both directories.

- [ ] **Step 1: Build both function folders**
  ```bash
  npm --prefix functions/campusvoice-api run build
  npm --prefix functions/student-complain-portal run build
  ```
- [ ] **Step 2: Verify zero diff between both directories**
  ```bash
  git diff --no-index functions/campusvoice-api/src functions/student-complain-portal/src
  git diff --no-index functions/campusvoice-api/dist functions/student-complain-portal/dist
  ```
  Expected: Exited with code 0 (zero differences).

- [ ] **Step 3: Run test suite in both directories**
  ```bash
  npm --prefix functions/campusvoice-api test
  npm --prefix functions/student-complain-portal test
  ```
  Expected: All tests pass.

---

### Task 7: Root Test Suite Integration in `tests/phase5.test.mjs`

**Files:**
- Modify: `tests/phase5.test.mjs`
- Test: `npm test` (`node scripts/run-tests.mjs`)

**Interfaces:**
- Consumes: Day 5 domain invariants
- Implements new tests in `tests/phase5.test.mjs` alongside existing tests (preserving test integrity):
  1. `Day 5: Phone Change Workflow - Student request creation and active request duplicate prevention (409)`
  2. `Day 5: Phone Change Workflow - Academic Admin approval & rejection scope (Water/Sanitation admins rejected with 403)`
  3. `Day 5: Phone Change Workflow - One-time permission consumption and failure-safety (failed save preserves permission and old phone)`
  4. `Day 5: Principal Governance - Cross-department visibility across all 6 departments and status mutation prohibition`

- [ ] **Step 1: Add Day 5 test cases to `tests/phase5.test.mjs` without altering existing tests**
- [ ] **Step 2: Run root test runner**
  ```bash
  npm test
  ```
  Expected: 48+ / 48+ tests pass (0 failed, 0 skipped).

---

### Task 8: Day 5 Documentation, Handoff & Git State

**Files:**
- Modify: `docs/handoff.md`, `antigravity.md`

**Interfaces:**
- Consumes: Day 5 completion evidence and test results
- Produces: Updated `docs/handoff.md` and module `antigravity.md` reflecting completed Day 5 exit criteria.

- [ ] **Step 1: Update `docs/handoff.md` with Day 5 completion section:**
  - Date: 19 November 2026
  - Status: DAY 5 COMPLETE — PHONE-CHANGE WORKFLOW & PRINCIPAL FOUNDATION VERIFIED
  - Scope Achieved:
    1. Student phone change request to own academic Department Admin.
    2. Academic admin approval/rejection and one-time update permission grant.
    3. Failure-safe permission consumption (permission preserved on save failure).
    4. Water and Sanitation admin phone review blocked (403 `FORBIDDEN`).
    5. Cross-department academic admin blocked (403 `FORBIDDEN`).
    6. Principal authentication, 6-department dashboard data, and status change guard.
    7. Append-only audit logs for all Day 5 operations.
    8. Frontend UI verification for student modal, admin review, and principal delayed complaints oversight.
    9. Dual-directory parity verified (`0 diff`).
    10. Full test output evidence captured.
- [ ] **Step 2: Run full workspace verification (typecheck, lint, root tests)**
- [ ] **Step 3: Commit Day 5 work**
  ```bash
  git add .
  git commit -m "AG-055: feat(day5): implement and verify phone-change workflow and principal governance foundation"
  ```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Student request to own academic admin: Covered in Tasks 1, 2, 5, 7.
   - Admin approval/rejection and one-time update permission: Covered in Tasks 1, 2, 5, 7.
   - Consume permission only after successful database save (failure safety): Covered in Tasks 1, 2, 5, 7.
   - Block Water & Sanitation admin approval: Covered in Tasks 1, 2, 5, 7.
   - Principal authentication/authorization and dashboard foundation: Covered in Tasks 3, 4, 7.
   - Dual directory parity: Covered in Tasks 1, 2, 3, 6.
   - Append-only audit logging: Covered in Tasks 1, 2.

2. **Placeholder scan:**
   - Zero "TBD", "TODO", "implement later", or vague instructions. Every task has exact code paths, test commands, and assertions.

3. **Type consistency:**
   - All models conform to `src/types/models.ts` and `functions/campusvoice-api/src/types.ts`. All phone numbers validated with `/^[6-9]\d{9}$/`.
