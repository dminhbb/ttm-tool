# Design Review: Role-based sidebar navigation gating

Reviewed against: no DESIGN_BRIEF.md in repo (none found under `.design/` or project root) — reviewed against general UX/accessibility best practices and consistency with the existing design system instead.
Scope: latest commit `71cd22a` ("bổ sung phân quyền") — [`src/components/layout/AppShell.tsx`](src/components/layout/AppShell.tsx), plus the API routes it mirrors.
Date: 2026-08-17

## Screenshots Captured

None. The Browser pane's screenshot/click compositor was unavailable this session ("Browser pane is not displayed"), so this review is based on live DOM inspection instead (`read_page`, `get_page_text`, and `javascript_tool` against the running `localhost:3000` app, logged in as a SUPERADMIN account). All findings below were verified against the real rendered app, just not captured as images.

Verified live:
- Desktop (1280×800), collapsed and expanded sidebar, as SUPERADMIN — full nav confirmed present with correct hrefs and `aria-label`s.
- Mobile (375×812) — hamburger trigger and slide-out drawer confirmed working, same role-filtered item set, close controls present.
- Not verified live: ADMIN and USER role views (no test credentials for those roles were available), dark mode (project does not appear to expose a toggle in the areas touched by this diff).

## Summary

The role-gating logic itself is careful and correctly scoped — the nav-hiding, empty-section-dropping, and path-matching (`requiredRolesFor`) all handle edge cases well (e.g. the `/epic-alerts` vs `/epic-alerts-15` prefix collision is correctly avoided). The main issues are UX consequences of doing the gate entirely client-side and after mount: a visible flash of the ungated nav on every load, and page content mounting before the redirect for a lower-privileged user fires. Underlying data is safe (APIs enforce `SUPERADMIN`/`ADMIN` server-side independently), so this is a polish/consistency gap, not a security hole.

## Must Fix

None. No broken functionality or accessibility failure found in the diff itself.

## Should Fix

> **Status: both items below were fixed in [AppShell.tsx](src/components/layout/AppShell.tsx).** See "Fixes Applied" at the end of this document.

1. **Nav flashes to the "no role" state on every page load.** `role` starts as `null` ([AppShell.tsx:247](src/components/layout/AppShell.tsx#L247)) and `visibleNavigationFor(null)` filters out every item that declares `roles` ([AppShell.tsx:86-90](src/components/layout/AppShell.tsx#L86-L90)), so *all* users — including SUPERADMIN — briefly see only "Dashboard" and "Quản lý Epic 15" before `/api/auth/me` resolves and the rest of the menu pops in. This is a real layout shift on every navigation, not just first load, since the effect re-fires on `pathname` change. _Fix: cache the resolved role (context/localStorage) after first load so subsequent navigations don't re-flash, or keep the previous role value while a new fetch is in flight instead of resetting to `null`._

2. **Protected page content mounts before the client-side redirect fires.** `AppShell` renders `children` unconditionally on every non-`/login` route ([AppShell.tsx:277-279](src/components/layout/AppShell.tsx#L277-L279)); the role-based redirect only runs after `role` is fetched ([AppShell.tsx:262-266](src/components/layout/AppShell.tsx#L262-L266)). Confirmed live: `src/app/admin/database/page.tsx` starts its own data fetch on mount ([page.tsx:29-31](src/app/admin/database/page.tsx#L29-L31)) with no role check of its own — it currently gets away with this only because the underlying API route independently enforces `SUPERADMIN` server-side (confirmed in `src/app/api/admin/db-backup/tables/route.ts:14`), so no protected data actually leaks. But a USER or ADMIN hitting `/admin/database` directly will see the full page chrome, a loading skeleton, and likely a visible error toast for a beat before being bounced to `/epic-alerts-15`. _Fix: don't render `children` until the role check for the current path has resolved (show a blank/loading state instead), or move this gate to middleware/server components so unauthorized routes never mount client-side at all._

## Could Improve

> **Status: item 1 below was addressed** with a dev-only consistency check (does not apply to `GENERAL_SETTINGS_ITEM` itself, since it has no `href`, but now catches the general class of bug for any future routed item).

1. **`GENERAL_SETTINGS_ITEM` (the gear icon, ADMIN/SUPERADMIN only) has no corresponding entry in `PAGE_ROLES`.** That's correct today since it opens a modal rather than navigating, but if it's ever converted to a routed page, it'll silently skip the redirect protection every other gated item gets. Worth a comment or a lint-style check tying `PAGE_ROLES` keys to `roles`-bearing nav items with an `href`.
2. Nice touch: `visibleNavigationFor` drops an entire section when it has zero visible items (comment at [AppShell.tsx:84-85](src/components/layout/AppShell.tsx#L84-L85)) rather than rendering an empty "Quản trị hệ thống" header for a plain USER — worth keeping as the pattern for any future gated section.

## What Works Well

- The permission matrix is centralized in one small set of constants (`ADMIN_OR_SUPERADMIN`, `SUPERADMIN_ONLY`, `PAGE_ROLES`) rather than scattered role checks, so it's easy to audit and keep in sync with the API-side checks (the comment at [AppShell.tsx:218-221](src/components/layout/AppShell.tsx#L218-L221) explicitly calls out which API routes it mirrors — good practice).
- `requiredRolesFor`'s prefix matching correctly avoids the `/epic-alerts` vs `/epic-alerts-15` false-positive by requiring a trailing `/` boundary — an easy bug to introduce and it was avoided.
- Defense in depth held up under inspection: even though the client-side gate has the mount-before-redirect gap noted above, the actual data-serving API routes enforce roles independently, so the practical impact is UX-only, not a data exposure.
- Mobile drawer and desktop collapsed/expanded rail both correctly reuse the same `visibleNavigationFor(role)` filtering — no divergence in what different viewport sizes show.

## Fixes Applied

All changes are in [`src/components/layout/AppShell.tsx`](src/components/layout/AppShell.tsx). Verified live against the running app (SUPERADMIN session, `/admin/database` hard reload): no hydration errors, no dev-console nav-consistency warnings, correct nav rendered, `tsc --noEmit` and `eslint` both clean.

- **Nav flash (Should Fix #1)**: added a session-scoped role cache (`sessionStorage`, key `ttm-role-cache`), read via `useSyncExternalStore` so it's available synchronously on render without a hydration mismatch (the server snapshot is always `null`) and without a `setState`-in-effect cascade (caught by `react-hooks/set-state-in-effect` during lint — first attempt used a `useLayoutEffect` + `setState`, which tripped that rule and had to be reworked). The cached value (`displayRole`) is used **only** to pick which nav items to show; it is explicitly not used for the authorization gate below, so a stale cache can't grant access to gated content — see next point.
- **Late redirect / content mounts before gate (Should Fix #2)**: `AppShell` now computes `isAuthorized` from the *confirmed* `role` (never the cache) and renders a "Đang kiểm tra quyền truy cập…" placeholder instead of `children` until it resolves true. A protected page's own data-fetching effects can no longer mount for a role that doesn't belong there.
- **Silent `PAGE_ROLES` gaps (Could Improve #1)**: added a dev-only (`NODE_ENV !== 'production'`) startup check that warns in the console if any nav item declares `roles` and an `href` but has no matching `requiredRolesFor` entry — catches the class of bug described in that finding before it ships, for any future routed item.
