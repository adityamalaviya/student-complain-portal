# CampusVoice — Implementation Plan

## Delivery Strategy
Target: two-day MVP implementation, followed by deployment verification. A fully production-hardened system may require additional time. Do not fake unfinished functionality.

## Phase 0 — Confirm Blocking Decisions
**Goal:** Resolve the decisions that cannot safely be guessed.
- Confirm names of the two active departments and their mapping to codes `06` and `07`.
- Obtain official enrollment-number examples and confirm full format/length; the department code position is confirmed as characters 8–9.
- If unavailable, approve a pending/manual-verification onboarding fallback.
- Identify the two administrator emails.
- Create/configure Appwrite project, Google OAuth provider, database, and allowed origins.
- Choose the Appwrite Function runtime and decide whether to deploy separate logical Functions or one API-style Function.

**Exit criteria:** Confirmed extraction rule (characters 8–9, 1-based), tested official examples or approved verification fallback; Appwrite project is reachable; admin provisioning approach is known.

## Phase 1 — Project Setup
- Create the frontend and Appwrite Functions folders.
- Configure Next.js + TypeScript.
- Configure Appwrite Functions, runtime dependencies, environment variables, and a suitable health/status check.
- Add `.env.example` files with placeholders.
- Add CORS configuration for local development and the selected production frontend origin.
- Set up Git repository and README.

**Exit criteria:** Frontend starts locally; Function status/health check responds; no secrets committed.

## Phase 2 — Authentication and Profiles
- Configure Appwrite Google OAuth.
- Implement OAuth callback and sign-out.
- Implement shared Function authentication/identity verification using the supported Appwrite mechanism.
- Create profile lookup and onboarding APIs.
- Implement onboarding state and server-side validation.
- Implement department assignment using the confirmed characters 8–9 rule and approved validation fallback.
- Build the Raise Complaint form to match the reference: read-only prefilled Student Name, Enrollment Number, and Department; required Title, Location, Description, and Priority; optional Attachment; Cancel and Submit Complaint actions.
- Validate required fields and attachment type/size on the client and again in the Appwrite Function. Resolve identity and department from trusted profile data server-side.
- Provision two admin profiles through a trusted setup process.

**Exit criteria:** Authenticated users are identified server-side; incomplete profiles cannot use complaint APIs; non-admin users cannot access admin APIs.

## Phase 3 — Complaints and Visibility
- Create department and complaint collections.
- Implement complaint creation and paginated list/detail endpoints.
- Implement department/private and Public Issue visibility.
- Add search and status/category filters.
- Build student dashboard and complaint submission form.

**Exit criteria:** Department A cannot see Department B's private complaint; both departments can see Public Issues.

## Phase 4 — Support Workflow
- Create support collection and enforce one support per user/complaint.
- Implement support endpoint and accurate count retrieval.
- Handle duplicate support gracefully.
- Build Support button state for supported/unsupported.
- Ensure support does not create a complaint.

**Exit criteria:** Repeated support attempts do not increase the count; count matches persisted unique support records.

## Phase 5 — Admin Dashboard
- Implement scoped admin complaint list and basic metrics.
- Add status update and administrative response APIs.
- Build admin dashboard and complaint detail view.
- Test cross-department admin isolation.

**Exit criteria:** Admin A can manage own department and Public Issues, but cannot read or mutate Department B private complaints.

## Phase 6 — Testing and Hardening (Completed & Verified)
- [x] Test Google OAuth end-to-end (verified redirect to Google OAuth flow with configured client ID).
- [x] Test onboarding validation and pending state (format check, code position slice [7:9], fallback rejection).
- [x] Test invalid code and malformed enrollment number behavior (unmapped codes, non-numeric strings rejected).
- [x] Test department/public visibility (cross-department generic 404 Oracle Elimination verified).
- [x] Test duplicate and concurrent support requests (deterministic 32-char SHA-256 IDs, 409 collision handling, count invariance).
- [x] Test unauthorized API requests and admin scope (non-admin 403, cross-department admin mutation 404).
- [x] Check browser bundle and logs for leaked secrets (client bundle verified free of server keys; only public env vars exposed).
- [x] Verify loading, empty, error, and success states (Next.js route protection, DevTools inspection verified).

**Exit criteria:** Critical acceptance criteria in `prd.md` pass (Verified via automated test suite `tests/phase6.test.mjs`, all 23 tests green).

## Phase 7 — Deployment
- Deploy frontend to Vercel.
- Deploy Appwrite Functions to Appwrite Cloud and configure their environment variables and execution permissions.
- Configure environment variables, production CORS, Appwrite origins, OAuth redirects, and HTTPS.
- Confirm deployed Functions can access Appwrite Database.
- Run smoke tests against deployed URLs.
- Record deployment URLs and known limitations in README.

**Exit criteria:** Sign-in, onboarding, complaint creation, support, visibility, and admin status updates work in the deployed environment.

## Two-Day Prioritization
### Day 1
1. Appwrite/OAuth setup and health checks.
2. Authentication verification and profile onboarding.
3. Department and complaint schema.
4. Complaint creation and visibility APIs.
5. Basic student UI.

### Day 2
1. Support uniqueness and count.
2. Admin authorization and status updates.
3. Admin/student UI completion.
4. Critical authorization tests.
5. Deploy and smoke-test.

Use the confirmed characters 8–9 for department extraction. If the overall enrollment format remains unverified, reject malformed numbers or use the approved verification state. Do not sacrifice authorization tests to add cosmetic features.

## Deferred
- Notifications, uploads, comments, AI classification, analytics charts, escalation rules, and five-department rollout.

- Add a first-time profile warning: “Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.”
- Make saved name and enrollment number read-only in normal student flows and enforce the restriction on the backend.
- Use `Rahul` / `246510307054` only as reference sample data, never as hard-coded values for all students.
