# Components Module (`src/components/`)

## Purpose
Reusable UI components matching the approved Minimalist Institutional Design System for CampusVoice.

## Components
- `DepartmentBadge.tsx`: Displays Department 06 (Civil) or 07 (Computer) with Phosphor icon and optional verified badge.
- `ComplaintStatusBadge.tsx`: Displays Pending (`open`), In Progress (`in_progress`), and Resolved (`resolved`) badges with pulse indicators.
- `ComplaintPriorityBadge.tsx`: Displays Low, Medium, and High priority badges with distinct color treatments.
- `ComplaintSupportButton.tsx`: Isolated community support button for Phase 4 support workflow (supported vs unsupported states).
- `ComplaintCard.tsx`: Spacious, minimalist complaint item card with metadata, location, description snippet, admin response, and support button.
- `SearchAndFilterBar.tsx`: Feed tabs (`All`, `My Department`, `Public Issues`), search query bar, and status filter pills.
- `LoadingSkeleton.tsx`: Card skeleton loaders for responsive feed loading.
- `EmptyState.tsx`: Minimal empty feed illustration and call-to-action button.
- `ErrorState.tsx`: Minimal error alert box with retry button.
- `AdminResolutionModal.tsx`: Accessible dialog for department administrators to update investigation status and post official remarks.

## Design System Rules
- Tailwind CSS exclusively, dark mode support on every component.
- `@phosphor-icons/react` exclusively for iconography.
- Strict TypeScript types with zero `any`.
