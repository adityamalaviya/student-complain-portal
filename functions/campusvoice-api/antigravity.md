# Appwrite Cloud Function — `functions/campusvoice-api`

## Purpose
Single serverless API router deployed to Appwrite Cloud Functions executing all authoritative business operations for CampusVoice.

## Architecture
- `src/index.ts` — Main request dispatcher routing incoming actions (`health`, `list-departments`, `get-profile`, `complete-onboarding`, `create-complaint`, `list-complaints`, `get-complaint`, `get-complaint-attachment`, etc.).
- `src/departments.ts` — Canonical 6-department registry (`dept_civil`, `dept_comp`, `dept_elec`, `dept_mech`, `dept_water`, `dept_sanit`), `[7:9]` enrollment mapping (`06`→`dept_civil`, `07`→`dept_comp`, `09`→`dept_elec`, `19`→`dept_mech`; zero codes for Water/Sanitation), phone regex, status normalization helpers, and `DatabaseClientLike` / `StorageClientLike` interfaces.
- `src/auth.ts` — Server-side caller verification via Appwrite JWT or internal execution header, resolving DB-backed `department_admins` assignments, `principal` profile role, and legacy env allowlist fallback.
- `src/db.ts` — Server-side Appwrite client configuration (`databases`, `storage`, `users`) and collection IDs (`profiles`, `departments`, `complaints`, `complaint_supports`, `complaint_timeline`, `department_admins`) with empty ACL permissions enforcement.
- `src/handlers/profile.ts` — Authoritative handlers for user profile lookup, first-time onboarding with `[7:9]` department extraction, 10-digit phone validation, credential locking, and 6-department directory.
- `src/handlers/complaints.ts` — Authoritative handlers for dual-jurisdiction complaint creation, academic-scoped student feed with server-side peer PII/attachment redaction, maintenance-scoped admin operations across all 6 departments, persisted `complaint_timeline` writes in `handleUpdateAdminComplaint` (official responses, substantive progress updates, status transitions, Pending-safe notes, and rollback on partial DB failure), chronological timeline retrieval and derived `official_response` / `resolved_at` in `handleGetComplaint` (and summary enrichment in list endpoints), Principal full-detail viewing, attachment validation (existence, ownership, private permissions, 5 MB limit, MIME + magic bytes) with Storage permission lockdown, and private `get-complaint-attachment` retrieval.
- `src/stateMachines.ts` — Explicit domain workflow state machines validating complaint transitions (`Resolved → In Progress/Pending` blocked while post-resolution follow-up notes stay allowed), meaningful SLA activity gating, turn-based clarification state (`none | awaiting_reply | replied`), warning response locks, and incomplete admin profile stub unlocking for re-onboarding after revocation.
- `src/types.ts` — TypeScript domain types and request context.
