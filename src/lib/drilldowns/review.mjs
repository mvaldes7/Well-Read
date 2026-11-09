// @ts-check
// P4 owner review (Mike only), framework-free so unit tests drive it with mocks. The route/page wire the real deps.
// Owner identity: the user id from the caller's verified session (getClaims), checked INSIDE the DB by the owner-only
// SECURITY DEFINER functions against public.drilldown_owner (draft migration 20261104214500). There is no env or
// client-side owner check to trust; WR403 from the DB = not the owner. Non-owners get 404 so the screen's existence
// isn't revealed. Flag off = 404.

export const REVIEW_ACTIONS = Object.freeze(["publish", "reject", "unpublish", "clear_report"]);
/** @type {ReadonlyArray<"all" | "pending" | "flagged" | "reported">} */
export const REVIEW_FILTERS = Object.freeze(["all", "pending", "flagged", "reported"]);
const ID = /^gen_[a-z0-9]{8,16}$/;

/** @param {unknown} v @returns {"all" | "pending" | "flagged" | "reported"} */
export function parseFilter(v) {
  return /** @type {any} */ (REVIEW_FILTERS.includes(/** @type {any} */ (v)) ? v : "all");
}

/**
 * pending = 0 unconfirmed; flagged = exactly 1 unconfirmed claim; reported = at least one open user report (any status).
 * @param {ReadonlyArray<any>} rows @param {"all" | "pending" | "flagged" | "reported"} filter
 */
export function filterQueue(rows, filter) {
  const reported = (/** @type {any} */ r) => Array.isArray(r.open_reports) && r.open_reports.length > 0;
  if (filter === "pending") return rows.filter((r) => r.review_status === "pending");
  if (filter === "flagged") return rows.filter((r) => r.review_status === "flagged" && Array.isArray(r.unconfirmed_claims) && r.unconfirmed_claims.length === 1);
  if (filter === "reported") return rows.filter(reported);
  return [...rows];
}

/** @param {ReadonlyArray<any>} rows */
export function queueCounts(rows) {
  return Object.fromEntries(REVIEW_FILTERS.map((f) => [f, filterQueue(rows, f).length]));
}

/** Which actions make sense for a row (the DB enforces the same rules). @param {any} row */
export function actionsFor(row) {
  const a = [];
  if (row.review_status === "pending" || row.review_status === "flagged") a.push("publish", "reject");
  if (row.review_status === "published") a.push("unpublish");
  if (Array.isArray(row.open_reports) && row.open_reports.length) a.push("clear_report");
  return a;
}

/** @param {unknown} e */
const code = (e) => String(/** @type {any} */ (e)?.code ?? "");

const reply = (/** @type {number} */ status, /** @type {any} */ body) => ({ status, body });
const NOT_FOUND = reply(404, { ok: false, code: "not_found" });

/**
 * Load the queue for the page. "hidden" -> the page renders notFound().
 * @param {{ enabled: boolean, configured: boolean, getUserId: () => Promise<string | null>, db: { reviewQueue: (ownerId: string) => Promise<any[]> } }} deps
 * @returns {Promise<{ status: "hidden" | "unavailable" } | { status: "ok", rows: any[] }>}
 */
export async function loadReviewQueue({ enabled, configured, getUserId, db }) {
  if (!enabled) return { status: "hidden" };
  const userId = await getUserId();
  if (!userId) return { status: "hidden" }; // signed out: 404, no sign-in link (REV-019)
  if (!configured) return { status: "hidden" };
  try {
    return { status: "ok", rows: await db.reviewQueue(userId) };
  } catch (e) {
    return code(e) === "WR403" ? { status: "hidden" } : { status: "unavailable" };
  }
}

/**
 * Account-page link to /review. Same gate as the page (flag, verified session, DB owner check via reviewQueue);
 * anything but "ok" (off, signed out, not the owner, DB error) -> null, so nothing renders.
 * count = pending + flagged, using the same filters as the /review tabs.
 * @param {Parameters<typeof loadReviewQueue>[0]} deps
 * @returns {Promise<{ count: number } | null>}
 */
export async function loadReviewLink(deps) {
  const r = await loadReviewQueue(deps);
  if (r.status !== "ok") return null;
  const c = queueCounts(r.rows);
  return { count: c.pending + c.flagged };
}

/** @param {number} count */
export const reviewLinkLabel = (count) => (count > 0 ? `Review AI lessons (${count})` : "Review AI lessons");

/**
 * POST /api/drilldowns/review. Order: flag (404) -> same-origin (403) -> session (404) -> body exactly
 * { lessonId, action } (400) -> DB owner check + action (WR403 -> 404, WR404 -> 409).
 * @param {{ enabled: boolean, sameOrigin: boolean, configured: boolean, body: unknown, getUserId: () => Promise<string | null>,
 *   db: { reviewAction: (ownerId: string, lessonId: string, action: any) => Promise<string> }, log?: (m: string) => void }} deps
 */
export async function handleReviewAction({ enabled, sameOrigin, configured, body, getUserId, db, log = () => {} }) {
  if (!enabled) return NOT_FOUND;
  if (!sameOrigin) return reply(403, { ok: false, code: "forbidden" });
  const userId = await getUserId();
  if (!userId) return NOT_FOUND; // signed out: 404, same as a non-owner (REV-019)
  if (!configured) return NOT_FOUND;
  const b = /** @type {any} */ (body);
  const keys = b && typeof b === "object" && !Array.isArray(b) ? Object.keys(b).sort().join(",") : "";
  if (keys !== "action,lessonId" || typeof b.lessonId !== "string" || !ID.test(b.lessonId) || !REVIEW_ACTIONS.includes(b.action)) {
    return reply(400, { ok: false, code: "bad_request" });
  }
  try {
    const status = await db.reviewAction(userId, b.lessonId, b.action);
    log(`drilldown review ${b.lessonId}: ${b.action} -> ${status}`);
    return reply(200, { ok: true, lessonId: b.lessonId, reviewStatus: status });
  } catch (e) {
    if (code(e) === "WR403") return NOT_FOUND;
    if (code(e) === "WR404") return reply(409, { ok: false, code: "not_allowed" });
    return reply(503, { ok: false, code: "unavailable" });
  }
}
