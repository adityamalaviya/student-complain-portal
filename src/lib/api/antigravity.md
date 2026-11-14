# API Client Module — `src/lib/api`

## Purpose
Client-side invocation wrapper for Appwrite Cloud Function `campusvoice-api`.
Provides typed methods for profile fetching, student onboarding, department listing, complaint creation/listing/detail (including chronological `timeline`), private attachment retrieval (`apiGetComplaintAttachment`), community support, and maintenance admin operations (`apiUpdateAdminComplaint` with persisted timeline response).
Protects calls with Appwrite JWT.
