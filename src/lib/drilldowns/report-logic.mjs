// @ts-check
// Report a generated lesson (pure validation + messages). The insert runs with the user's session; user_id defaults to
// auth.uid() and RLS only allows reporting a lesson the user can see. No select after the insert (column grants).
import { GENERATED_LESSON_ID_PATTERN } from "./validate.mjs";

export const REPORT_MESSAGES = Object.freeze({
  done: "Thanks. We'll review this lesson.",
  duplicate: "You've already reported this lesson. Thanks.",
  invalid: "Tell us briefly what's wrong (up to 500 characters).",
  signedOut: "Sign in to report a lesson.",
  failed: "We couldn't send your report. Please try again.",
  disabled: "Reporting isn't available yet.",
});

/** @param {unknown} lessonId @param {unknown} reason */
export function validateReport(lessonId, reason) {
  if (typeof lessonId !== "string" || !GENERATED_LESSON_ID_PATTERN.test(lessonId)) return null;
  if (typeof reason !== "string") return null;
  const r = reason.trim();
  if (r.length < 1 || r.length > 500) return null;
  return { lesson_id: lessonId, reason: r };
}

/** @param {{ code?: string | null } | null | undefined} error */
export function reportErrorMessage(error) {
  if (!error) return REPORT_MESSAGES.done;
  if (error.code === "23505") return REPORT_MESSAGES.duplicate;
  return REPORT_MESSAGES.failed;
}
