# Gecko-inspired Web App UI Skill

## Mission

Build consistent business web applications using the design system in this package.

The style should feel:

- data-first
- modern
- compact
- calm
- professional
- high-contrast
- easy to scan
- dashboard-friendly

Do not copy Geckoboard or any third-party product pixel-for-pixel.

---

# 1. Mandatory workflow

Before coding a page:

1. Identify the page type.
2. Read the matching file in `patterns/`.
3. Select reusable components from `components/`.
4. Use only tokens and classes from `css/` where possible.
5. Add new CSS only if the design system cannot represent the requirement.
6. If new CSS is required, use existing tokens.
7. Preserve responsive behavior and accessibility.

---

# 2. Page-type router

## Dashboard / monitoring / analytics
Read:
- `patterns/DASHBOARD_PATTERNS.md`
- `components/DASHBOARD.md`
- `components/LAYOUT.md`

## List / CRUD / task management
Read:
- `patterns/LIST_AND_CRUD_PATTERNS.md`
- `components/DATA_TABLES.md`
- `components/ACTIONS.md`

## Create / edit / workflow form
Read:
- `patterns/FORM_PATTERNS.md`
- `components/FORMS.md`

## Detail / object inspector
Read:
- `patterns/DETAIL_PATTERNS.md`
- `components/LAYOUT.md`
- `components/OVERLAYS.md`

## Settings / administration
Read:
- `patterns/SETTINGS_AND_ADMIN.md`
- `components/FORMS.md`
- `components/NAVIGATION.md`

---

# 3. Visual rules

## Surfaces

Use:
- `--surface-app`
- `--surface-sidebar`
- `--surface-panel`
- `--surface-elevated`
- `--surface-hover`

Never introduce arbitrary background colors.

## Borders

Prefer subtle borders and surface separation.

Avoid:
- heavy box shadows
- excessive gradients
- glowing panels
- glassmorphism unless explicitly requested

## Typography

Primary KPI values may be large.

Normal application content should remain compact.

Do not use oversized marketing-style headings inside business workflows.

## Radius

Use moderate radius.

- small controls: 6px
- cards: 8px
- large containers: 12px
- pills: 999px

Avoid excessive bubble-style UI.

## Color

Accent color:
- primary action
- selection
- focus
- primary data series

Semantic colors:
- success
- warning
- danger
- info

Never use semantic colors decoratively.

---

# 4. Dashboard decisions

Use `MetricCard` for one important metric.

Use `MetricCard + Sparkline` for metric plus short history.

Use line charts for time series.

Use bar charts for comparisons.

Use stacked bars for composition.

Use tables when exact row-level values matter.

Avoid pie charts unless explicitly required.

Avoid decorative charts.

Every chart must answer a clear question.

---

# 5. Forms

Use a single-column form by default.

Use two columns only for short, tightly related fields.

For long edit workflows:
prefer a drawer or full page rather than a cramped modal.

Use modal for:
- confirmation
- short create actions
- focused decisions

Use drawer for:
- object editing
- object inspection
- medium forms

Use full page for:
- complex workflow
- wizard
- large configuration

---

# 6. Tables

Alignment:
- text: left
- status: left
- dates: left
- numbers: right
- currency: right
- actions: right
- checkbox: center

Tables should support:
- sticky header when useful
- row hover
- clear empty state
- sorting
- filtering
- pagination
- optional bulk actions

Do not center-align normal body text.

---

# 7. Status

Preferred status treatment:
`● Status label`

Use filled badges only when stronger emphasis is needed.

Do not fill every status with bright colors.

---

# 8. Hierarchy contract

Every page must have a clear hierarchy:

Level 1:
page title or primary KPI

Level 2:
major sections or charts

Level 3:
cards and grouped data

Level 4:
labels, metadata, helper text

Never make all visual elements look equally important.

---

# 9. Responsive contract

Desktop:
12-column grid

Tablet:
6-column grid

Mobile:
1-column layout

All content must remain usable at 320px width.

Tables may horizontally scroll when necessary.

---

# 10. Implementation rule

When possible, use semantic HTML.

Use:
- `button`
- `nav`
- `main`
- `section`
- `table`
- `label`
- `input`
- `dialog`

Avoid meaningless div-only markup.

---

# 11. Accessibility

Read `rules/ACCESSIBILITY.md`.

At minimum:
- keyboard navigation
- visible focus
- accessible labels
- sufficient contrast
- no color-only meaning
- reduced-motion support
