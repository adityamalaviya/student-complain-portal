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
- `AdminResolutionModal.tsx`: Accessible dialog for department administrators to update investigation status and post official remarks.

## Design System Rules
- Tailwind CSS exclusively, dark mode support on every component.
- `@phosphor-icons/react` exclusively for iconography.
- Strict TypeScript types with zero `any`.
