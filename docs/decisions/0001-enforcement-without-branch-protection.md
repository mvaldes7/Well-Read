# ADR 0001: Enforcement without branch protection

- Status: Accepted
- Date: 2026-10-09
- Task: TSK-001

## Context

FoundationLearn is a private repository on a free GitHub plan. Branch protection
rules and required status checks for private repositories require GitHub Pro (or
a paid org plan), so `main` cannot be technically protected. Work is done by
several agents (Product Lead, Builder, Architect/Reviewer), all operating through
the single `mvaldes7` account. We still want limits such as "one active
implementation task" and "at most two repair attempts per failure" to hold.

## Decision

- Limits are soft-enforced by `scripts/ledger.mjs` operating on
  `tasks/ledger.json`: the CLI refuses a second active impl task, counts failures
  per key, blocks a task once a failure exceeds the repair limit, and appends an
  audit log entry for every mutation. Limits are read from the ledger file.
- CI (`.github/workflows/ci.yml`, job `checks`) runs unit tests and
  `ledger.mjs validate` on every push and pull request, so a hand-edited ledger
  that breaks schema or limits shows up as a red check.
- Process: agents work on branches and open PRs; they never push to `main` and
  never merge. Merges to `main` are done by Mike only, after reviewing the PR and
  its `checks` result.

## Consequences / Gaps

- Nothing technically prevents a direct push or merge to `main`; enforcement
  relies on agent instructions and Mike's review.
- Agents can edit `tasks/ledger.json` directly, bypassing the CLI. `validate`
  catches structural and limit violations, but not plausible-looking edits
  (e.g. deleting a failure count or log entry).
- All agents act as `mvaldes7`, so git authorship and GitHub audit logs do not
  distinguish agents; the ledger `actor` field is self-reported.
- There is no visibility into token/usage budgets; cost limits cannot be enforced
  by the ledger or CI.
- Revisit if the repo moves to GitHub Pro or an org plan: enable branch protection
  on `main` with the `checks` status required.
