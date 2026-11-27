# Components Module (`src/components/`)

## Purpose
Reusable UI components matching the approved Minimalist Institutional Design System for CampusVoice.

## Components
- `DepartmentBadge.tsx`: Displays any of the 6 institutional departments (Computer, Civil, Electrical, Mechanical, Water, Sanitation) with Phosphor icon and optional verified badge.
- `ComplaintStatusBadge.tsx`: Displays Pending, In Progress, and Resolved badges (supporting canonical and legacy status values) with pulse indicators.
- `ComplaintPriorityBadge.tsx`: Displays Low, Medium, and High priority badges with distinct color treatments.
- `ComplaintSupportButton.tsx`: Isolated community support button for support workflow.
- `ComplaintCard.tsx`: Spacious, minimalist complaint item card with maintenance department badge, location, description snippet, admin response, and support button.
- `SearchAndFilterBar.tsx`: Feed tabs (`Department Feed`, `My Submissions`), search query bar, and status filter pills (`Pending`, `In Progress`, `Resolved`).
- `LoadingSkeleton.tsx`: Card skeleton loaders for responsive feed loading.
- `EmptyState.tsx`: Minimal empty feed illustration and call-to-action button.
- `ErrorState.tsx`: Minimal error alert box with retry button.
- `AdminResolutionModal.tsx`: Accessible dialog for department administrators to update investigation status (`canSelectComplaintStatus` blocks reverting `In Progress/Resolved → Pending` and reopening `Resolved → In Progress`, while allowing `Resolved` follow-up notes), record `In Progress` substantive progress updates, guard against duplicate submissions, and preserve unsaved input on error.
- `PhoneChangeModal.tsx`: Accessible dialog using `getPhoneChangeWorkflowState` for students to request academic phone changes, complete approved one-time updates, and view a dedicated post-completion confirmation card without unmounting the parent dashboard.
- `PhoneRejectModal.tsx`: Accessible dialog for academic department administrators to reject student phone change requests with mandatory reason validation ($\ge 5$ characters) logged to the audit trail.
- `ClarificationRequestModal.tsx`: Dialog for administrators to request additional complaint details from students (blocked on `Resolved` complaints).
- `ClarificationReplyBox.tsx`: Interactive component for complaint authors to submit replies when clarification state is `awaiting_reply`.
- `IssueWarningModal.tsx` & `RespondWarningModal.tsx`: Accessible dialogs for Principal 5-day delay warnings and single-response Maintenance Admin remediations.
- `principal/AssignAdminModal.tsx`, `principal/PrincipalAdminAssignmentsTab.tsx`, & `principal/PrincipalAuditTrailTab.tsx`: Principal governance UI with accessible dialog dismissals, inline revocation error feedback, and full 13-action audit filtering (`AUDIT_ACTION_FILTER_OPTIONS`).

## Design System Rules
- Tailwind CSS exclusively, dark mode support on every component.
- `@phosphor-icons/react` exclusively for iconography.
- Strict TypeScript types with zero `any`.
