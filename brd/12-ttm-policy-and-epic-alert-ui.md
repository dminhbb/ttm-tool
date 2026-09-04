# 12 — TTM Policy and Epic Alert UI

## Time to Market policy

The deadline is independent from status alert rules. A Time to Market policy has a TTM type (`TTM-CNTT` or `TTM-E2E`), Epic type (`SIMPLE` or `COMPLEX`), From TTM Field, To TTM Field, working days, and active state. A type/Epic-type pair is unique. The active policy supplies the deadline: `From TTM Field + working days`. Table: `ttm_policy_configs` (see `08-data-model.md` §11).

Status alert rules retain only early and late alert offsets. They do not store a Fail TTM-CNTT offset (the `fail_offset_days` column was dropped — the deadline comes exclusively from `ttm_policy_configs` now). Deleting either a status rule or policy requires a one-step confirmation.

## Epic Alerts TTM-CNTT cell

The first strip is the configured baseline from From TTM Field to the calculated target. The second strip is actual elapsed time from the same From TTM Field to Today. The API compliance engine, Epic Alerts and Epic Monitoring must use the same active policy.

Completed stage cells use a light-green background with a checkmark + completion label (`doneStageCell` in `epic-alert-service.ts` renders `✓ Hoàn thành`/`✓ <ngày>`), not literal text `Pass`.

## Fail TTM-E2E (separate from the TTM-CNTT cell above)

TTM-E2E now has its own independent FAIL/NONE alert (no early/late tiers), computed by `resolveTtmE2eRelease` in `src/lib/epic-alert-service.ts` from T0 (Idea Approved Date, falling back to the Epic's Jira creation date) to Due Date/today, against the active `TTM_E2E` policy. Shown as a separate "Fail TTM-E2E" badge next to the TTM-CNTT badge on every Epic Alerts screen, with its own filter option. See `13-epic-15-and-epic-30-management.md` and `03-mvp1-working-days-alert-rules.md` §4.5 for how it interacts with `hasDataAnomaly`.
