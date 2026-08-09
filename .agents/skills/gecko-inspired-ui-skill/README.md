# Gecko-inspired UI Skill Pack

A reusable design-system package for AI coding agents such as Claude Code, Codex, Cursor, and similar tools.

The goal is to create modern business web applications with a clean, high-contrast, data-first visual language inspired by dashboard products such as Geckoboard, without cloning any product pixel-for-pixel.

## Package structure

```text
gecko-inspired-ui-skill/
├── SKILL.md
├── README.md
├── rules/
│   ├── DESIGN_PRINCIPLES.md
│   ├── ACCESSIBILITY.md
│   ├── CONTENT_AND_DENSITY.md
│   └── AI_DECISION_RULES.md
├── components/
│   ├── FOUNDATION.md
│   ├── NAVIGATION.md
│   ├── ACTIONS.md
│   ├── FORMS.md
│   ├── DATA_TABLES.md
│   ├── DASHBOARD.md
│   ├── FEEDBACK.md
│   ├── OVERLAYS.md
│   └── LAYOUT.md
├── patterns/
│   ├── DASHBOARD_PATTERNS.md
│   ├── LIST_AND_CRUD_PATTERNS.md
│   ├── FORM_PATTERNS.md
│   ├── DETAIL_PATTERNS.md
│   └── SETTINGS_AND_ADMIN.md
├── css/
│   ├── tokens.css
│   ├── reset.css
│   ├── typography.css
│   ├── layout.css
│   ├── components.css
│   ├── forms.css
│   ├── tables.css
│   ├── dashboard.css
│   ├── charts.css
│   ├── utilities.css
│   └── app.css
└── examples/
    ├── dashboard.html
    ├── crud-list.html
    ├── form.html
    └── detail.html
```

## Recommended AI-agent instruction

Paste this into your coding agent:

```text
Before implementing UI, read ./gecko-inspired-ui-skill/SKILL.md.

Follow the design tokens and CSS classes in ./gecko-inspired-ui-skill/css/.

Reuse documented components and page patterns.
Do not invent a new visual style if an existing component can express the requirement.
Do not clone Geckoboard or any other product pixel-for-pixel.
```

## Integration

Import only `css/app.css`:

```html
<link rel="stylesheet" href="/gecko-inspired-ui-skill/css/app.css">
```

Or:

```css
@import "./gecko-inspired-ui-skill/css/app.css";
```

## Principles

- Data first.
- Fast visual scanning.
- High contrast with restrained color.
- Strong visual hierarchy.
- Compact but readable spacing.
- Prefer borders and surface contrast over heavy shadows.
- Use semantic colors only for meaning.
- Avoid decorative charting.
- Prefer consistency over novelty.

## Theme

Set:

```html
<html data-theme="dark">
```

or:

```html
<html data-theme="light">
```

Dark is the default.

## License note

This package is an original design system inspired by general dashboard UI principles. It is not affiliated with or endorsed by Geckoboard.
