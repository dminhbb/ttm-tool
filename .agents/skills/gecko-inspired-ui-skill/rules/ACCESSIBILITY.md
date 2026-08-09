# Accessibility Rules

## Keyboard

All interactive controls must be reachable by keyboard.

Do not remove outlines without replacing them with a visible focus style.

## Focus

Use `:focus-visible`.

Default focus ring should use `--focus-ring`.

## Labels

Every form field requires an accessible label.

Placeholder text is not a label.

## Color

Never communicate status by color only.

Use:
- icon
- text
- dot + text
- label

## Motion

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

Avoid unnecessary motion in dashboards.

## Tables

Use semantic table elements.

Use `scope="col"` on headers when practical.

## Buttons

Icon-only buttons require:
- `aria-label`
or
- accessible name from surrounding context

## Dialogs

Dialogs should:
- trap focus
- have accessible title
- restore focus when closed

## Minimum targets

Prefer at least 36px height for desktop controls.
Prefer at least 44px touch target on mobile.
