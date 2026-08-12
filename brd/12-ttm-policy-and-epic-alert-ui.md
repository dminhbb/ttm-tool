# 12 — TTM Policy and Epic Alert UI

## Time to Market policy

The deadline is independent from status alert rules. A Time to Market policy has a TTM type (`TTM-CNTT` or `TTM-E2E`), Epic type (`SIMPLE` or `COMPLEX`), From TTM Field, To TTM Field, working days, and active state. A type/Epic-type pair is unique. The active policy supplies the deadline: `From TTM Field + working days`.

Status alert rules retain only early and late alert offsets. They do not store a Fail TTM-CNTT offset. Deleting either a status rule or policy requires a one-step confirmation.

## Epic Alerts TTM-CNTT cell

The first strip is the configured baseline from From TTM Field to the calculated target. The second strip is actual elapsed time from the same From TTM Field to Today. The API compliance engine, Epic Alerts and Epic Monitoring must use the same active policy.

Completed stage cells use a light-green background and the text `Pass`, replacing the completion icon.
