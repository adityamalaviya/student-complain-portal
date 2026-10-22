# CampusVoice — System Architecture & Context

## Project Overview
CampusVoice is an institutional student complaint and community-support portal for higher-education colleges.
- **Frontend:** Next.js App Router (TypeScript) with Tailwind CSS.
- **Backend:** Appwrite Cloud Functions (single API router `campusvoice-api` in `functions/campusvoice-api/`).
- **Auth:** Appwrite Cloud Auth with Google OAuth 2.0.
- **Database:** Appwrite Cloud Database with empty collection permissions (`[]`) and server-side authorization.

## Critical Business Rules
1. **Department Detection:** Zero-based slice `enrollment_no.slice(7, 9)`.
   - `06` = Civil Department
   - `07` = Computer Department
   - Zero guessing of unmapped codes; unmapped codes fail validation.
2. **First-Time Profile Lock:** One-time profile setup. Name and enrollment number are permanently immutable.
   - Verbatim warning: *"Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account."*
3. **Department Isolation & Oracle Elimination:** Private department complaints are visible only to that department. Cross-department probes return generic HTTP `404 Not Found`.
4. **Community Support:** 1 support per student per complaint. Document ID is a deterministic 32-character SHA-256 hex string: `sha256(complaintId + ':' + userId).slice(0, 32)`.
5. **No Separate Backend:** Appwrite Cloud Functions handle all business logic; no standalone FastAPI or Express server.

## Architecture & Code Guidelines
- Strict TypeScript: No `any`, no `as unknown as X`.
- Architecture structure:
  - `src/app/` — Next.js App Router pages and layouts
  - `src/components/` — Shared UI components
  - `src/lib/` — Appwrite client, Zod schemas, hooks, utils
  - `src/styles/` — Design tokens and globals
  - `src/types/` — Shared TypeScript domain types
  - `functions/campusvoice-api/` — Appwrite Cloud Function router
- Icons: `@phosphor-icons/react` exclusively.
- Every module has a barrel `index.ts` and `antigravity.md`.
