# Custom Hooks Module — `src/lib/hooks`

## Purpose
Exposes React hooks for application state, including authentication context (`useAuth`, `AuthProvider` with silent `refreshProfile` and `hasMaintenanceScope`/`hasAcademicScope`), unified route guards (`useAuthGuard`), and optimistic community support toggles (`useSupportToggle`).
Follows strict React Hooks rules and ensures full cleanup of side effects.
