// Server-only names must never reach the browser. Scans .next/static when a build exists (CI runs
// `pnpm check:bundle` after `pnpm build`, which fails hard); also checks the scanner itself.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "../../scripts/check-client-bundle.mjs";

test("scanner catches a leaked name", () => {
  const d = mkdtempSync(join(tmpdir(), "bundle-"));
  writeFileSync(join(d, "a.js"), 'x=process.env.DRILLDOWN_DB_URL');
  assert.equal(scan(d).length, 1);
});

test(".next/static has no server-only env or key names", { skip: !existsSync(".next/static") && "no build" }, () => {
  assert.deepEqual(scan(".next/static"), []);
});

test("DRILLDOWN_DB_URL is read only by server-db.mjs and never as NEXT_PUBLIC_", () => {
  const s = readFileSync(new URL("../../src/lib/drilldowns/server-db.mjs", import.meta.url), "utf8");
  assert.match(s, /export const DRILLDOWN_DB_ENV = "DRILLDOWN_DB_URL"/);
  assert.doesNotMatch(s, /NEXT_PUBLIC_DRILLDOWN/);
  assert.match(s, /^import "server-only";$/m);
});

// Column-level grants (generated_lessons, lesson_reports): select() with no columns, select("*") and
// insert(...).select() fail with "permission denied". Keep them out of app code (REV-014).
test("no wildcard selects or insert().select() in src", () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(m?[jt]sx?)$/.test(f.name)) files.push(p); } };
  walk("src");
  const bad = files.filter((p) => /\.select\(\s*\)|\.select\(\s*["'`]\*["'`]\s*\)|\.insert\([^;]*?\)\s*\.select\(/s.test(readFileSync(p, "utf8")));
  assert.deepEqual(bad, []);
});
