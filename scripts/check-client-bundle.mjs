// After `pnpm build`: fail if a server-only secret NAME appears in any client bundle under .next/static.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

export const FORBIDDEN = ["LESSON_REMINDER_DB_URL", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "lesson_reminder_sender", "DRILLDOWN_DB_URL", "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY", "service_role", "GEMINI_API_KEY", "drilldown_server"];

export function scan(dir) {
  const hits = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else { const s = readFileSync(p, "utf8"); for (const w of FORBIDDEN) if (s.includes(w)) hits.push(`${p}: ${w}`); }
    }
  };
  walk(dir);
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = ".next/static";
  if (!existsSync(dir)) { console.error("no .next/static: run pnpm build first"); process.exit(2); }
  const hits = scan(dir);
  if (hits.length) { console.error(hits.join("\n")); process.exit(1); }
  console.log(`client bundle scan: OK (${FORBIDDEN.length} names absent from ${dir})`);
}
