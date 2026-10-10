// @ts-check
// Pure name logic for signup, /account and the header (TSK-010). Plain ESM + JSDoc
// so Node's test runner imports it directly; `// @ts-check` + allowJs type-check it.
//
// Names are user-editable Supabase user_metadata: display only, never used for
// authorization. React escapes them on output.

export const NAME_MAX = 50;

/** Control characters (C0, DEL, C1) and bidi embedding/override/isolate controls. */
const FORBIDDEN = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;

export const NAME_MESSAGES = Object.freeze({
  first_name: Object.freeze({
    missing: "Enter your first name.",
    tooLong: `First name can be at most ${NAME_MAX} characters.`,
    invalid: "First name contains characters that aren't allowed.",
  }),
  last_name: Object.freeze({
    missing: "Enter your last name.",
    tooLong: `Last name can be at most ${NAME_MAX} characters.`,
    invalid: "Last name contains characters that aren't allowed.",
  }),
});

/** @typedef {"first_name" | "last_name"} NameField */
/** @typedef {{ ok: true, value: string } | { ok: false, error: string }} NameResult */

/**
 * Validate one name: trimmed, NFC-normalised, 1-50 characters (code points), no control
 * characters. Any script is allowed (José, Zoë, 李, Ngũgĩ, O'Brien, Jean-Luc).
 * @param {unknown} raw
 * @param {NameField} field
 * @returns {NameResult}
 */
export function validateName(raw, field) {
  const msg = NAME_MESSAGES[field];
  if (typeof raw !== "string") return { ok: false, error: msg.missing };
  // Trim first (edge whitespace such as a pasted tab/newline is dropped), then reject
  // any control character left inside the name.
  const value = raw.normalize("NFC").trim();
  if (value === "") return { ok: false, error: msg.missing };
  if (FORBIDDEN.test(value)) return { ok: false, error: msg.invalid };
  if ([...value].length > NAME_MAX) return { ok: false, error: msg.tooLong };
  return { ok: true, value };
}

/**
 * Validate both names (form values). Returns the cleaned pair or per-field errors.
 * @param {unknown} first
 * @param {unknown} last
 * @returns {{ ok: true, data: { first_name: string, last_name: string } } | { ok: false, errors: Partial<Record<NameField, string>> }}
 */
export function validateNames(first, last) {
  const f = validateName(first, "first_name");
  const l = validateName(last, "last_name");
  if (f.ok && l.ok) return { ok: true, data: { first_name: f.value, last_name: l.value } };
  /** @type {Partial<Record<NameField, string>>} */
  const errors = {};
  if (!f.ok) errors.first_name = f.error;
  if (!l.ok) errors.last_name = l.error;
  return { ok: false, errors };
}

/**
 * Read the names from user_metadata defensively: anything that wouldn't pass validation
 * (missing, non-string, empty, too long, control chars) is treated as unset.
 * @param {unknown} meta
 * @returns {{ firstName: string | null, lastName: string | null }}
 */
export function namesFromMetadata(meta) {
  const m = meta && typeof meta === "object" ? /** @type {Record<string, unknown>} */ (meta) : {};
  const f = validateName(m.first_name, "first_name");
  const l = validateName(m.last_name, "last_name");
  return { firstName: f.ok ? f.value : null, lastName: l.ok ? l.value : null };
}

/**
 * What the header shows: the first name if set, otherwise the email.
 * @param {{ firstName: string | null, email: string }} input
 * @returns {{ label: string, isName: boolean }}
 */
export function headerDisplay({ firstName, email }) {
  return firstName ? { label: firstName, isName: true } : { label: email, isName: false };
}
