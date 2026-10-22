# Architecture Decision Records (ADR) — Phase 0

**Project:** CampusVoice  
**Status:** Approved & Adopted  
**Phase:** Phase 0 (Baseline Governance & Core Decisions)  
**Date:** 2026-10-21  

---

## ADR-001: Active Department Mappings and Extensibility Strategy

### Context
CampusVoice requires strict department-level isolation for private student complaints. The institutional enrollment scheme embeds department codes within student enrollment numbers. Prior documentation identified multiple potential department codes, but Phase 0 requires formal confirmation of the active departments for the MVP release.

### Decision
1. **Confirmed Active Department Mappings:**
   - **`07`** is definitively confirmed and mapped to **Computer Department**.
   - **`06`** is definitively confirmed and mapped to **Civil Department**.
2. **Initial Deployment Scope:**
   - The initial release is strictly scoped to these **two active departments** and their respective students and administrators.
3. **Database Representation:**
   - The `departments` collection is pre-seeded with two active records:
     - Record 1: `{ code: "07", name: "Computer Department", is_active: true }`
     - Record 2: `{ code: "06", name: "Civil Department", is_active: true }`
4. **Zero Guessing & Future Extensibility:**
   - Other prospective department codes (e.g., `01`, `02`, `03`, `16`) mentioned in exploratory discussions are **unconfirmed** and will NOT be fabricated or assumed.
   - Any enrollment number with a department slice other than `06` or `07` is treated as unmapped and routed to `pending_verification` fallback (or rejected).
   - The architecture and schema are designed to be extensible to up to five departments by inserting records into the `departments` table and registering the code in the mapping dictionary without structural refactoring.

### Consequences
- **Positive:** Guaranteed correctness for Computer and Civil students; zero risk of routing students to fictitious or unstaffed department queues.
- **Negative:** Students from other departments cannot submit department complaints during the Phase 0/MVP release without manual administrative intervention.

---

## ADR-002: Administrator Allowlist Strategy & Identity Verification

### Context
The portal must support two department administrators—one for Computer Department (`07`) and one for Civil Department (`06`). Because administrators do not follow the student onboarding workflow (they do not possess student enrollment numbers) and student registration is self-service, administrative roles must be strictly protected against privilege escalation or spoofing.

### Decision
1. **Server-Managed Environment Allowlist:**
   - Administrator accounts are provisioned via server-side environment variables configured in the Appwrite Cloud Function:
     - `ADMIN_ALLOWLIST_07`: Verified Google email address of the Computer Department Administrator (e.g., `admin.computer@college.edu`).
     - `ADMIN_ALLOWLIST_06`: Verified Google email address of the Civil Department Administrator (e.g., `admin.civil@college.edu`).
2. **Strict Server-Side OAuth Email Verification:**
   - Administrators authenticate through the standard Google OAuth 2.0 flow via Appwrite Auth.
   - Upon authentication, the `campusvoice-api` Function inspects the verified email address attached to the Appwrite Account (`account.get()`).
   - The server verifies whether the email matches `ADMIN_ALLOWLIST_07` or `ADMIN_ALLOWLIST_06`. Both the verified OAuth account email and allowlist variables are normalized via `.trim().toLowerCase()` prior to equality comparison to prevent case-sensitivity or whitespace mismatch.
   - If a match is found:
     - The user's profile is provisioned / updated with `role: "department_admin"` and `department_code: "07"` or `"06"`.
     - `profile_status` is marked `complete`.
     - The user is granted administrative access to their assigned department's complaints and public issues.
   - If no match is found:
     - The user is treated as a standard student.
     - Any incoming client payload claiming `role: "department_admin"` or requesting administrative endpoints is immediately rejected with HTTP 403 Forbidden.
3. **Immutability & Zero Client Trust:**
   - Admin roles and assigned department codes cannot be updated, overridden, or claimed via client request bodies.
   - Client-typed email inputs are never trusted as proof of admin identity; identity is derived exclusively from the authenticated session token / JWT.

### Consequences
- **Positive:** Complete protection against privilege escalation; zero administrative credentials exposed to the frontend; instantaneous role revocation by updating Function environment variables.
- **Negative:** Admin email updates require redeploying / updating Function environment variables.

---

## ADR-003: Appwrite Cloud Function Runtime Architecture (Single API Router)

### Context
CampusVoice requires 11 discrete backend operations:
1. `get-profile`
2. `complete-onboarding`
3. `list-departments`
4. `list-complaints`
5. `get-complaint`
6. `create-complaint`
7. `support-complaint`
8. `get-support-state`
9. `get-admin-dashboard`
10. `list-admin-complaints`
11. `update-admin-complaint`

Two deployment architectures were evaluated:
- **Option A:** 11 discrete micro-functions deployed individually on Appwrite Cloud.
- **Option B:** A single API Router Function (`campusvoice-api`) handling all endpoints through internal routing.

### Decision
We adopt **Option B: Single API Router Function (`campusvoice-api`)** built in Node.js / TypeScript.

### Rationale & Alternatives Comparison

| Evaluation Dimension | Option A: 11 Discrete Micro-Functions | Option B: Single API Router (`campusvoice-api`) [SELECTED] |
|----------------------|-----------------------------------------|------------------------------------------------------------|
| **Cold Start Performance** | 11 separate cold starts; each unused endpoint incurs latency on first request. | Amortized warm runtime across all endpoints; single cold start serves the whole app. |
| **Environment & Configuration Overhead** | Requires managing 11 separate Function IDs in frontend `.env` (`NEXT_PUBLIC_APPWRITE_FN_GET_PROFILE`, etc.). | Single Function ID (`NEXT_PUBLIC_APPWRITE_FUNCTION_ID`). |
| **Authentication & Middleware** | Duplicated token / JWT verification and profile resolution logic copied across 11 repositories or packages. | Centralized authentication middleware verifies `x-appwrite-user-id` and resolves profile once. |
| **Appwrite Cloud Limits** | High risk of hitting project function count or concurrency limits on Appwrite Cloud plans. | Consumes exactly 1 function slot on Appwrite Cloud. |
| **Deployment & CI/CD** | 11 deployment pipelines, increasing deployment failure probability by 11x. | Single unified deployment pipeline with atomic test and deploy. |
| **Code Sharing** | Requires npm publishing or complex monorepo tooling to share validation schemas (`Zod`), extraction logic, and types. | Direct imports from shared modules (`src/lib/enrollment.ts`, schemas, types). |

### Implementation Blueprint
The router executes as an Appwrite Cloud Function listening to HTTP trigger events:
```typescript
// Path / Action dispatch pattern in campusvoice-api:
export default async ({ req, res, log, error }: AppwriteFunctionContext) => {
  const router = createRouter();
  router.get('/api/profile', requireAuth(getProfileHandler));
  router.post('/api/onboarding', requireAuth(completeOnboardingHandler));
  router.get('/api/departments', listDepartmentsHandler);
  router.get('/api/complaints', requireAuth(listComplaintsHandler));
  router.post('/api/complaints', requireAuth(createComplaintHandler));
  router.get('/api/complaints/:id', requireAuth(getComplaintHandler));
  router.post('/api/complaints/:id/support', requireAuth(supportComplaintHandler));
  router.get('/api/complaints/:id/support', requireAuth(getSupportStateHandler));
  router.get('/api/admin/dashboard', requireAdmin(getAdminDashboardHandler));
  router.get('/api/admin/complaints', requireAdmin(listAdminComplaintsHandler));
  router.patch('/api/admin/complaints/:id', requireAdmin(updateAdminComplaintHandler));

  return router.handle(req, res);
};
```

---

## ADR-004: Zero Guessing of Unconfirmed Institutional Details

### Context
During initial project surveys, several potential operational details were discussed in informal notes or draft proposals (e.g., student batch numbering conventions, lateral entry diploma prefixes, faculty-level escalation tiers, automated WhatsApp notifications).

### Decision
Strict adherence to the **Zero Guessing Mandate**:
1. **No Speculative Department Codes:**
   Only `07` (Computer) and `06` (Civil) are recognized. All other codes are classified as `unmapped` and routed to `pending_verification`.
2. **Fixed Enrollment Format:**
   Enrollment extraction strictly requires a 12-digit numeric string with characters 8–9 representing the department code. Any non-conforming formats are rejected or flagged for verification rather than silently trimmed or heuristically guessed.
3. **No Speculative Admin Roles:**
   Only the two department admins mapped via `ADMIN_ALLOWLIST_07` and `ADMIN_ALLOWLIST_06` are supported. Superadmin, principal, or warden roles are deferred until formal administrative specifications are ratified.
4. **Deferred Features:**
   File attachment binary processing, email notifications, and automated escalation cron jobs remain out of Phase 0 scope and are deferred to later phases.
