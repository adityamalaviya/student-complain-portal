# App Router Module — `src/app`

## Purpose
Next.js App Router root layout, pages, and API endpoints for CampusVoice.

## Routes
- `/`: Home entry point with authentication-aware redirection.
- `/sign-in`: Approved Minimalist Google OAuth sign-in screen (Screen 1 `f0c43763d7fc432a9d1707f25cb80860`).
- `/auth/callback`: OAuth callback handler resolving Google session and directing user to onboarding, dashboard, or admin.
- `/onboarding`: First-time student profile setup collecting name, 12-digit enrollment number (`[7:9]` extraction), and 10-digit Indian phone number (`/^[6-9]\d{9}$/`) with credential lock notice.
- `/dashboard`: Student dashboard landing page scoped to the student's academic department (`student_department_id`) with Department Feed vs My Submissions tabs, search, status filters, and complaint cards.
- `/complaints/new`: Raise complaint form prefilling locked student identity and academic department context, with a required 6-department Maintenance Department selector, private Appwrite Storage attachment upload (5 MB, PDF/JPG/JPEG/PNG), and orphan cleanup on failure (no public complaint toggle).
- `/complaints/[id]`: Complaint detail view with maintenance/academic department context, conditionally rendered authorized submitter details (Creator, concerned Maintenance Admin, Principal only), private attachment download via `apiGetComplaintAttachment`, community support button, admin response card, and oracle elimination 404 handler.
- `/admin`: Zen Department Administrator Dashboard (Screen 6 `c10fa303083e40fe9ef3c14625a4aabb`) with inline metrics, single-column grievance queue, and centered resolution modal.
- `/api/health`: Health status endpoint.
