# Task 5 Report: SystemStatusFooter Component Overhaul

## Overview
Updated `src/components/layout/SystemStatusFooter.tsx` to display real-time application visit metrics, current screen visits (for tracked screens), the 5 most recent login users with interactive hover tooltips, and copyright/db target info in a centered 2-line layout.

## Implementation Details

### 1. File: `src/components/layout/SystemStatusFooter.tsx`
- **Data Fetching**:
  - System status (`/api/system/status`) fetched once on mount.
  - Visit summary (`/api/visit-counter/footer?path=${encodeURIComponent(pathname)}`) fetched whenever `pathname` changes using `usePathname()`.
  - Used cancellation flags (`cancelled = true` on cleanup) to prevent race conditions during rapid client-side routing.
  - Graceful loading state handling (shows placeholders `—` or `…` without jarring layout jumps).

- **Line 1 Layout & Formatting (`text-[11px]`, centered, `text-slate-500`)**:
  - Displays: `TTM Tool | Version {status.version} | Total visit: {A}. Weekly: {B}. {This screen: {C}. }Last login users: {D}.`
  - Total visits ($A$) and Weekly visits ($B$) formatted using Vietnamese number format (`toLocaleString('vi-VN')`).
  - Screen visits ($C$): Conditionally displayed **only** when `screenVisits !== null` (i.e. on the 4 tracked screens: `/dashboard-new`, `/epic-alerts-15`, `/reports`, `/epic-in-po`). On untracked screens (e.g. `/login`, `/admin/users`), the `This screen: {C}. ` segment is completely omitted.
  - Recent login users ($D$): 5 most recent login users separated by commas `, `.
    - Each user is wrapped in `<Tooltip className="inline-flex w-auto" side="top">`.
    - Dotted underline styling with hover state (`cursor-pointer font-medium text-slate-600 underline decoration-dotted decoration-slate-400 underline-offset-2 hover:text-slate-900`).
    - Tooltip displays full name (`user.fullName || user.username`) and exact login timestamp formatted as `DD/MM/YYYY HH:mm:ss` in GMT+7 (`Asia/Ho_Chi_Minh`).

- **Line 2 Layout (`text-[10px] text-gray-400 opacity-80 text-center`)**:
  - Displays: `(C) minhnd7. db: {status.dbTarget} - {status.dbStatus}`.
  - Replaced the old 2-line right-aligned debug readout.

- **Container**:
  - Semantic `<footer>` with `w-full shrink-0 px-3 py-2 flex flex-col items-center justify-center gap-0.5 text-center leading-tight`.

## Verification & Tests
1. **TypeScript Typecheck**:
   - Command: `cmd /c npx tsc --noEmit`
   - Result: Exit code 0, 0 errors.
2. **Production Build**:
   - Command: `cmd /c npm run build`
   - Result: Exit code 0, all 87 routes and static pages compiled successfully.

## Status
- **Status**: DONE
- **Summary**: Overhauled `SystemStatusFooter.tsx` with centered 2-line layout, visit counters, conditional screen counts, and tooltip-enabled recent login users; passed typecheck and Next.js build.
- **Commits**: none
- **Tests**: `npx tsc --noEmit` passed with 0 errors; `npm run build` passed with 0 errors.
- **Concerns**: none
