# Task 4 Report: Client-Side Automatic Screen Tracking Implementation

## Overview
Implemented client-side automatic screen visit tracking for the 4 key screens in `AppShell.tsx`:
1. Created `src/lib/visit-counter-client.ts` containing URL path resolution and debounced screen visit tracking.
2. Updated `src/components/layout/AppShell.tsx` to automatically trigger `trackScreenVisit` when authorized users navigate to tracked screens.
3. Verified path resolution, client debouncing logic, and full TypeScript typechecking (`0` errors).

## Deliverables

### 1. Client Tracking Library: `src/lib/visit-counter-client.ts`
- **Path Resolution**:
  - `resolveScreenKeyFromPathname(pathname: string): ScreenKey | null`
  - Normalized path matching (stripping query string and trailing slash):
    - `/dashboard-new`, `/dashboard` $\to$ `'dashboard'`
    - `/epic-alerts-15`, `/epic-alerts` $\to$ `'epic_alerts'`
    - `/reports` $\to$ `'epic_reports'`
    - `/epic-in-po` $\to$ `'epic_in_po'`
    - Any other path $\to$ `null`
- **Debounced Screen Tracking**:
  - `trackScreenVisit(screenKey: ScreenKey): void`
  - Uses `sessionStorage` with key `ttm_last_screen_track_${screenKey}` to enforce a 30-second cooldown per screen.
  - Safe for SSR (`typeof window === 'undefined'` guard) and wrapped in try-catch to handle restrictive browser privacy modes.
  - Fires POST request to `/api/visit-counter/track` with JSON `{ screenKey }` asynchronously in a fire-and-forget manner (`.catch(() => undefined)`).

### 2. AppShell Integration: `src/components/layout/AppShell.tsx`
- Imported `resolveScreenKeyFromPathname` and `trackScreenVisit` from `@/lib/visit-counter-client`.
- Added `useEffect` in `AppShellInner`:
  ```ts
  React.useEffect(() => {
    if (!role || mustChangePassword) return;
    const screenKey = resolveScreenKeyFromPathname(pathname);
    if (screenKey) {
      trackScreenVisit(screenKey);
    }
  }, [pathname, role, mustChangePassword]);
  ```
- Complies with React Hook rules: placed unconditionally at the component hook level, only fires tracking when user is authenticated (`role !== null`) and not blocked by force-password-change (`!mustChangePassword`).

## Verification & Tests
1. **TypeScript Typecheck**:
   - Command: `cmd /c npx tsc --noEmit`
   - Result: 0 errors, clean check.
2. **Path Resolution Test Suite**:
   - Tested `/dashboard-new`, `/dashboard`, `/dashboard-new?timeRange=30`, `/epic-alerts-15`, `/epic-alerts`, `/epic-alerts-15/`, `/reports`, `/reports?tab=1`, `/epic-in-po`, `/epic-in-po/`, `/admin/users`, `/`, and `/login`.
   - Result: 100% passed.

## Status
- **Status**: DONE
- **Summary**: Implemented `src/lib/visit-counter-client.ts` with 30s session debouncing and wired automatic screen tracking into `AppShell.tsx` with 0 typecheck errors.
- **Commits**: none
- **Tests**: `npx tsc --noEmit` passed with 0 errors; path resolution suite passed.
- **Concerns**: none
