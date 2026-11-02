// @ts-check
// Server-side gate for "Dig deeper" (drill-downs P0). Pure, so the future server action and node:test share it.
// Two rules (Mike, 2026-11-02):
// 1. No open text: the request is exactly { lessonId, choiceId }, and choiceId must be one of that
//    lesson's stored digDeeper ids. Any other field (prompt, text, ...) is rejected, not ignored.
// 2. Only after the user has completed that lesson's quiz: a lesson_completions row for (user, lesson)
//    must exist. The server action reads it with the user's own session (RLS: own rows); the future
//    table's insert policy repeats the check in SQL (plan section 6), so the UI hiding the button is not the gate.

const KEYS = ["choiceId", "lessonId"];

/**
 * @param {ReadonlyArray<any>} disciplines parsed content
 * @param {string} lessonId
 */
function findLesson(disciplines, lessonId) {
  for (const d of disciplines) for (const t of d.topics) for (const l of t.lessons) if (l.id === lessonId) return { discipline: d, topic: t, lesson: l };
  return null;
}

/**
 * True when the user's own completion rows include this lesson (any graded attempt counts as completed).
 * @param {ReadonlyArray<{ lesson_id?: unknown }> | null | undefined} rows
 * @param {string} lessonId
 */
export function hasCompletedLesson(rows, lessonId) {
  return Array.isArray(rows) && rows.some((r) => r && r.lesson_id === lessonId);
}

/**
 * Validate a Dig deeper request.
 * @param {ReadonlyArray<any>} disciplines parsed content
 * @param {unknown} input raw request body / form values
 * @param {ReadonlyArray<{ lesson_id?: unknown }> | null | undefined} completionRows the signed-in user's own lesson_completions rows
 * @returns {{ ok: true, lessonId: string, choice: { id: string, label: string, kind: string }, topicSlug: string, disciplineSlug: string }
 *   | { ok: false, reason: "bad_request" | "unknown_lesson" | "no_choices" | "unknown_choice" | "not_completed" }}
 */
export function checkDigDeeperRequest(disciplines, input, completionRows) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "bad_request" };
  const keys = Object.keys(input).sort();
  if (keys.length !== KEYS.length || keys.some((k, i) => k !== KEYS[i])) return { ok: false, reason: "bad_request" };
  const { lessonId, choiceId } = /** @type {Record<string, unknown>} */ (input);
  if (typeof lessonId !== "string" || typeof choiceId !== "string") return { ok: false, reason: "bad_request" };
  const found = findLesson(disciplines, lessonId);
  if (!found) return { ok: false, reason: "unknown_lesson" };
  const choices = Array.isArray(found.lesson.digDeeper) ? found.lesson.digDeeper : [];
  if (choices.length === 0) return { ok: false, reason: "no_choices" };
  const choice = choices.find((/** @type {any} */ c) => c.id === choiceId);
  if (!choice) return { ok: false, reason: "unknown_choice" };
  if (!hasCompletedLesson(completionRows, lessonId)) return { ok: false, reason: "not_completed" };
  return { ok: true, lessonId, choice: { id: choice.id, label: choice.label, kind: choice.kind }, topicSlug: found.topic.slug, disciplineSlug: found.discipline.slug };
}
