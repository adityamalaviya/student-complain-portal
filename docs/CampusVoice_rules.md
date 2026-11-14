# CampusVoice Project Rules

Mandatory rules for every developer, Antigravity agent, reviewer, and QA contributor.

## 1. General rules
1. Read relevant requirements, source code, tests, and `handoff.md` before editing.
2. Make only the smallest changes needed for the approved task.
3. Preserve all existing user work, modified files, untracked files, ignored files, and tests.
4. Never invent requirements, test results, command output, screenshots, API responses, or completed work.
5. Report assumptions, blockers, skipped tests, and limitations honestly.
6. If requirements conflict or are unclear, stop the affected work and request clarification.
7. Do not add unrelated refactors, dependencies, files, folders, or redesigns.

## 2. Approved architecture
- Frontend: Next.js App Router + TypeScript.
- Auth: Appwrite Cloud Auth with Google OAuth.
- Database: Appwrite Cloud Database.
- Backend: Appwrite Cloud Functions using `functions/campusvoice-api`.
- Storage: Appwrite private Storage bucket.
- Deployment: Vercel frontend.
- Design: existing Stitch-derived Minimalist Institutional Design System.

Do not introduce FastAPI, Express, another backend, database, or authentication provider without explicit owner approval.

## 3. Git safety
1. Check `git status --short`, branch, and HEAD before and after work.
2. No branch changes, commits, amend, rebase, cherry-pick, push, or force-push unless explicitly approved.
3. Never use destructive commands such as `git reset --hard` or `git clean`.
4. Never discard or overwrite pre-existing work to make a patch apply.
5. Do not delete or rewrite existing tests to hide failures.
6. Report exact branch, HEAD, and working-tree state in the handoff.

## 4. Product invariants

### Departments
| ID | Name | Scope |
|---|---|---|
| `dept_civil` | Civil | Academic + maintenance |
| `dept_comp` | Computer | Academic + maintenance |
| `dept_elec` | Electrical | Academic + maintenance |
| `dept_mech` | Mechanical | Academic + maintenance |
| `dept_water` | Water | Maintenance only |
| `dept_sanit` | Sanitation | Maintenance only |

Keep `student_department_id` and `maintenance_department_id` separate.

### Enrollment
- Exactly 12 numeric digits.
- Extract department code only from `enrollment_no[7:9]`.
- `06` -> `dept_civil`; `07` -> `dept_comp`; `09` -> `dept_elec`; `19` -> `dept_mech`.
- Reject unknown codes. Never infer from another position or pattern.
- Water and Sanitation have no student enrollment codes.

### Roles and authorization
- Exactly three primary roles: Student, Department Admin, Principal. No Super Admin.
- Department Admin permissions come from authoritative `department_admins` assignments with explicit `academic` or `maintenance` scope.
- Water/Sanitation admins are maintenance-only.
- Never grant access from client-supplied IDs, roles, profile metadata, stale profile fields, or environment allowlists.
- Principal may monitor all departments and manage approved administration/settings functions, but cannot change complaint status or warn on resolved complaints.

### Student profile
- Name: 2–100 characters.
- Enrollment: exactly 12 digits.
- Phone: exactly 10 digits, starting 6–9.
- Server validates values and derives academic department.
- Lock name, enrollment, and phone after save except through approved phone-change workflow.
- Phone-change request routes to the student's academic admin. Maintenance-only admins cannot approve.
- Approval grants one-time update permission.
- Old phone remains active until new phone is successfully saved.
- Consume permission only after successful DB save; validation/network/DB failure must not consume it.
- Audit request, decision, and outcome.
- Do not guess unresolved workflow details.

### Complaints and privacy
- Students may submit to any of the six maintenance departments.
- Title 5–150 chars; location 3–100; description 10–2000; priority `low`, `medium`, or `high`; optional attachment.
- Server derives creator identity and academic department from authenticated caller and authoritative profile.
- Initial status `Pending`; initial support count `1`.
- Original title, location, description, and maintenance department are immutable.
- Public complaints are removed. Do not restore public issue behavior.
- Students see complaints from their own academic department, regardless of maintenance department.
- Peer view hides creator name, enrollment, phone, and attachment metadata.
- Creator sees own details/attachment. Concerned Maintenance Admin and Principal see authorized full details.
- Unauthorized cross-department probes return generic `404` without revealing record existence.

### Attachments
- Private bucket only; max 5 MB.
- Allowed: PDF, JPG, JPEG, PNG.
- Validate extension, MIME type, and file signature/magic bytes server-side.
- Verify uploader ownership and prevent replay.
- After complaint persistence, lock permissions to `[]`.
- Never expose public URLs or storage credentials.

### Support
- Creator baseline is `1`; creator cannot support own complaint.
- Only same-academic-department students can support.
- One active support per student per complaint.
- Support can be removed and later re-added.
- Deterministic ID: `SHA256(complaint_id:user_id).slice(0,32)`.
- Count is `1 + active support records`; never trust client count.
- Enforce duplicate/concurrency safety server-side and audit changes.

### Maintenance Admin and timeline
- Admin manages only complaints assigned to their maintenance department.
- Status flow: `Pending` -> `In Progress` -> `Resolved`; no reverting to Pending.
- Timeline event types: `status_change`, `progress_update`, `clarification_request`, `clarification_reply`, `admin_response`.
- Admin can respond/request clarification; only complaint creator can reply.
- Original complaint fields remain immutable.

### Principal and warnings
- Principal monitors all six departments, student information, metrics, history, and delayed cases.
- Multiple warnings allowed for unresolved complaints; resolved complaints are never eligible.
- Pending eligibility: more than five days since creation/entering Pending according to approved state model.
- In Progress eligibility: more than five days since last meaningful status/progress update.
- Views, refreshes, minor edits, and unflagged notes do not reset timers.
- Track `last_meaningful_update_at` only for meaningful events.
- Persist admin warning responses.

### Audit
Append-only `audit_logs` cover complaint lifecycle, support, timeline, warnings/responses, phone changes, admin assignments, and permission/settings changes. Application features must not edit/delete audit history. Never log secrets or tokens.

## 5. Mandatory security rules
1. Authenticate every protected request; authorize every action server-side.
2. Derive identity from verified Appwrite session/token, never client-supplied user ID.
3. Load roles and assignments from authoritative database records.
4. Fail closed if authorization lookup fails or required data is missing/invalid.
5. Require `is_active === true`; missing values are not active.
6. Validate assignment user ID, department ID, scope, and active state.
7. No profile role/department fallback or environment allowlist for privileges.
8. Never expose server API keys, secrets, tokens, or private bucket credentials in frontend, logs, or responses.
9. Sanitize internal errors; do not expose stack traces or database internals.
10. Validate inputs server-side even if frontend validates them.
11. Protect against duplicate requests, race conditions, replay, and unauthorized object references.
12. No live Appwrite changes or deployment without explicit approval.

## 6. Mandatory testing rules

Testing is a required development phase. Code written is not proof that a feature works. The following test-first sequence is mandatory for every task that introduces or changes test cases.

### 6.1 Mandatory test-case-first sequence

Follow this order. Do not skip or reorder the gates:

1. **Inspect first:** Review the relevant requirements, existing implementation, existing tests, test conventions, and current Git state.
2. **Prepare test cases:** Create or update the appropriate test-case file(s) before changing implementation code for the task. Define the expected behavior, inputs, outputs, authorization boundaries, and failure cases.
3. **Review test cases:** Check each case against the approved requirements. Remove ambiguity, duplicate cases, impossible expectations, and tests that do not verify meaningful behavior. Confirm that the tests exercise the intended production behavior.
4. **Commit the test-case file(s):** Stage and commit only the reviewed test-case file(s). Do not include implementation changes, unrelated files, generated files, or user changes in this commit. Use a clear test-focused commit message.
5. **Verify the commit:** Inspect the commit summary and Git status to confirm that only the intended test-case file(s) were committed and all unrelated working-tree changes remain untouched.
6. **Execute the committed test cases:** Run the test cases from the committed version. Record the exact command, exit code, test counts, and actual output.
7. **Diagnose failures:** Determine whether each failure is caused by implementation behavior, an incorrect test expectation, environment/configuration, or a test defect. Do not assume the implementation is correct or the test is wrong without evidence.
8. **Implement or fix:** Make the minimum implementation changes needed to satisfy the approved requirements and the valid test cases. Do not weaken tests to make the implementation pass.
9. **Re-run:** Execute the relevant tests again after implementation changes. Run regression tests and the required typecheck, lint, build, and diff checks.
10. **Report:** Provide the test commit hash, exact test commands, results, failures fixed, remaining failures, and limitations.

**Commit exception:** The test-case-only commit in step 4 is an explicitly permitted exception to the general no-commit rule. It does not authorize committing implementation code, committing unrelated files, pushing, changing branches, or creating additional commits. Any later commit requires separate explicit approval. If the repository state makes it unsafe to commit only the test-case file(s), stop and report the blocker instead of staging broadly or risking user changes.

For a task that only executes an already-existing committed test suite and does not add or change test cases, verify the relevant test files are already committed before execution. If they are not committed, follow the sequence above.

### 6.2 Test integrity rules

1. Tests must exercise production code paths and real handlers wherever practical.
2. Do not replace meaningful tests with toy simulations, hardcoded-output tests, static source-string checks, or assertions that a file/component merely exists.
3. Do not manually construct an authorized caller to test a protected handler while bypassing `verifyCaller`. Exercise the actual router/authentication/authorization boundary.
4. Mocks are allowed only when clearly identified and when they preserve the behavior under test. Mock-based tests do not prove live Appwrite integration.
5. Never mock the exact function or condition the test claims to verify.
6. Never weaken assertions, skip tests, suppress errors, or change expected results merely to get a pass.
7. Do not delete or rewrite existing tests to hide regressions.
8. Tests must be deterministic, isolated, repeatable, and clean up their test data.
9. Check the actual command exit code before reporting a pass.
10. Report skipped, pending, flaky, mocked, and blocked tests separately.
11. Passing local tests do not prove live Appwrite integration or production readiness.

### 6.3 Required test layers

**Unit tests**
- Input validation and normalization.
- Enrollment department extraction and unknown-code rejection.
- Support ID and active-count derivation.
- Status transition rules.
- Five-day eligibility calculations.
- Permission and scope helpers.
- Timeline event creation.
- Error mapping and sanitization.

**Handler/API integration tests**
- Invoke actual production handlers through the API router wherever practical.
- Exercise authentication, authorization, validation, persistence boundaries, and response mapping.
- Verify correct HTTP status and error codes.
- Verify unauthorized probes do not disclose record existence.
- Verify internal failures are not mislabeled as authentication failures.

**Frontend tests**
- Render actual components/pages and exercise user interactions.
- Test loading, empty, success, validation, unauthorized, and error states.
- Test the affected user flows, including support toggle, clarification request/reply, phone-change flow, Principal warning flow, and timeline display when those features change.
- Verify failures do not show false success.
- Screenshots and static component-existence checks are not behavior tests.

**Build and static checks**

Run the actual repository scripts for:
- TypeScript typecheck.
- Lint.
- Relevant test suites.
- Production build.
- `git diff --check`.

Report exact commands and results. If a script does not exist, report that; do not invent it.

**Live integration tests**

Run only with explicit approval and a safe test environment. Never use production data for destructive tests. Do not describe mocked or local-only tests as live Appwrite integration tests.

### 6.4 Required scenario coverage

**Authentication and authorization**
- Missing, invalid, expired, or malformed authentication.
- Missing/inactive profile and database lookup failure.
- Missing, inactive, malformed, or wrong-scope admin assignment.
- User ID mismatch.
- Student attempting admin/Principal actions.
- Admin attempting another department's action.
- Maintenance-only admin attempting academic phone approval.
- Principal attempting prohibited status changes or warnings on resolved complaints.
- Router distinguishes `401` from `500`; internal errors are sanitized.

**Departments and onboarding**
- All four valid enrollment mappings.
- Unknown code, wrong length, non-numeric, whitespace, and malformed values.
- Extraction only from `enrollment_no[7:9]`.
- No Water/Sanitation student department inference.
- Name and phone validation boundaries.
- Locked profile fields cannot be changed through ordinary updates.

**Complaints and privacy**
- Valid creation and invalid field boundaries.
- Server-derived creator and academic department.
- Initial Pending status and creator baseline support.
- Same-academic-department visibility and cross-department denial.
- Peer response hides identity and attachment metadata.
- Creator and authorized admin/Principal access.
- Wrong admin receives privacy-preserving not-found behavior.
- Client-supplied identity, department, role, or count is ignored/rejected.
- Original complaint fields cannot be changed.

**Attachments**
- Valid allowed file formats.
- Oversize, unsupported extension, MIME mismatch, and invalid magic bytes rejected.
- Non-owner access denied.
- Unauthorized access does not reveal file existence.
- Private permissions remain locked; no public URL returned.

**Support**
- Creator cannot support own complaint.
- Same-department support succeeds; cross-department support fails.
- Duplicate active support prevented.
- Removal changes active state and derived count.
- Re-support after removal succeeds.
- Concurrent duplicate requests do not create multiple active records.
- Client-supplied support count is ignored.

**Clarification and timeline**
- Only concerned Maintenance Admin can request clarification.
- Only complaint creator can reply.
- Unauthorized users cannot request/reply.
- Request and reply persist as distinct event types.
- Timeline ordering is chronological and stable.
- Original complaint remains unchanged.
- Persistence failure never returns false success.

**Phone change**
- Student can request only their own profile change.
- Request routes to academic admin.
- Maintenance-only admins cannot approve.
- Unauthorized admin cannot decide.
- Approval/rejection persists.
- One-time permission granted only after approval.
- Old phone remains active until successful save.
- Permission consumed only after successful save.
- Validation/network/database failures do not consume permission.
- Request, decision, and result are audited.

**Principal warnings**
- Pending threshold is enforced.
- In Progress timer uses last meaningful update.
- Non-meaningful events do not reset timer.
- Meaningful status/progress event resets timer.
- Resolved complaints are never eligible.
- Multiple warnings for unresolved complaints are allowed.
- Unauthorized users cannot issue or alter warnings.
- Admin response persists and is visible to authorized users.

**Audit**
- Each required business event emits an audit event.
- Record includes actor, action, target, timestamp, and safe metadata.
- Secrets/tokens are never logged.
- Application endpoints cannot update/delete audit history.
- Failed operations do not emit misleading success events.

### 6.5 Concurrency and failure tests

For state-changing operations, test concurrent duplicate requests, conflicting updates, replay, database failures, missing records, stale assignments, timeouts, and partial failures where relevant.

Use atomic/transactional operations where supported. If Appwrite cannot provide required transaction semantics, document the limitation and use a safe idempotent strategy. Sequential tests alone do not prove race safety.

### 6.6 Test evidence report

For every task, report:
- Test-case file path(s).
- Test-case-only commit hash and files included.
- Exact commands executed and exit codes.
- Suite names, pass/fail counts, and scenarios covered.
- Test type: unit, handler integration, frontend, mocked, or live.
- What was mocked and why.
- Skipped/blocked tests and reasons.
- Typecheck, lint, build, and diff-check results.
- Failures found, root causes, and fixes.
- Remaining limitations and what the tests do not prove.

Never report only “all tests passed.” Do not invent coverage percentages or claim tests ran if they did not.

## 7. API and frontend contracts
1. Keep the existing single API router.
2. Backend validates method, auth, authorization, payload, and resource scope.
3. Use existing response conventions and consistent error codes.
4. `401` = authentication failure; approved `403` or privacy-preserving `404` = authorization failure; `400`/`422` = validation according to existing conventions; `500` = unexpected internal failure.
5. Never map every exception to `401`.
6. Return only authorized fields.
7. Frontend does not calculate authoritative roles, permissions, departments, support counts, or warning eligibility.
8. Handle loading, empty, success, validation, unauthorized, not-found, and server-error states.
9. Show success only after server confirmation; prevent duplicate submissions.

## 8. Antigravity Teamwork rules
1. Team Lead defines task boundaries, file ownership, interfaces, and integration order before parallel work.
2. Each shared file has one designated writer at a time.
3. Agents must not concurrently edit the same router, handler, shared type, page, or test file.
4. Use isolated workspaces only if actually provided; never assume isolation.
5. In shared workspaces, enforce explicit file ownership and communicate contracts.
6. Agents inspect existing code before implementation.
7. Agents report exact files changed, contracts, tests run, and blockers.
8. Integrator reviews and reconciles changes; never blindly accept agent output.
9. QA tests the integrated result, not only isolated contributions.
10. No agent may commit, push, change branches, migrate live data, or deploy without approval.
11. Never fabricate completion for blocked or unfinished agent work.

## 9. Appwrite migration and deployment
1. Local tests/source review do not prove live schema compatibility.
2. Existing live departments may have legacy immutable IDs such as `06`/`07`, a legacy `code` attribute, and unique `idx_dept_code`. Do not assume canonical `dept_*` records exist.
3. Do not insert duplicate canonical records or alter live schema without a reviewed migration plan.
4. Plan must include schema/data inventory, legacy-to-canonical mapping, reference impact, duplicate handling, backup/rollback, idempotent dry-run, and verification criteria.
5. Live migration, production writes, storage permission changes, OAuth changes, and deployment require explicit owner approval.
6. Do not claim production readiness until live schema, auth, storage, and deployment are verified in an approved environment.

## 10. Design and accessibility
- Reuse the approved design system.
- Include loading, empty, validation, error, and access-denied states.
- Forms need labels, validation messages, and submission state.
- Controls must be keyboard accessible and have meaningful accessible names.
- Do not rely on color alone for status/priority.
- Support mobile and desktop.
- Do not invoke Stitch MCP or redesign screens without explicit approval.

## 11. Definition of done
- [ ] Requirements and existing implementation reviewed.
- [ ] Scope and approved architecture respected.
- [ ] Server-side validation and authorization implemented.
- [ ] Relevant unit and handler/API tests exercise production paths.
- [ ] Frontend flows tested where applicable.
- [ ] Relevant boundary, failure, concurrency, and unauthorized cases tested.
- [ ] Typecheck passes.
- [ ] Lint passes.
- [ ] Relevant tests pass.
- [ ] Production build passes.
- [ ] `git diff --check` passes, or pre-existing failure is isolated/reported.
- [ ] Existing user changes/tests preserved.
- [ ] No unapproved live Appwrite change or deployment.
- [ ] Docs and `handoff.md` updated where required.
- [ ] Evidence and limitations reported honestly.
- [ ] Owner approval obtained before next phase.

Blocked/failed items must be marked as such. Never check a box based on intention.

## 12. Required handoff
Every phase report includes:
1. Task and status: complete, partial, blocked, or failed.
2. Exact files changed and purpose.
3. Implemented behavior.
4. API/request/response/shared contract changes.
5. Security and authorization impact.
6. Exact test commands, counts, results, and test types.
7. Typecheck, lint, build, and diff-check results.
8. Mocks, skipped tests, limitations, and unverified behavior.
9. Branch, HEAD, and working-tree status.
10. Whether Appwrite, storage, OAuth, migration, or deployment was touched.
11. Remaining work/blockers.
12. Next approval required.

## 13. Stop conditions
Stop affected work and report if requirements conflict, architecture changes are unapproved, user work may be lost, authorization cannot be verified, migration risks live data, agent file ownership overlaps, tests bypass production paths/weaken assertions, results cannot be verified, or a live action lacks approval.

**Final rule:** Speed never justifies fabricated evidence, weakened security, destructive repository operations, or silently changed product requirements.
