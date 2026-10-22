# CampusVoice — Technical Requirements Document (TRD)

## 1. Selected Stack
- **Frontend:** Next.js App Router + TypeScript.
- **Backend logic:** Appwrite Cloud Functions (serverless); no separate FastAPI server.
- **Authentication:** Appwrite Cloud Auth with Google OAuth.
- **Database:** Appwrite Cloud Database.
- **Frontend hosting:** Vercel.
- **Backend hosting:** Appwrite Cloud Functions.
- **Business operations:** Appwrite Function executions using the supported Appwrite SDK/API.
- **Validation:** Validate in the frontend for usability and repeat all authoritative checks in Functions.
- **Testing:** Unit/integration tests for Functions and end-to-end checks for critical user flows.

## 2. Authentication and Session Handling
1. Configure Google as an Appwrite OAuth provider.
2. Register development and production frontend URLs in Appwrite's allowed origins and OAuth redirect configuration.
3. Frontend initiates OAuth and handles the return route.
4. The frontend invokes protected Functions using the supported Appwrite execution/authentication mechanism.
5. Each Function validates the caller's identity using a documented Appwrite mechanism before trusting the caller.
6. The Function loads the application profile and role from trusted data.
7. Reject missing, expired, invalid, or revoked credentials.
8. Do not trust email, user ID, role, department, or admin status supplied in the request body.
9. Never place Appwrite server API keys or secrets in frontend environment variables.

**Implementation gate:** Confirm the exact Appwrite Functions SDK/runtime behavior and the supported way to pass/verify caller identity before implementing protected operations. Do not assume a Function automatically inherits the browser's session context.

## 3. Authorization
- Student profile must be complete before complaint creation or support.
- Student's department is resolved from a server-managed profile.
- The Raise Complaint form shows student name, enrollment number, and department prefilled and read-only. The server independently resolves these values from the authenticated user's trusted profile.
- Department issue reads are restricted to the associated department.
- Public Issues are readable by all active departments.
- Admin authorization is based on server-managed admin profile records or a protected allowlist, not a frontend route or typed email alone.
- Initial release provisions two department administrators. Future five-admin support is a configuration/data change.
- Admin A cannot read or modify Department B private complaints.
- Status changes and admin responses require authorization inside every Function.
- CORS is not authorization.

## 4. Department Detection
- Active department codes: `06`, `07`.
- Official department names and code-to-name mapping must be confirmed.
- The code position is confirmed as characters 8–9 using 1-based indexing. The complete enrollment-number length and other format constraints still need confirmation.
- Do not use `find`, `includes`, or substring searching over the entire number to infer the code.
- Use the confirmed zero-based slice `[7:9]`, equivalent to characters 8–9 in 1-based indexing.
- Treat enrollment numbers as strings, preserving leading zeros.
- Validate allowed characters and overall length only after the official format is supplied.
- Reject unsupported department codes and validate the full enrollment-number format against official examples before production.
- Derive department assignment inside a trusted Function and prevent clients from updating it directly.

## 5. Function Contract (proposed)
These are logical operations, not promises that each must be a separate deployed Function. They may be separate Functions or routed through one API-style Function, depending on the chosen Appwrite runtime and deployment design.

| Logical operation | Purpose | Access |
|---|---|---|
| `get-profile` | Retrieve current authenticated profile | Authenticated |
| `complete-onboarding` | Submit name and enrollment number | Authenticated, incomplete profile |
| `list-departments` | List active departments if needed by UI | Policy-dependent |
| `list-complaints` | Paginated visible complaints; filters for status/category/search | Authenticated |
| `create-complaint` | Create a complaint | Student with complete profile |
| `get-complaint` | Retrieve detail if visible to caller | Authenticated |
| `support-complaint` | Support once | Eligible student |
| `get-support-state` | Return support count and caller's support state | Authenticated and authorized |
| `get-admin-dashboard` | Admin metrics and scoped complaint counts | Authorized admin |
| `list-admin-complaints` | Admin's department complaints plus Public Issues | Authorized admin |
| `update-admin-complaint` | Update status and/or admin response | Authorized admin within scope |

### Response behavior
- Use consistent JSON payloads and error shapes for every Function.
- Return a success result only after the database operation succeeds.
- Map errors to clear UI states, including unauthorized, invalid input, already supported, and unavailable resource.
- Paginate complaint lists with bounded page size.
- Never accept a supporter count from the client.
- Repeated support calls must not increase the count.
- Confirm Appwrite's supported Function execution response and payload limits during implementation.

## 6. Data Model / Appwrite Collections
See `schema.md`. Expected collections:
- Complaint creation fields: `title` (required), `location` (required), `description` (required), `priority` (`low`, `medium`, `high`, required), optional attachment metadata, and `issue_type` (`department`, `public`).
- `departments`
- `profiles`
- `complaints`
- `complaint_supports`

Use stable document IDs or explicit unique fields where practical. If the selected Appwrite Database version cannot enforce a required uniqueness rule directly, implement an atomic strategy supported by that version and test concurrent duplicate support attempts. A naive “query then insert” alone is race-prone.

## 7. Environment Variables
Example names only; populate deployment secrets privately.

### Frontend `.env.local`
- `NEXT_PUBLIC_APPWRITE_ENDPOINT`
- `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- `NEXT_PUBLIC_APPWRITE_DATABASE_ID` only if required for approved client-side reads; prefer business data through Functions
- `NEXT_PUBLIC_APPWRITE_FUNCTION_ID` only if using a single public API-style Function
- `NEXT_PUBLIC_APPWRITE_FUNCTION_*_ID` only for Function IDs intended to be invoked by the client

Only public Appwrite project configuration and IDs belong in `NEXT_PUBLIC_*`. Never put a server API key here.

### Appwrite Function environment
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY` (Function-only, least-privilege scopes, if required)
- `APPWRITE_DATABASE_ID`
- `APPWRITE_PROFILES_COLLECTION_ID`
- `APPWRITE_DEPARTMENTS_COLLECTION_ID`
- `APPWRITE_COMPLAINTS_COLLECTION_ID`
- `APPWRITE_SUPPORTS_COLLECTION_ID`
- Admin configuration or server-managed admin profile setup
- `ENVIRONMENT`

Use Function environment settings and `.env.example` placeholders only. Never commit real secrets.

## 8. Deployment Requirements
- Deploy frontend to Vercel.
- Deploy backend logic as Appwrite Cloud Functions.
- Configure Appwrite OAuth origins and redirect URLs for local and production frontend URLs.
- Configure each Function's runtime, execution permissions, environment variables, and least-privilege API key scopes.
- Use HTTPS in production.
- Confirm Functions can access Appwrite Database.
- Keep separate development and production configuration where possible.
- Do not claim deployment is complete until deployed OAuth, database, Function invocation, and authorization flows are tested.

## 9. Testing Requirements
- Unit-test department parsing once official examples and positions are supplied.
- Test unsupported/invalid department codes.
- Test incomplete profile restrictions.
- Test complaint visibility for both departments and Public Issues.
- Test duplicate support, including concurrent requests if supported by the test setup.
- Test admin scope isolation.
- Test invalid/expired credentials.
- Test deployed frontend-to-Function authentication and permissions.
- Check browser bundle and logs for leaked secrets.

## 10. Unresolved Technical Decisions
- Exact Appwrite Function runtime/language and SDK versions.
- Exact identity propagation/verification mechanism for Function executions.
- Full enrollment-number length/format and allowed characters; department-code position is confirmed as characters 8–9.
- Actual names for department codes `06` and `07`.
- Actual two admin email addresses and how they are provisioned.
- Whether to deploy one API-style Function or multiple smaller Functions.

## Profile identity immutability

First-time profile setup collects name and enrollment number and displays a warning before saving that they cannot be changed through the student's account afterward. Enforce immutability in Appwrite Functions/server-side business logic. Corrections require an authorized workflow. `Rahul` and `246510307054` are illustrative values only.
