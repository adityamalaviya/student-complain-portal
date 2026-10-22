# App Router Module — `src/app`

## Purpose
Next.js App Router root layout, pages, and API endpoints for CampusVoice.

## Routes
- `/`: Home entry point with authentication-aware redirection.
- `/sign-in`: Approved Minimalist Google OAuth sign-in screen (Screen 1 `f0c43763d7fc432a9d1707f25cb80860`).
- `/auth/callback`: OAuth callback handler resolving Google session and directing user to onboarding, dashboard, or admin.
- `/onboarding`: First-time student profile setup (Screen 2 `88de13563aae4a9295c9b383e3c0be78`) with real-time zero-based slice `[7:9]` department extraction and verbatim one-time lock warning.
- `/dashboard`: Student dashboard landing page (Screen 3 `8b3edccce6094a8f820d740c2f9be10e`) displaying department jurisdiction, verified profile, and navigation.
- `/complaints/new`: Raise complaint form (Screen 4 `f038ac8a691a4208b0a11c0e3293ce47`) prefilling read-only student credentials.
- `/api/health`: Health status endpoint.
