#!/usr/bin/env node
// @ts-check
// Drill-downs P1b offline prototype (docs/plans/topic-drilldowns.md, section 9). NOT used by the app.
// Usage: GEMINI_API_KEY=... node scripts/drilldown-prototype.mjs <lessonId> <choiceId> [--model <id>] [--out <dir>] [--candidates <file.json>]
// - Grounded generation (Mike, 2026-11-02): FIRST fetches the allowed, fetchable candidate sources (blocked sites are never
//   fetched), then gives the generator only relevant excerpts of that fetched text plus the parent lesson for context, and
//   requires it to cite which fetched source supports each key fact and quiz answer. Inputs are one stored Dig deeper choice (no free text).
// - Calls the Gemini free-tier REST API with a JSON response schema. The key goes ONLY in the x-goog-api-key header.
// - Validates with the generated-lesson validator, checks sources (candidate allowlist + HTTPS fetch + title/terms),
//   runs a second-pass fact check, and writes everything to a gitignored local file (.drilldowns-out/).
// - At most DRILLDOWN_CAPS.callsPerLessonMax model calls per run; stops immediately on 429 / quota errors.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_MODEL, runPrototype } from "../src/lib/drilldowns/generate.mjs";

// The generation logic now lives in src/lib/drilldowns/generate.mjs (P3); re-exported for the prototype tests.
export * from "../src/lib/drilldowns/generate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { model: { type: "string" }, out: { type: "string" }, candidates: { type: "string" } } });
  const [lessonId, choiceId] = positionals;
  if (!lessonId || !choiceId) { console.error("usage: node scripts/drilldown-prototype.mjs <lessonId> <choiceId> [--model id] [--out dir]"); process.exit(2); }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.error("GEMINI_API_KEY is not set"); process.exit(2); }
  const disciplines = JSON.parse(readFileSync(resolve(ROOT, "src/content/disciplines.json"), "utf8"));
  const extra = values.candidates ? JSON.parse(readFileSync(resolve(values.candidates), "utf8")) : [];
  const report = await runPrototype({ disciplines, lessonId, choiceId, apiKey, model: values.model ?? DEFAULT_MODEL, log: (m) => console.error(m), extra });
  const dir = resolve(ROOT, values.out ?? ".drilldowns-out");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${lessonId}--${choiceId}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.error(`verdict: ${report.verdict}${report.stoppedOn ? ` (stopped: ${report.stoppedOn})` : ""} -> ${file}`);
  if (report.billingStop) { console.error("STOP: a billing/paid requirement was reported; do not run again"); process.exit(4); }
  if (report.stoppedOn?.startsWith("quota")) process.exit(3);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
