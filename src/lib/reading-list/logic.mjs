// @ts-check
// Reading list (TSK-017). Pure: validation, statuses, the completed_at rule, safe links,
// and missing-table detection. The server actions and the page build on this; it is unit-tested.

export const READING_LIST_TABLE = "reading_list_items";
export const TITLE_MAX = 300;
export const URL_MAX = 2048;

/** @typedef {"book" | "article" | "poem" | "essay" | "video" | "other"} Kind */
/** @typedef {"to_read" | "in_progress" | "completed"} Status */

/** @type {ReadonlyArray<{ value: Kind, label: string }>} */
export const KINDS = Object.freeze([
  { value: "book", label: "Book" },
  { value: "article", label: "Article" },
  { value: "poem", label: "Poem" },
  { value: "essay", label: "Essay" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
]);

/** @type {ReadonlyArray<{ value: Status, label: string, moveLabel: string }>} */
export const STATUSES = Object.freeze([
  { value: "to_read", label: "To Read", moveLabel: "Move to To Read" },
  { value: "in_progress", label: "In Progress", moveLabel: "Start reading" },
  { value: "completed", label: "Completed", moveLabel: "Mark completed" },
]);

export const MESSAGES = Object.freeze({
  titleRequired: "Enter a title.",
  titleTooLong: `Keep the title to ${TITLE_MAX} characters or fewer.`,
  kindInvalid: "Choose a type from the list.",
  urlInvalid: "Enter a full web address starting with http:// or https://, or leave it blank.",
  urlTooLong: `Keep the address to ${URL_MAX} characters or fewer.`,
  unavailable: "Not available yet",
  notConfigured: "The reading list isn't configured on this server.",
  signedOut: "Your session has ended. Sign in again.",
  saveFailed: "Couldn't save that change. Please try again.",
  notFound: "That item no longer exists. It may already have been removed.",
  loadFailed: "Your reading list couldn't be loaded right now. Please try again later.",
});

/** @param {unknown} v @returns {v is Kind} */
export const isKind = (v) => typeof v === "string" && KINDS.some((k) => k.value === v);
/** @param {unknown} v @returns {v is Status} */
export const isStatus = (v) => typeof v === "string" && STATUSES.some((s) => s.value === v);

/** Code points, to match Postgres char_length (an emoji is one character, not two). */
const chars = (/** @type {string} */ s) => [...s].length;

/**
 * Normalise and check an optional link. Only absolute http(s) URLs are allowed (no javascript:,
 * data:, relative or protocol-relative), matching the table's check constraint.
 * @param {unknown} raw
 * @returns {{ ok: true, value: string | null } | { ok: false, error: string }}
 */
export function validateUrl(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { ok: true, value: null };
  if (chars(s) > URL_MAX) return { ok: false, error: MESSAGES.urlTooLong };
  if (!/^https?:\/\//i.test(s)) return { ok: false, error: MESSAGES.urlInvalid };
  let parsed;
  try {
    parsed = new URL(s);
  } catch {
    return { ok: false, error: MESSAGES.urlInvalid };
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
    return { ok: false, error: MESSAGES.urlInvalid };
  }
  return { ok: true, value: s };
}

/**
 * Validate the add-item form on the server. Never reads a user id: ownership comes from the session.
 * @param {{ title?: unknown, kind?: unknown, url?: unknown }} input
 * @returns {{ ok: true, value: { title: string, kind: Kind, url: string | null } }
 *   | { ok: false, errors: { title?: string, kind?: string, url?: string } }}
 */
export function validateNewItem(input) {
  /** @type {{ title?: string, kind?: string, url?: string }} */
  const errors = {};
  // Collapse internal whitespace runs (incl. newlines) so titles render on one line.
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  if (!title) errors.title = MESSAGES.titleRequired;
  else if (chars(title) > TITLE_MAX) errors.title = MESSAGES.titleTooLong;
  const kind = input.kind;
  if (!isKind(kind)) errors.kind = MESSAGES.kindInvalid;
  const url = validateUrl(input.url);
  if (!url.ok) errors.url = url.error;
  if (Object.keys(errors).length || !isKind(kind) || !url.ok) return { ok: false, errors };
  return { ok: true, value: { title, kind, url: url.value } };
}

/**
 * A row id from a form field: a positive safe integer, as a string for the bigint column.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function parseItemId(raw) {
  if (typeof raw !== "string" || !/^[1-9][0-9]{0,15}$/.test(raw)) return null;
  return Number.isSafeInteger(Number(raw)) ? raw : null;
}

/**
 * Statuses an item can move to: any other status (lists are informal, so going back is allowed).
 * @param {Status} from
 * @returns {Status[]}
 */
export function moveTargets(from) {
  return STATUSES.map((s) => s.value).filter((s) => s !== from);
}

/**
 * The completed_at rule, as enforced by the reading_list_items_touch trigger (this mirror is
 * for tests and documentation; the app never sends completed_at).
 * @param {{ status: Status, completed_at: string | null } | null} prev null on insert
 * @param {Status} next
 * @param {string} nowIso
 * @returns {string | null}
 */
export function completedAtAfter(prev, next, nowIso) {
  if (next !== "completed") return null;
  if (prev && prev.status === "completed" && prev.completed_at) return prev.completed_at;
  return nowIso;
}

/**
 * An href that is safe to render, or null (then the title is shown as plain text).
 * Re-checked at render time even though the database constraint already applies.
 * @param {unknown} url
 */
export function safeHref(url) {
  const r = validateUrl(url);
  return r.ok && r.value ? r.value : null;
}


/**
 * @typedef {{ id: string, title: string, kind: Kind, url: string | null, status: Status,
 *   created_at: string, completed_at: string | null }} Item
 */

/**
 * Keep well-formed rows only and group them by status. To Read / In Progress oldest first
 * (a queue); Completed newest first.
 * @param {unknown[]} rows
 * @returns {Record<Status, Item[]>}
 */
export function groupItems(rows) {
  /** @type {Record<Status, Item[]>} */
  const out = { to_read: [], in_progress: [], completed: [] };
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const o = /** @type {Record<string, unknown>} */ (r);
    const id = typeof o.id === "number" || typeof o.id === "string" ? String(o.id) : null;
    if (!id || typeof o.title !== "string" || !isKind(o.kind) || !isStatus(o.status) || typeof o.created_at !== "string") continue;
    out[o.status].push({
      id,
      title: o.title,
      kind: o.kind,
      url: typeof o.url === "string" ? o.url : null,
      status: o.status,
      created_at: o.created_at,
      completed_at: typeof o.completed_at === "string" ? o.completed_at : null,
    });
  }
  const t = (/** @type {string | null} */ s) => (s ? Date.parse(s) || 0 : 0);
  // Ties break on id, so the result never depends on the order rows arrived in.
  const byId = (/** @type {Item} */ a, /** @type {Item} */ b) => Number(a.id) - Number(b.id);
  const oldest = (/** @type {Item} */ a, /** @type {Item} */ b) => t(a.created_at) - t(b.created_at) || byId(a, b);
  out.to_read.sort(oldest);
  out.in_progress.sort(oldest);
  out.completed.sort((a, b) => t(b.completed_at ?? b.created_at) - t(a.completed_at ?? a.created_at) || byId(b, a));
  return out;
}

/** @param {Kind} kind */
export const kindLabel = (kind) => KINDS.find((k) => k.value === kind)?.label ?? "Other";
