# CampusVoice — Design System

## 1. Design Direction
A modern, clean, professional college portal. The interface should feel trustworthy and easy to scan, with emphasis on complaint status, department scope, and supporter counts. Avoid decorative complexity that slows the two-day build.

## 2. Color Palette
Use a light theme by default.

| Token | Suggested value | Usage |
|---|---|---|
| Primary | `#1D4ED8` | Primary actions, active navigation |
| Primary hover | `#1E40AF` | Hover/pressed state |
| Page background | `#F8FAFC` | Main app background |
| Surface | `#FFFFFF` | Cards, dialogs, panels |
| Main text | `#0F172A` | Headings and body text |
| Muted text | `#64748B` | Metadata and helper text |
| Border | `#E2E8F0` | Dividers and card outlines |
| Success | `#15803D` | Resolved status |
| Warning | `#B45309` | Pending status |
| In progress | `#1D4ED8` | In Progress status |
| Danger | `#B91C1C` | Validation and destructive errors |

Maintain accessible contrast. Do not communicate status using color alone; include text labels.

## 3. Typography
- Suggested font: Inter or a system sans-serif stack.
- Page title: 28–32px desktop, 24px mobile, semibold.
- Section heading: 18–22px, semibold.
- Body: 14–16px.
- Metadata/helper text: 12–14px.
- Use consistent line height and avoid overly dense complaint cards.

## 4. Layout
### Desktop
- Left sidebar or compact top navigation.
- Main content width approximately 1100–1200px.
- Student feed uses a single readable column or two-column layout only when it remains easy to scan.
- Admin dashboard has summary metrics above a complaint table/list.

### Mobile
- Single-column feed.
- Stack form fields.
- Use full-width primary actions.
- Avoid horizontal overflow in tables; convert rows to cards where appropriate.

## 5. Core Components
- `AppShell`: shared navigation and page frame.
- `DepartmentBadge`: shows department scope when relevant.
- `IssueTypeBadge`: Department Issue or Public Issue.
- `StatusBadge`: Pending, In Progress, Resolved with text and icon/shape support.
- `ComplaintCard`: title, description preview, category, created date, status, support count, Support button.
- `SupportButton`: disabled/selected state after successful support; show clear duplicate/error feedback.
- `ComplaintForm`: prefilled read-only Student Name, Enrollment Number, and Department; required Complaint Title, Location, Description, and Priority; optional Attachment; validation messages; Cancel and Submit Complaint actions.
- `AdminComplaintTable` or responsive card list: title, scope, supporters, status, update action.
- `EmptyState`: helpful explanation and next action.
- `ErrorState`: actionable failure message and retry when safe.
- `LoadingState`: skeleton or spinner without implying success.

## 6. Navigation
### Student
- Dashboard / Community
- Submit Complaint
- My Activity
- Profile / Sign out

### Admin
- Overview
- Department Complaints
- Public Issues
- Profile / Sign out

Only show routes relevant to the current role, but enforce access on the backend regardless of navigation visibility.

## 7. Complaint Card Content
Show:
- Complaint title
- Short description
- Category
- Department or Public Issue label
- Status
- Created date
- Number of unique students supporting
- Support button with supported state

Do not display sensitive reporter information unless there is an explicit product requirement and access policy.

## 8. Forms and Feedback
- Use visible labels, not placeholder-only labels.
- Explain enrollment format only after the official format is confirmed.
- If department detection is not configured, say that profile verification is pending; do not show a fabricated department.
- Disable a submit button while a request is in flight, but still enforce uniqueness on the server.
- Display errors near the relevant field.
- Do not show success until the server confirms the operation.
- Confirm status updates and show the resulting server state.

## 9. Accessibility
- Keyboard-accessible navigation and controls.
- Visible focus indicators.
- Correct semantic headings and form labels.
- Sufficient text/background contrast.
- Statuses use text labels, not color alone.
- Support action has an accessible name and announces updated count where practical.

## 10. Responsive and Interaction States
Every core page should include:
- Loading state
- Empty state
- Validation error state
- API/network error state
- Successful result state
- Unauthorized/access-denied state where relevant

## 11. Design Scope Rules
- Build reusable components only where they help consistency.
- Avoid animations, complex charting, and custom illustration work in the MVP.
- Prioritize clarity, trust, and a usable community feed.


## Raise Complaint Form Specification

Use the supplied reference screenshot as the visual target: white rounded form card, two-column rows where space allows, clear labels, comfortable input spacing, and bottom-aligned Cancel and primary Submit Complaint actions.

- Row 1: Student Name (prefilled, read-only) and Enrollment Number (prefilled, read-only).
- Row 2: Problem / Complaint Title (required, full width).
- Row 3: Department (prefilled, read-only) and Location (required).
- Row 4: Description (required, multiline).
- Row 5: Priority (required; selectable Low, Medium, High options with distinct blue, amber, and red indicators).
- Row 6: Attachment (optional file input).
- Footer: Cancel and Submit Complaint buttons.

Read-only fields should look like normal inputs but cannot be edited. Show helper text that the name, enrollment number, and department come from the student's profile. Keep the layout responsive: stack columns on narrow screens. Do not rely on color alone to communicate priority.

## First-time profile warning

Place a small, readable warning below the Name and Enrollment Number inputs and above the Save/Continue button:

“Please check your name and enrollment number carefully. Once you save them, they cannot be changed through your account.”

Reference example values: **Rahul** and **246510307054**. These are illustrative only, not universal defaults. After first save, both fields are read-only in normal student flows.
