# Well-Read

Personal web app (repository: github.com/mvaldes7/Well-Read; production: https://well-read-learn.vercel.app). Scope and status live in `docs/` and `tasks/`.

## Feature flag: Dig deeper (`WELL_READ_DRILLDOWNS`)

AI-generated Dig deeper lessons are off unless `WELL_READ_DRILLDOWNS` is exactly `1`. **The flag is read at build
time** by the statically prerendered lesson pages (that's where the Dig deeper choices render), so changing it needs a
**rebuild / redeploy**. `/api/drilldowns` and `/dig` also check it at request time, so turning it off takes effect there
immediately, but the choices only disappear from lesson pages after a redeploy. Enabling also needs the P2 migration,
a `drilldown_server` password and the server-only `GEMINI_API_KEY` and `DRILLDOWN_DB_URL`; see
`docs/plans/topic-drilldowns.md` (P3).
