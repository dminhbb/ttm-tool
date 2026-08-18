# Design backup — Wise-inspired redesign (2026-08-18)

Files here are pre-redesign copies of everything touched while applying the Wise-inspired
design system described in `DESIGN.md`. Each file's path mirrors its real location under the
repo root.

## To revert everything

Since every file below is already tracked by git, the simplest revert is:

```bash
git checkout -- src/app/globals.css src/app/layout.tsx src/components/layout/AppShell.tsx
```

(add any other paths listed below if more were touched after this note was written)

## To revert one file by hand

Copy the backup back over the real file, e.g.:

```bash
cp design-backup/src/app/globals.css src/app/globals.css
```

## Files backed up here

- `src/app/globals.css` — design tokens (colors, radius scale, component base classes)
- `src/app/layout.tsx` — font loading
- `src/components/layout/AppShell.tsx` — sidebar/header brand mark and heading weight

## Round 2 — "Giao diện cũ / mới" theme toggle (2026-08-18)

Added the ability to switch between the old design and the Wise redesign from Settings →
"Giao diện". Pre-toggle-feature snapshots (i.e. globals.css/layout.tsx as they were right after
round 1, before the legacy-brand CSS block and init script were added) are in
`design-backup/2-theme-toggle/`, same mirrored-path layout, same revert instructions.

New files with no prior version (delete them to remove the feature entirely, no backup needed
since they didn't exist before):
- `src/lib/theme-brand.ts`
- `src/components/settings/AppearancePanel.tsx`

Also changed as part of this round (not present in round 1's backup):
- `src/components/settings/GeneralSettingsModal.tsx` — added the "Giao diện" section

To revert only the toggle feature and keep the Wise redesign:
```bash
cp design-backup/2-theme-toggle/src/app/globals.css src/app/globals.css
cp design-backup/2-theme-toggle/src/app/layout.tsx src/app/layout.tsx
cp design-backup/2-theme-toggle/src/components/settings/GeneralSettingsModal.tsx src/components/settings/GeneralSettingsModal.tsx
cp design-backup/3-usermenu-appearance/src/components/layout/UserMenu.tsx src/components/layout/UserMenu.tsx
rm src/lib/theme-brand.ts src/components/settings/AppearancePanel.tsx
```

## Round 3 — moved the toggle into the user's own "Cài đặt" (2026-08-18)

Round 2 put the theme picker in the admin-only "Quản lý chung" modal (gear icon), which
ADMIN/SUPERADMIN-gates it in AppShell's nav — a plain USER role would never see it. Moved it into
UserMenu's own "Cài đặt" modal (avatar popup, bottom-left of the sidebar), which every
authenticated user can open regardless of role, next to the existing light/dark mode picker.

`design-backup/3-usermenu-appearance/` holds the round-2 state of `UserMenu.tsx` and
`GeneralSettingsModal.tsx` (from right before this move). `theme-brand.ts` and
`AppearancePanel.tsx` are unchanged from round 2 — only which modal renders `<AppearancePanel />`
changed.

To revert just this move (back to admin-only placement):
```bash
cp design-backup/3-usermenu-appearance/src/components/layout/UserMenu.tsx src/components/layout/UserMenu.tsx
cp design-backup/3-usermenu-appearance/src/components/settings/GeneralSettingsModal.tsx src/components/settings/GeneralSettingsModal.tsx
```
(then re-add `AppearancePanel` to `GeneralSettingsModal.tsx`'s `SECTIONS` list, as round 2 had it)

## Round 4 — theme labels, settings text trim, "Thông tin cá nhân" (2026-08-18)

- Renamed the two theme swatches to "Lime theme" / "Navy theme" and dropped their per-option
  description lines (`AppearancePanel.tsx`).
- Removed the "Chế độ hiển thị / Lựa chọn được lưu trên thiết bị này..." heading+paragraph from
  the user's "Cài đặt" modal, keeping just the Sáng/Tối select (`UserMenu.tsx`).
- Enabled the previously-disabled "Thông tin cá nhân" ("Sắp có") menu item: it now opens
  `UserInfoModal.tsx`, showing name/username/role/domains/PM-SM projects, plus (ADMIN only, not
  SUPERADMIN) the list of projects visible to them via their assigned domains — same scope as
  `resolveAccessScope` in `epic-alert-service.ts`. Backed by a new `getUserProfileDetails()` in
  `auth-service.ts` and `GET /api/auth/profile`.

`design-backup/4-user-info/` holds the state of `UserMenu.tsx`, `AppearancePanel.tsx`,
`auth-types.ts`, and `auth-service.ts` right before this round (i.e. after round 3, before the
label/text trims and the profile feature). New files with no prior version:
`src/app/api/auth/profile/route.ts`, `src/components/layout/UserInfoModal.tsx`.

To revert this round:
```bash
cp design-backup/4-user-info/src/components/layout/UserMenu.tsx src/components/layout/UserMenu.tsx
cp design-backup/4-user-info/src/components/settings/AppearancePanel.tsx src/components/settings/AppearancePanel.tsx
cp design-backup/4-user-info/src/lib/auth-types.ts src/lib/auth-types.ts
cp design-backup/4-user-info/src/lib/auth-service.ts src/lib/auth-service.ts
rm -r src/app/api/auth/profile src/components/layout/UserInfoModal.tsx
```

Note: ADMIN-role display of "Dự án có quyền xem thông tin" was verified by code (matches
`resolveAccessScope`'s query exactly) but not visually — only a SUPERADMIN test account was
available this session, and that section is deliberately hidden for SUPERADMIN.
