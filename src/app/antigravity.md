# App Router Module — `src/app`

## Purpose
Next.js App Router root layout, pages, and API endpoints for CampusVoice.

## Routes
- `/`: Home entry point with authentication-aware redirection.
- `/sign-in`: Approved Minimalist Google OAuth sign-in screen (Screen 1 `f0c43763d7fc432a9d1707f25cb80860`).
- `/auth/callback`: OAuth callback handler resolving Google session and directing user to onboarding, dashboard, or admin.
- `/onboarding`: First-time student profile setup (Screen 2 `88de13563aae4a9295c9b383e3c0be78`) with real-time zero-based slice `[7:9]` department extraction and verbatim one-time lock warning.
- `/dashboard`: Student dashboard landing page (Screen 3 `8b3edccce6094a8f820d740c2f9be10e`) with department vs public feed tabs, search and status filters, and complaint cards.
- `/complaints/new`: Raise complaint form (Screen 4 `f038ac8a691a4208b0a11c0e3293ce47`) prefilling read-only student credentials.
- `/complaints/[id]`: Complaint detail view (Screen 5 `9ad544a4dbf94c039a533138fb02af99`) with Phase 4 community support button, admin response card, and oracle elimination 404 handler.
- `/admin`: Zen Department Administrator Dashboard (Screen 6 `c10fa303083e40fe9ef3c14625a4aabb`) with inline metrics, single-column grievance queue, and centered resolution modal.
- `/api/health`: Health status endpoint.
