# Appwrite Cloud Function — `functions/campusvoice-api`

## Purpose
Single serverless API router deployed to Appwrite Cloud Functions executing all authoritative business operations for CampusVoice.

## Architecture
- `src/index.ts` — Main request dispatcher routing incoming actions (`health`, `list-departments`, `get-profile`, `complete-onboarding`, `create-complaint`, `list-complaints`, `get-complaint`, `get-complaint-attachment`, etc.).
- `src/departments.ts` — Canonical 6-department registry, `[7:9]` enrollment mapping, phone regex, status normalization helpers, and `DatabaseClientLike` / `StorageClientLike` interfaces.
- `src/auth.ts` — Server-side caller verification via Appwrite JWT or internal execution header, resolving DB-backed `department_admins` assignments, `principal` profile role, and legacy env allowlist fallback.
- `src/db.ts` — Server-side Appwrite client configuration (`databases`, `storage`, `users`) with empty ACL permissions enforcement.
- `src/handlers/profile.ts` — Authoritative handlers for user profile lookup, first-time onboarding with `[7:9]` department extraction, 10-digit phone validation, credential locking, and 6-department directory.
- `src/handlers/complaints.ts` — Authoritative handlers for dual-jurisdiction complaint creation, academic-scoped student feed with server-side peer PII/attachment redaction, maintenance-scoped admin operations across all 6 departments, Principal full-detail viewing, attachment validation (existence, ownership, private permissions, 5 MB limit, MIME + magic bytes) with Storage permission lockdown, and private `get-complaint-attachment` retrieval.
- `src/types.ts` — TypeScript domain types and request context.
