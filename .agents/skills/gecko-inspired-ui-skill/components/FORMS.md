# Form Components

## Structure

```html
<div class="ui-field">
  <label class="ui-label">Name</label>
  <input class="ui-input" />
  <div class="ui-helper">Helper text</div>
</div>
```

## Classes

- `.ui-field`
- `.ui-label`
- `.ui-required`
- `.ui-input`
- `.ui-textarea`
- `.ui-select`
- `.ui-checkbox`
- `.ui-radio`
- `.ui-switch`
- `.ui-helper`
- `.ui-error`

## Input states

Use:
- normal
- hover
- focus
- disabled
- invalid

## Form sections

Use:
- `.ui-form`
- `.ui-form-section`
- `.ui-form-grid`
- `.ui-form-actions`

Default:
single-column.

Use two columns only when fields are short and closely related.

## Search

Use `.ui-search`.

Search can sit in table toolbars and list headers.

## Validation

Show validation near the field.

Do not rely on toast notifications for field-level errors.
