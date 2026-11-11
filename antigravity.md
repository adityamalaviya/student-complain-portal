# CampusVoice — System Architecture & Context

## Project Overview
CampusVoice is an institutional student complaint and facilities-governance portal for higher-education colleges.
- **Frontend:** Next.js App Router (TypeScript) with Tailwind CSS and `@phosphor-icons/react`.
- **Backend:** Appwrite Cloud Functions (single authoritative API router `campusvoice-api` in `functions/campusvoice-api/`).
- **Auth:** Appwrite Cloud Auth with Google OAuth 2.0.
- **Database:** Appwrite Cloud Database with empty collection permissions (`$permissions = []`) and strict server-side authorization.
- **Storage:** Private Appwrite Storage bucket for attachments (max 5 MB, PDF/JPG/JPEG/PNG only).
- **Hosting:** Vercel (Frontend) and Appwrite Cloud (Backend/DB/Auth/Storage).
- **Design:** Stitch MCP approved Minimalist Institutional Design System.

## Critical Business & Architecture Rules (Effective 10 November 2026)
1. **Six Institutional Departments:**
   - Computer, Civil, Electrical, Mechanical (Academic & Maintenance departments).
   - Water, Sanitation (Maintenance-only departments).
2. **Dual Department Jurisdiction:**
   - `student_department_id`: Academic jurisdiction for student peer feed visibility and community support.
   - `maintenance_department_id`: Maintenance routing jurisdiction determining which admin manages the complaint.
   - Water and Sanitation can never be assigned as student academic departments.
3. **Enrollment Department Detection:**
   - Zero-based slice `enrollment_no.slice(7, 9)`.
   - Known mappings: `06` → Department 1, `07` → Department 2 (official names confirmed before activation).
   - Zero guessing of unmapped codes; unmapped codes fail validation or route to pending verification.
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
