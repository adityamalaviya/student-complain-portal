# CampusVoice — System Architecture & Context

**Status:** Day 7 Stabilization & Release Verification Complete — 100% of 7-Day Realignment Implemented & Verified.

## Project Overview
CampusVoice is an institutional student complaint and facilities-governance portal for higher-education colleges.
- **Frontend:** Next.js App Router (TypeScript) with Tailwind CSS and `@phosphor-icons/react`.
- **Backend:** Appwrite Cloud Functions (single authoritative API router `campusvoice-api` in `functions/campusvoice-api/`).
- **Auth:** Appwrite Cloud Auth with Google OAuth 2.0.
- **Database:** Appwrite Cloud Database with empty collection permissions (`$permissions = []`) and strict server-side authorization.
- **Storage:** Private Appwrite Storage bucket for attachments (max 5 MB, PDF/JPG/JPEG/PNG only).
- **Hosting:** Vercel (Frontend) and Appwrite Cloud (Backend/DB/Auth/Storage).
- **Design:** Stitch MCP approved Minimalist Institutional Design System.

## Critical Business & Architecture Rules (Updated Step 5 Canonical Department Registry)
1. **Six Institutional Departments (Canonical IDs Independent of Enrollment Codes):**
   - `dept_civil` (`Civil`): Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
   - `dept_comp` (`Computer`): Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
   - `dept_elec` (`Electrical`): Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
   - `dept_mech` (`Mechanical`): Academic & Maintenance (`is_academic: true`, `is_maintenance: true`)
   - `dept_water` (`Water`): Maintenance-only (`is_academic: false`, `is_maintenance: true`) — NO enrollment code
   - `dept_sanit` (`Sanitation`): Maintenance-only (`is_academic: false`, `is_maintenance: true`) — NO enrollment code
2. **Dual Department Jurisdiction:**
   - `student_department_id`: Academic jurisdiction for student peer feed visibility and community support (must be one of the 4 active academic departments).
   - `maintenance_department_id`: Maintenance routing jurisdiction determining which admin manages the complaint (any of the 6 active maintenance departments).
   - Water (`dept_water`) and Sanitation (`dept_sanit`) can never be assigned as student academic departments or academic admin scopes.
3. **Enrollment Department Detection:**
   - Zero-based slice `enrollment_no.slice(7, 9)` (`enrollment_no[7:9]`).
   - Confirmed mappings (`ENROLLMENT_CODE_MAPPINGS`): `06` → `dept_civil`, `07` → `dept_comp`, `09` → `dept_elec`, `19` → `dept_mech`.
   - Water and Sanitation have zero enrollment codes. Invented codes (`03`, `04`, `05`, `08`) and aliases (`water`, `sanitation`) are prohibited.
   - Zero guessing of unmapped or inactive codes; unmapped codes are rejected without fallback assignment.
   - **Pending Appwrite Migration:** Canonical `$id` department seeding and removal of `departments.code` / `idx_dept_code` are implemented in code/provisioning scripts; live Appwrite schema/document migration is still pending.
4. **Student Profile & Phone Number:**
   - First-time onboarding collects student name, enrollment number, and phone number (`/^[6-9]\d{9}$/`).
   - Name, enrollment number, and phone number are locked after saving.
   - Phone changes require an approved workflow through the student's academic Department Admin.
   - Water and Sanitation administrators cannot approve student phone changes.
   - One-time phone change permission is consumed only after successful database save.
5. **Complaint Lifecycle & Immutability:**
   - Complaint content (title, location, description, department assignments) is permanently immutable after creation.
   - Initial status is `Pending`. Status transitions: `Pending`, `In Progress`, `Resolved`.
   - Only the assigned Maintenance Department Admin can change status; Principal cannot change status.
   - Updates, progress notes, clarification requests, and replies are stored as discrete records in `complaint_timeline`.
6. **Student Privacy & Peer Redaction:**
   - Peer student feeds hide creator name, enrollment number, phone number, and private attachments.
   - Full details accessible only to the author, concerned Maintenance Admin, and Principal.
   - Public complaint functionality has been completely removed.
7. **Community Support Invariant:**
   - Initial support count is 1 (representing creator).
   - Displayed count = `1 + active support records`.
   - Only peers from the same academic department can support. Creator self-support is forbidden.
   - Students can remove their support and support again later.
8. **Principal Governance & 5-Day Delay Engine:**
   - Principal monitors all 6 departments, views metrics/history, and manages department admin assignments.
   - Principal can issue manual warnings on unresolved complaints delayed > 5 days (Pending > 5 days, or In Progress > 5 days without substantive update).
   - Principal cannot issue warnings on Resolved complaints.
9. **Security, Permissions & Audit:**
   - All collections use empty permissions (`$permissions = []`).
   - Server-side role checks on every Cloud Function invocation.
   - Append-only audit logging for all sensitive, lifecycle, and administrative operations.

## Architecture & Code Guidelines
- Strict TypeScript: No `any`, no `as unknown as X`.
- Architecture structure:
  - `src/app/` — Next.js App Router pages and layouts (`/sign-in`, `/onboarding`, `/dashboard`, `/complaints/new`, `/complaints/[id]`, `/admin`, `/principal`)
  - `src/components/` — Shared UI components
  - `src/lib/` — Appwrite client, Zod schemas, hooks, utils
  - `src/styles/` — Design tokens and globals
  - `src/types/` — Shared TypeScript domain types
  - `functions/campusvoice-api/` — Appwrite Cloud Function router
- Icons: `@phosphor-icons/react` exclusively.
- Every module has a barrel `index.ts` and `antigravity.md`.
