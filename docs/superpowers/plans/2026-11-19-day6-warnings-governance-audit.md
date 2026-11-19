# Day 6: Warnings, Governance & Audit History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement, harden, and verify all Day 6 requirements: five-day delay milestone logic (Pending > 5d and In Progress > 5d since last meaningful update; non-substantive actions do not reset timer; Resolved excluded); Principal manual warning issuance on delayed unresolved complaints with multiple warning support; Maintenance Admin warning responses; dynamic database-backed `department_admins` assignment and permission management (with strict prohibition of academic scope for Water/Sanitation); append-only `audit_logs` retrieval and system-wide audit verification; full frontend UI integration (Issue Warning modal, Respond to Warning modal, Principal Admin Assignments & Audit Log tabs, Admin warning alerts, Complaint Detail governance section); dual-directory function synchronization; and complete automated test suite verification.

**Architecture:**
- **Backend (Appwrite Cloud Function `campusvoice-api` & `student-complain-portal`):**
  - `principal.ts`:
    - Harden `handleIssueWarning`: verify caller is `principal`, complaint is unresolved (`status !== 'Resolved'`), and delay exceeds 5 days (`is_delayed === true`); allow multiple warnings while unresolved; create `complaint_warnings` record with `$permissions: []`; emit `issue_warning` audit log.
    - Harden `handleRespondToWarning`: verify caller is assigned Maintenance Admin for the complaint's `maintenance_department_id` or Principal; validate 10-2000 char response; update warning document with `admin_response` and `responded_at`; emit `respond_to_warning` audit log.
    - Implement `handleListAdminAssignments`: Principal-only query on `department_admins` collection returning all assignments.
    - Implement `handleAssignAdmin`: Principal-only assignment handler; validates email, department ID, and scope (`academic` | `maintenance`); strictly forbids assigning `academic` scope to Water (`dept_water`) or Sanitation (`dept_sanit`) (HTTP 400 `INVALID_DEPARTMENT_SCOPE`); creates/updates `department_admins` record; updates user's profile role to `'department_admin'`; emits `assign_department_admin` audit log.
    - Implement `handleRevokeAdmin`: Principal-only revocation handler; deactivates assignment (`is_active: false`); checks if user has other active assignments and if none, demotes profile role to `'student'`; emits `revoke_department_admin` audit log.
    - Implement `handleGetAuditHistory`: Principal-only query on `audit_logs` collection ordered descending by `created_at`; supports filtering by `action`, `actor_id`, `target_resource_id`, and `limit`; strictly append-only (zero update/delete endpoints).
  - `complaints.ts`:
    - Verify `isMeaningfulUpdate` invariant in `handleUpdateAdminComplaint`: status changes and substantive progress updates reset `last_meaningful_update_at`; minor notes, clarification requests, clarification replies, views, and refreshes do NOT reset `last_meaningful_update_at`.
- **Frontend (Next.js 15 App Router):**
  - `src/components/IssueWarningModal.tsx`: Accessible modal for Principal to compose warning reason and issue warning on delayed unresolved complaints.
  - `src/components/RespondWarningModal.tsx`: Accessible modal for Maintenance Admin to submit official response to an active warning.
  - `src/app/principal/page.tsx`: Tabbed governance interface featuring:
    1. Institutional Grievance Overview & Delayed Grievances Table (with direct "Issue Warning" trigger).
    2. Department Admin Assignments Tab (listing active admins across all 6 departments, modal to assign new admin with validation, and revoke action).
    3. System Audit Log Viewer Tab (chronological audit events with action badges, actor IDs, resource links, and structured details modal).
  - `src/app/admin/page.tsx`: Display warning badges on warned complaints in the queue with a quick "Respond to Warning" trigger.
  - `src/app/complaints/[id]/page.tsx`: Dedicated Institutional Warnings & Responses governance card displaying all warnings, elapsed delay, reason, and admin responses; "Issue Warning" button for Principal; "Respond to Warning" button for assigned Maintenance Admin.
  - `src/lib/api/functions.ts`: Export typed client wrappers `apiIssueWarning`, `apiRespondToWarning`, `apiListAdminAssignments`, `apiAssignAdmin`, `apiRevokeAdmin`, `apiGetAuditHistory`.
- **Testing & Safety:**
  - Mock database tests in `functions/campusvoice-api/src/__tests__/complaints.test.ts` (mirrored in `functions/student-complain-portal`).
  - Comprehensive integration test suite in `tests/phase6.test.mjs`.
  - Typecheck (`tsc --noEmit`) and lint (`next lint`) verification.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict mode, zero `any`), Appwrite Cloud Node SDK (`node-appwrite`), Tailwind CSS, `@phosphor-icons/react`, Node.js test runner (`node:test`).

**Spec:** `docs/CampusVoice_Requirement_Gap_Audit_Updated_7_Day_Plan.txt`, `docs/implementationplan.md`, `docs/contracts.md`, `docs/schema.md`, `docs/CampusVoice_rules.md`, `docs/handoff.md`.

---

## Global Constraints

- **Credentials & Secrets:** NEVER read, log, or expose `.env`, `.env.*`, or `secrets/**`. Store secrets in environment variables only.
- **Permissions:** All Appwrite collections (`complaint_warnings`, `department_admins`, `audit_logs`, `complaints`, `profiles`, etc.) use strictly empty client permissions (`$permissions = []`). All mutations and reads execute server-side via server API keys.
- **TypeScript Quality:** Strict mode always — zero `any` types allowed, zero `as unknown as X` type casts.
- **Design Tokens & Icons:** Tailwind CSS tokens from `src/styles/tokens.ts`. `@phosphor-icons/react` exclusively — no other icon libraries.
- **Test Integrity:** Preserve test-case integrity: never change, weaken, delete, or rewrite a failing test merely to obtain a passing result. Store test cases in existing test files only (`tests/phase6.test.mjs`, `functions/campusvoice-api/src/__tests__/complaints.test.ts`). Do NOT create new test folders or new test files. Show complete test output.
- **Dual Directory Parity:** Both `functions/campusvoice-api` and `functions/student-complain-portal` must remain in exact 100% source and build parity (`git diff --no-index` must be 0).
- **Commit Format:** `AG-XXX: [type]([scope]): [description]`

---

### Task 1: Backend Admin Assignment & Dynamic Role Management Handlers

**Files:**
- Modify: `functions/campusvoice-api/src/handlers/principal.ts`
- Modify: `functions/campusvoice-api/src/index.ts`
- Mirror: `functions/student-complain-portal/src/handlers/principal.ts`
- Mirror: `functions/student-complain-portal/src/index.ts`
- Modify: `functions/campusvoice-api/src/types.ts` & `src/types/models.ts`

**Interfaces:**
- Consumes: `AuthenticatedCaller`, `DatabaseClientLike`, `getAppwriteConfig`, `appendAuditLog`, `INSTITUTIONAL_DEPARTMENTS`, `isAcademicDepartment`, `isMaintenanceDepartment`
- Produces:
  - `handleListAdminAssignments(context, caller, deps)`:
    - Guard: `caller.role === 'principal'` (403 `FORBIDDEN`).
    - Queries `department_admins` collection with `Query.orderDesc('created_at')`, `Query.limit(100)`.
    - Returns `{ success: true, data: { assignments: DepartmentAdminAssignment[] } }`.
  - `handleAssignAdmin(context, caller, data, deps)`:
    - Guard: `caller.role === 'principal'` (403 `FORBIDDEN`).
    - Input: `user_id` (string), `email` (string), `department_id` (string), `scope` (`'academic'` | `'maintenance'`).
    - Validates email format, department existence in canonical 6 departments.
    - Security Invariant: Water (`dept_water`) and Sanitation (`dept_sanit`) CANNOT be assigned `academic` scope (HTTP 400 `INVALID_DEPARTMENT_SCOPE`).
    - Creates or updates document in `department_admins` with `is_active: true`, `assigned_by: caller.id`, `created_at`, `$permissions: []`.
    - Updates user profile role to `'department_admin'` in `profiles` collection if profile document exists.
    - Emits audit log `action: 'assign_department_admin'`.
    - Returns `{ success: true, data: { assignment: DepartmentAdminAssignment } }`.
  - `handleRevokeAdmin(context, caller, data, deps)`:
    - Guard: `caller.role === 'principal'` (403 `FORBIDDEN`).
    - Input: `assignment_id` (string).
    - Fetches document from `department_admins`.
    - Updates document with `is_active: false`.
    - Checks if target user has any other active admin assignments. If none, updates `profiles.role` to `'student'`.
    - Emits audit log `action: 'revoke_department_admin'`.
    - Returns `{ success: true, data: { assignment_id: string, is_active: false } }`.

- [ ] **Step 1: Write unit tests in `functions/campusvoice-api/src/__tests__/complaints.test.ts` for `handleListAdminAssignments`, `handleAssignAdmin`, and `handleRevokeAdmin`**
- [ ] **Step 2: Run test to verify it fails before implementation**
- [ ] **Step 3: Implement `handleListAdminAssignments`, `handleAssignAdmin`, and `handleRevokeAdmin` in `principal.ts` and wire them into `index.ts`**
- [ ] **Step 4: Run test to verify all pass**
- [ ] **Step 5: Mirror changes to `functions/student-complain-portal` and verify parity**
- [ ] **Step 6: Commit:** `git commit -m "AG-054: feat(functions): implement admin assignment and dynamic role management handlers"`

---

### Task 2: Backend Audit History Retrieval Handler & System-Wide Audit Verification

**Files:**
- Modify: `functions/campusvoice-api/src/handlers/principal.ts` (or `handlers/audit.ts`)
- Modify: `functions/campusvoice-api/src/index.ts`
- Mirror: `functions/student-complain-portal/src/handlers/principal.ts`
- Mirror: `functions/student-complain-portal/src/index.ts`

**Interfaces:**
- Consumes: `AuthenticatedCaller`, `DatabaseClientLike`, `getAppwriteConfig`, `appendAuditLog`
- Produces:
  - `handleGetAuditHistory(context, caller, data, deps)`:
    - Guard: `caller.role === 'principal'` (403 `FORBIDDEN`).
    - Input params: `action` (optional string), `actor_id` (optional string), `target_resource_id` (optional string), `limit` (optional number, max 100, default 50).
    - Queries `audit_logs` collection ordered descending by `created_at`.
    - Returns `{ success: true, data: { audit_logs: AuditLog[], total: number } }`.
    - Append-only safety verification: audit logs cannot be updated or deleted through API actions.

- [ ] **Step 1: Write unit tests in `functions/campusvoice-api/src/__tests__/complaints.test.ts` for `handleGetAuditHistory` and append-only constraints**
- [ ] **Step 2: Run test to verify it fails before implementation**
- [ ] **Step 3: Implement `handleGetAuditHistory` and route action `'get-audit-history'` in `index.ts`**
- [ ] **Step 4: Run test to verify all pass**
- [ ] **Step 5: Mirror changes to `functions/student-complain-portal` and verify parity**
- [ ] **Step 6: Commit:** `git commit -m "AG-055: feat(functions): implement append-only audit history retrieval handler"`

---

### Task 3: 5-Day Delay Engine Verification & Warning Invariants Hardening

**Files:**
- Inspect & Verify: `functions/campusvoice-api/src/handlers/principal.ts`
- Inspect & Verify: `functions/campusvoice-api/src/handlers/complaints.ts`
- Modify if needed: `functions/campusvoice-api/src/handlers/principal.ts`
- Mirror: `functions/student-complain-portal/src/handlers/principal.ts`
- Test: `functions/campusvoice-api/src/__tests__/complaints.test.ts`

**Interfaces:**
- Consumes: `handleIssueWarning`, `handleRespondToWarning`, `isDelayed`, `calculateComplaintDelay`
- Verification Invariants:
  1. **Pending delay:** Warning eligible only if elapsed time since `created_at` > 5 days (120 hours).
  2. **In Progress delay:** Warning eligible only if elapsed time since `last_meaningful_update_at` (or `created_at`) > 5 days.
  3. **Meaningful updates:**
     - Status transition (`Pending` -> `In Progress`) updates `last_meaningful_update_at`.
     - Substantive progress updates (`entry_type: 'progress_update'` or `is_substantive: true`) update `last_meaningful_update_at`.
     - Minor notes, views, refreshes, clarification requests, and replies do NOT update `last_meaningful_update_at`.
  4. **Resolved exclusion:** Resolved complaints are NEVER delayed and CANNOT receive warnings (HTTP 400 `CANNOT_WARN_RESOLVED`).
  5. **Multiple warnings:** Principal can issue multiple warnings on the same delayed unresolved complaint.
  6. **Warning responses:** Assigned Maintenance Admin can respond to any warning; updates warning document and emits audit log. Non-assigned admin receives 403 `FORBIDDEN`.

- [ ] **Step 1: Write unit tests in `functions/campusvoice-api/src/__tests__/complaints.test.ts` for 5-day delay milestones, meaningful timer resets, resolved exclusion, multiple warnings, and warning responses**
- [ ] **Step 2: Run test to verify it fails or exposes any edge cases**
- [ ] **Step 3: Apply minimal hardening in `principal.ts` or `complaints.ts` to ensure 100% compliance**
- [ ] **Step 4: Run test to verify all pass**
- [ ] **Step 5: Mirror changes to `functions/student-complain-portal` and verify parity**
- [ ] **Step 6: Commit:** `git commit -m "AG-056: feat(functions): harden 5-day delay engine and warning response invariants"`

---

### Task 4: Client API Wrappers & Zod Validation Schemas Alignment

**Files:**
- Modify: `src/lib/api/functions.ts`
- Modify: `src/lib/schemas/index.ts`
- Modify: `src/types/models.ts`

**Interfaces:**
- Consumes: `executeFunction`, `AdminAssignmentSchema`, `WarningCreateSchema`, `WarningResponseSchema`
- Produces:
  - `apiListAdminAssignments()`: calls `'list-admin-assignments'`, returns `{ assignments: DepartmentAdminAssignment[] }`.
  - `apiAssignAdmin(input: AdminAssignmentInput)`: calls `'assign-admin'`, returns `{ assignment: DepartmentAdminAssignment }`.
  - `apiRevokeAdmin(assignmentId: string)`: calls `'revoke-admin'`, returns `{ assignment_id: string; is_active: boolean }`.
  - `apiGetAuditHistory(params)`: calls `'get-audit-history'`, returns `{ audit_logs: AuditLog[]; total: number }`.
  - `apiIssueWarning(input: IssueWarningInput)`: verified and aligned.
  - `apiRespondToWarning(input: RespondToWarningInput)`: verified and aligned.

- [ ] **Step 1: Update `src/types/models.ts` and `src/lib/api/functions.ts` with new governance API functions and interfaces**
- [ ] **Step 2: Run `npm run typecheck` to verify strict compilation**
- [ ] **Step 3: Commit:** `git commit -m "AG-057: feat(api): add client API functions for admin assignment and audit history"`

---

### Task 5: Frontend UI — Issue Warning & Respond to Warning Modals

**Files:**
- Create: `src/components/IssueWarningModal.tsx`
- Create: `src/components/RespondWarningModal.tsx`
- Modify: `src/components/index.ts`

**Interfaces:**
- Consumes: `apiIssueWarning`, `apiRespondToWarning`, `@phosphor-icons/react`, Tailwind CSS tokens
- Implements:
  - `IssueWarningModal`:
    - Props: `isOpen`, `complaintId`, `complaintTitle`, `departmentName`, `daysDelayed`, `onClose`, `onSuccess`.
    - Form with textarea for warning reason (min 10, max 2000 chars), character count counter, validation error display, loading spinner on submit, error banner.
    - Focus trapping, Escape key handler, accessibility attributes (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
  - `RespondWarningModal`:
    - Props: `isOpen`, `warningId`, `complaintTitle`, `warningReason`, `onClose`, `onSuccess`.
    - Form with textarea for admin response (min 10, max 2000 chars), character count counter, validation error display, loading spinner, error banner.
    - Accessible modal with proper ARIA attributes and focus management.

- [ ] **Step 1: Create `src/components/IssueWarningModal.tsx` following institutional design system**
- [ ] **Step 2: Create `src/components/RespondWarningModal.tsx` following institutional design system**
- [ ] **Step 3: Export both from `src/components/index.ts`**
- [ ] **Step 4: Run `npm run typecheck` and `npm run lint`**
- [ ] **Step 5: Commit:** `git commit -m "AG-058: feat(ui): create IssueWarningModal and RespondWarningModal components"`

---

### Task 6: Frontend UI — Principal Dashboard Governance Tabs (Admin Assignments & Audit Logs)

**Files:**
- Modify: `src/app/principal/page.tsx`

**Interfaces:**
- Consumes: `apiGetPrincipalDashboard`, `apiListAdminAssignments`, `apiAssignAdmin`, `apiRevokeAdmin`, `apiGetAuditHistory`, `IssueWarningModal`
- Implements:
  - Tab navigation on Principal dashboard:
    1. **Tab: "Institutional Overview"** (current dashboard + "Issue Warning" button in Delayed Grievances table triggering `IssueWarningModal` with refetch).
    2. **Tab: "Admin Assignments"**:
       - Table of all admin assignments across the 6 canonical departments.
       - Badges for department, scope (`Academic` vs `Maintenance`), and active status (`Active` vs `Revoked`).
       - "Assign Department Admin" button opening modal with email, department dropdown (6 canonical departments), and scope toggle (with academic validation blocking Water/Sanitation).
       - "Revoke" button with confirmation.
    3. **Tab: "Audit Trail"**:
       - Chronological table of `audit_logs` with action badge, actor ID, resource type, timestamp, and details inspector modal.
       - Action filter dropdown (`all`, `issue_warning`, `respond_to_warning`, `assign_department_admin`, `revoke_department_admin`, `update_complaint_status`, etc.).

- [ ] **Step 1: Enhance `src/app/principal/page.tsx` with tabs, Issue Warning action, Admin Assignments management, and Audit Trail viewer**
- [ ] **Step 2: Run `npm run typecheck` and `npm run lint`**
- [ ] **Step 3: Commit:** `git commit -m "AG-059: feat(principal): implement admin assignment and audit trail tabs in principal dashboard"`

---

### Task 7: Frontend UI — Admin Dashboard & Complaint Detail Warning Governance

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/complaints/[id]/page.tsx`

**Interfaces:**
- Consumes: `RespondWarningModal`, `IssueWarningModal`, `apiGetComplaint`, `ComplaintWarning`
- Implements:
  - `src/app/admin/page.tsx`:
    - If complaint has active warnings, display warning badge (`X warnings issued`) and quick "Respond to Warning" trigger opening `RespondWarningModal`.
  - `src/app/complaints/[id]/page.tsx`:
    - Display dedicated "Institutional Warnings & Oversight" section for Admins and Principal:
      - Lists all warnings with issue timestamp, days delayed badge, warning reason, and admin response (or pending response badge).
      - For Principal: "Issue Warning" action if delayed and unresolved.
      - For Maintenance Admin: "Respond to Warning" button if unanswered.

- [ ] **Step 1: Enhance `src/app/admin/page.tsx` with warning alerts and quick response trigger**
- [ ] **Step 2: Enhance `src/app/complaints/[id]/page.tsx` with Institutional Warnings card, Issue Warning action (Principal), and Respond to Warning action (Admin)**
- [ ] **Step 3: Run `npm run typecheck` and `npm run lint`**
- [ ] **Step 4: Commit:** `git commit -m "AG-060: feat(ui): add warning notifications and response actions to admin and complaint detail views"`

---

### Task 8: Comprehensive Automated Test Suite Verification

**Files:**
- Modify: `tests/phase6.test.mjs`
- Modify: `functions/campusvoice-api/src/__tests__/complaints.test.ts`
- Mirror: `functions/student-complain-portal/src/__tests__/complaints.test.ts`
- Modify: `docs/handoff.md`

**Test Cases to Implement and Verify:**
1. **5-Day Delay Engine Invariants:**
   - Pending complaint <= 5 days: not delayed (`is_delayed: false`), warning ineligible.
   - Pending complaint > 5 days: delayed (`is_delayed: true`), warning eligible.
   - In Progress complaint <= 5 days since last meaningful update: not delayed, warning ineligible.
   - In Progress complaint > 5 days since last meaningful update: delayed, warning eligible.
   - Status transition resets `last_meaningful_update_at`.
   - Substantive progress update resets `last_meaningful_update_at`.
   - Non-substantive note does NOT reset `last_meaningful_update_at`.
   - Clarification request and reply do NOT reset `last_meaningful_update_at`.
   - Resolved complaint is NEVER delayed, regardless of age.
2. **Principal Manual Warnings:**
   - Principal successfully issues warning on delayed unresolved complaint.
   - Non-Principal caller receives 403 `FORBIDDEN`.
   - Resolved complaint rejected with 400 `CANNOT_WARN_RESOLVED`.
   - Non-delayed complaint rejected with 400 `NOT_DELAY_ELIGIBLE`.
   - Multiple warnings on the same delayed unresolved complaint are permitted.
   - Warning creation emits `issue_warning` append-only audit log.
3. **Admin Warning Responses:**
   - Assigned Maintenance Admin successfully submits response (10-2000 chars).
   - Principal successfully submits response.
   - Non-assigned admin receives 403 `FORBIDDEN`.
   - Non-admin receives 403 `FORBIDDEN`.
   - Response updates `complaint_warnings` record with `admin_response` and `responded_at`.
   - Emits `respond_to_warning` append-only audit log.
4. **Department Admin Assignment & Scopes:**
   - Principal successfully assigns an admin with valid email, canonical department, and scope.
   - Non-Principal caller receives 403 `FORBIDDEN`.
   - Assigning `academic` scope to Water (`dept_water`) or Sanitation (`dept_sanit`) is strictly rejected with 400 `INVALID_DEPARTMENT_SCOPE`.
   - Assigning `maintenance` scope to any of the 6 canonical departments succeeds.
   - Profile role is updated to `'department_admin'`.
   - Emits `assign_department_admin` append-only audit log.
   - Principal successfully revokes admin assignment (`is_active: false`).
   - Profile role is reverted to `'student'` when no active assignments remain.
   - Emits `revoke_department_admin` append-only audit log.
5. **Audit History & Append-Only Safety:**
   - Principal successfully retrieves audit history with filtering and pagination.
   - Non-Principal receives 403 `FORBIDDEN`.
   - Audit logs are append-only: no update or delete operations exist.
   - All state-changing operations emit structured audit logs with safe metadata and zero secrets.

- [ ] **Step 1: Update `tests/phase6.test.mjs` with all Day 6 domain simulation and verification test cases**
- [ ] **Step 2: Update `functions/campusvoice-api/src/__tests__/complaints.test.ts` with Cloud Function unit tests**
- [ ] **Step 3: Mirror `complaints.test.ts` to `functions/student-complain-portal` and verify parity**
- [ ] **Step 4: Execute `node --test tests/phase6.test.mjs` and display full test output**
- [ ] **Step 5: Execute `npm run test:functions` and display full test output**
- [ ] **Step 6: Run `npm run typecheck` and `npm run lint`**
- [ ] **Step 7: Update `docs/handoff.md` with complete Day 6 test evidence and findings**
- [ ] **Step 8: Commit:** `git commit -m "AG-061: test(phase6): verify Day 6 warnings, governance, and audit history suites"`
