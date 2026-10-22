# CampusVoice — Product Requirements Document (PRD)

## 1. Overview
**Product:** CampusVoice  
**Type:** Department-based student complaint and community-support portal  
**Initial scope:** Two departments, two department administrators  
**Target delivery:** Two-day MVP implementation, followed by deployment and verification  
**Primary stack:** Next.js + TypeScript, Appwrite Cloud Auth, Appwrite Database, Appwrite Cloud Functions, and Vercel

CampusVoice lets students report campus problems, support an existing complaint when they are affected by the same issue, and see complaint status updates. Department issues are visible only within the relevant department. Public Issues are shared across all active departments.

## 2. Problem Statement
Traditional complaint portals can collect multiple reports about the same problem. This creates duplicate complaint records, makes it harder for administrators to understand how widespread an issue is, and adds unnecessary review work. Students may also lack visibility into whether a problem has already been reported or is being addressed.

CampusVoice provides a shared community complaint feed. Students can support an existing complaint rather than submit a duplicate, while administrators see one complaint and its count of unique supporters.

## 3. Product Goals
- Reduce duplicate complaint submissions by making existing complaints easy to find and support.
- Show the number of unique students supporting each complaint.
- Keep department-specific issues separated by department.
- Make Public Issues visible to all active departments and their administrators.
- Let authorized administrators update complaint status and publish an administrative response.
- Securely assign a student's department from a validated enrollment number once the official format is confirmed.

## 4. Target Users
### Students
- Authenticate using Google OAuth.
- Complete first-login onboarding with their name and enrollment number.
- Browse issues available to their department and Public Issues.
- Submit complaints, support existing complaints once, and track their activity.

### Department Administrators
- Two administrator accounts in the initial release, one for each active department.
- View complaints for their assigned department and all Public Issues.
- Update complaint status and add an administrative response.
- Cannot manage another department's private complaints.

### Future scope
The architecture should permit five departments and five department administrators without redesigning the core data model. Five administrator accounts are a future target, not the initial deployment scope.

## 5. Core Features
### 5.1 Google OAuth and onboarding
- Sign in through Appwrite's Google OAuth integration.
- On first authenticated visit, request student name and enrollment number.
- An Appwrite Function validates enrollment format and derives the department only after the official code position and format have been confirmed.
- Save the department assignment in the trusted profile record.
- Returning users go directly to the appropriate dashboard.
- Users with incomplete or invalid profiles cannot create or support complaints.

### 5.2 Department assignment
- Initial department codes: `06` and `07` (provisional mapping to the two active departments).
- Extract using the zero-based slice `[7:9]` (equivalent to characters 8 and 9 when counted from 1).
- The department code position is confirmed: characters 8–9 (1-based indexing). The full enrollment-number length and any additional format constraints remain to be confirmed.
- Do not search for `06` or `07` anywhere in the number.
- Do not infer or hardcode an extraction position.
- The department code can be extracted from characters 8–9. Validate the full enrollment-number format against official examples before production; reject codes other than `06` and `07`.
- Never let a client-provided department ID override the server's assignment.

### 5.3 Complaints
- Create a complaint with a title, location, description, priority (`Low`, `Medium`, `High`), optional attachment, and issue type (`department` or `public`). The complaint form also displays the student's saved name, enrollment number, and department as prefilled read-only fields.
- Department complaints are associated with one department.
- Public Issues are visible to all active departments.
- Complaint statuses: `Pending`, `In Progress`, `Resolved`.
- Display creation time, status, category, and unique supporter count.
- Search and filter complaints by text, status, and category.

### 5.4 Community support
- A student can support a complaint once.
- Enforce uniqueness in the database, not only in the UI.
- Support count is the number of unique support records for a complaint.
- A support action must not create another complaint.
- Whether students may withdraw support is deferred; initial MVP does not require withdrawal unless implemented consistently in API, schema, and UI.

### 5.5 Administrator panel
- Admin role and assigned department must be enforced inside every protected Appwrite Function.
- Admin sees private complaints only for their assigned department.
- Admin sees all Public Issues.
- Admin can update status and add an administrative response.
- Admin cannot change their own role or department through ordinary profile APIs.

## 6. Visibility and Authorization Matrix

| Action / data | Student | Department admin |
|---|---|---|
| View department complaints | Own department only | Assigned department only |
| View Public Issues | Yes, across active departments | Yes, across active departments |
| Create complaint | Yes, with completed profile | Not required in MVP |
| Support complaint | Eligible department/public complaint | Not required in MVP |
| Update complaint status | No | Assigned department and Public Issues |
| Add admin response | No | Assigned department and Public Issues |
| Change roles or department assignment | No | No, unless a separate trusted provisioning process is added |

## 7. Success Criteria
The MVP is accepted when:
1. A student can sign in with Google OAuth.
2. First-login onboarding collects required profile data.
3. The app never guesses the enrollment code position.
4. Department assignment uses a documented, tested official format or an approved verification fallback.
5. A student can submit a complaint and see it in the correct feed.
6. A second eligible student can support the complaint without creating a duplicate complaint.
7. Duplicate support attempts are rejected and do not increase the count.
8. Department A's private complaint is not visible to Department B's student or administrator.
9. Public Issues appear to students and administrators in both active departments.
10. Authorized admins can update status and administrative response.
11. Unauthorized API requests are rejected server-side.
12. Deployment environment variables and OAuth redirect URLs are configured without committing secrets.
13. Core flows are tested against the deployed environment.

## 8. Out of Scope for Initial Release
- AI-based complaint classification or duplicate detection.
- Email/SMS/push notifications.
- Real-time chat.
- Attachments and image uploads.
- Anonymous complaints.
- Multi-level escalation workflows.
- Analytics beyond basic counts.
- Five-department production rollout before the two-department MVP is verified.

## 9. Risks and Dependencies
- Official enrollment-number examples and department-code position are not yet provided.
- Exact department names are not yet provided.
- The two administrator email addresses are not yet provided.
- Appwrite project, Google OAuth credentials, allowed origins, and redirect URLs must be configured.
- The Appwrite Function runtime and function packaging approach must be selected.
- A two-day deadline conflicts with a fully hardened production launch; prioritize a tested MVP and describe remaining production hardening honestly.

## 10. Open Questions
- What are the official names of the two initial departments?
- What are valid enrollment-number examples for codes `06` and `07`, including examples with leading digits or repeated digits?
- What is the complete valid enrollment-number length/format, beyond the confirmed department code at characters 8–9?
- Should an administrator verify enrollment manually until the format is confirmed?
- Which two administrator emails should be provisioned?
- Which Appwrite Function runtime should be used, and should logical operations be deployed as separate Functions or one API-style Function?

## First-time profile identity confirmation

On first login, students enter their name and enrollment number. Before saving, show: “Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.” After saving, both values are locked in normal student flows. Corrections require an approved admin/support process. The screenshot values `Rahul` and `246510307054` are illustrative examples only.
