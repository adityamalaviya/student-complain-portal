# Appwrite Cloud Function — `functions/campusvoice-api`

## Purpose
Single serverless API router deployed to Appwrite Cloud Functions executing all authoritative business operations for CampusVoice.

## Architecture
- `src/index.ts` — Main request dispatcher routing incoming actions (`health`, `list-departments`, `get-profile`, `complete-onboarding`).
- `src/auth.ts` — Server-side caller verification via Appwrite JWT or internal execution header, and normalized admin email allowlist evaluation (`.trim().toLowerCase()`).
- `src/db.ts` — Server-side Appwrite client configuration with empty ACL permissions enforcement.
- `src/handlers/profile.ts` — Authoritative handlers for user profile lookup, first-time onboarding with zero-based slice `[7:9]` department extraction, and permanent lock enforcement.
- `src/types.ts` — TypeScript domain types and request context.
