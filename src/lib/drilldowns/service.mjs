// @ts-check
// Dig deeper request handler (P3), framework-free so unit tests drive it with mocks. The route wires the real deps.
// Order: flag -> session (user_id ONLY from verified claims) -> stored-choice gate (exactly { lessonId, choiceId };
// a client-sent user id is rejected) -> reserve the lesson -> grounded generation (each model call first passes the
// per-minute limiter and reserves one call) -> fact-check outcome -> save via drilldown_save_lesson().
import { checkDigDeeperRequest } from "./gate.mjs";
import { DRILLDOWN_CAPS } from "./config.mjs";
import { dbErrorCode, failure } from "./messages.mjs";
import { lessonHasFetchableSource } from "./sources.mjs";

/** Error thrown from onBeforeCall; generate.mjs turns any error with stopKind into report.stopError. */
export class StopError extends Error {
  /** @param {string} stopKind */
  constructor(stopKind) { super(`stopped: ${stopKind}`); this.stopKind = stopKind; }
}

/**
 * In-process sliding-window limiter (DRILLDOWN_CAPS.globalCallsPerMinute). Per server instance only; the DB caps are the
 * real global limits.
 * @param {number} [max] @param {() => number} [now]
 */
export function createMinuteLimiter(max = DRILLDOWN_CAPS.globalCallsPerMinute, now = Date.now) {
  /** @type {number[]} */
  const hits = [];
  return {
    take() {
      const t = now();
      while (hits.length && t - hits[0] >= 60_000) hits.shift();
      if (hits.length >= max) return false;
      hits.push(t);
      return true;
    },
  };
}

/** Set once a billing signal is seen; this instance then refuses all generation until redeployed. */
export const billingState = { stopped: false };

/** Split a validated generated lesson into the public body (no answers, REV-007) and the server-only key. @param {any} g */
export function splitLesson(g) {
  const lesson = {
    slug: g.slug, title: g.title, sections: g.sections, keyFacts: g.keyFacts,
    quiz: g.quiz.map((/** @type {any} */ q) => ({ question: q.question, options: [...q.options] })),
  };
  return {
    lesson,
    answers: g.quiz.map((/** @type {any} */ q) => q.answerIndex),
    explanations: g.quiz.map((/** @type {any} */ q) => String(q.explanation ?? "")),
  };
}

/** @param {ReadonlyArray<any>} disciplines @param {string} lessonId */
function findLesson(disciplines, lessonId) {
  for (const d of disciplines) for (const t of d.topics ?? []) for (const l of t.lessons ?? []) if (l.id === lessonId) return l;
  return null;
}

/**
 * One-line, secret-free summary of which step decided the outcome: per-URL fetch results, model calls, and the
 * unconfirmed fact-check refs per attempt. URLs are public curated sources; no lesson text, keys or user data.
 * @param {any} report
 */
export function describeReport(report) {
  const res = report?.sourceFetch?.results ?? [];
  const fetch = res.map((/** @type {any} */ r) => `${r.blocked ? "blocked" : r.problems?.length ? `fail(${r.problems.join("; ").slice(0, 80)})` : `ok ${r.status} ${r.chars}c`} ${r.url}`).join(", ");
  const attempts = (report?.attempts ?? []).map((/** @type {any} */ a, /** @type {number} */ i) =>
    `#${i + 1}: schema ${a.schemaProblems?.length ?? 0}, source ${a.sourceProblems?.length ?? 0}, content ${a.contentProblems?.length ?? 0}, unconfirmed [${(a.factCheck?.unconfirmed ?? []).join(",")}] -> ${a.outcome}`).join("; ");
  return `step=${report?.attempts?.length ? "generate/factcheck" : "source_fetch"} calls=${report?.calls?.length ?? 0} fetch=[${fetch}]${attempts ? ` attempts=[${attempts}]` : ""}`;
}

/**
 * Per-claim fact-check results of the last attempt, trimmed to the stored shape [{ref, supported, note?}] (max 12).
 * @param {any} report
 */
export function factCheckItems(report) {
  const at = report?.attempts?.[report.attempts.length - 1];
  const items = Array.isArray(at?.factCheck?.items) ? at.factCheck.items : [];
  return items.slice(0, 12).filter((/** @type {any} */ i) => i && typeof i.ref === "string").map((/** @type {any} */ i) => ({
    ref: i.ref.slice(0, 20), supported: Boolean(i.supported), ...(typeof i.note === "string" && i.note ? { note: i.note.slice(0, 300) } : {}),
  }));
}

/** pending (0 unconfirmed) / flagged (exactly 1) / rejected (2+ after the regenerate budget, or nothing usable). @param {any} report */
export function reviewStatusOf(report) {
  if (!report.generated || !String(report.verdict).startsWith("passed")) return "rejected";
  return report.flag ? "flagged" : "pending";
}

/**
 * @param {{
 *   enabled: boolean,
 *   body: unknown,
 *   disciplines: ReadonlyArray<any>,
 *   getUserId: () => Promise<string | null>,
 *   getCompletionRows: (lessonId: string) => Promise<ReadonlyArray<{ lesson_id?: unknown }>>,
 *   db: { reserve: (userId: string, calls: number, newLesson: boolean) => Promise<void>, releaseLesson?: (userId: string) => Promise<void>, saveLesson: (p: any) => Promise<void>,
 *     saveFactCheck?: (userId: string, id: string, items: unknown) => Promise<void> },
 *   generate: (a: { lessonId: string, choiceId: string, onBeforeCall: () => Promise<void> }) => Promise<any>,
 *   limiter: { take: () => boolean },
 *   billing?: { stopped: boolean },
 *   promptVersion: string,
 *   log?: (m: string) => void,
 * }} deps
 * @returns {Promise<{ status: number, body: any }>}
 */
export async function handleDigDeeper(deps) {
  const { enabled, body, disciplines, getUserId, getCompletionRows, db, generate, limiter, billing = billingState, promptVersion, log = () => {} } = deps;
  if (!enabled) return failure("disabled");
  const userId = await getUserId();
  if (!userId) return failure("signed_out");
  const lessonId = body && typeof body === "object" && typeof (/** @type {any} */ (body).lessonId) === "string" ? /** @type {any} */ (body).lessonId : "";
  const rows = lessonId ? await getCompletionRows(lessonId) : [];
  const gate = checkDigDeeperRequest(disciplines, body, rows);
  if (!gate.ok) return failure(gate.reason === "not_completed" ? "not_completed" : "bad_request");
  if (billing.stopped) return failure("billing_stop");
  // Refuse before reserving: a lesson with only blocked sources can never pass the fetch step (and must not use up a daily lesson).
  if (!lessonHasFetchableSource(findLesson(disciplines, gate.lessonId))) {
    log(`drilldown ${gate.lessonId}/${gate.choice.id}: refused, no fetchable curated source (all blocked)`);
    return failure("no_sources");
  }

  try { await db.reserve(userId, 0, true); } catch (e) { return failure(dbErrorCode(e)); }

  // From here on, an attempt that ends without a kept (pending/flagged) lesson gives its lesson slot back: failures,
  // refusals, provider errors, timeouts and exceptions don't count toward the daily lesson cap. Calls stay counted.
  let kept = false;
  try {
    const onBeforeCall = async () => {
      if (!limiter.take()) throw new StopError("per_minute");
      try { await db.reserve(userId, 1, false); } catch (e) { throw new StopError(dbErrorCode(e)); }
    };
    const report = await generate({ lessonId: gate.lessonId, choiceId: gate.choice.id, onBeforeCall });
    log(`drilldown ${gate.lessonId}/${gate.choice.id}: ${report.verdict}${report.stoppedOn ? ` (${report.stoppedOn})` : ""}`);
    log(`drilldown ${gate.lessonId}/${gate.choice.id}: ${describeReport(report)}`);
    if (report.billingStop) { billing.stopped = true; return failure("billing_stop"); }
    const status = reviewStatusOf(report);
    const save = async (/** @type {"pending" | "flagged" | "rejected"} */ reviewStatus) => {
      const { lesson, answers, explanations } = splitLesson(report.generated);
      await db.saveLesson({
        userId, id: report.generated.id, parentLessonId: gate.lessonId, choiceId: gate.choice.id, promptVersion,
        model: report.model, reviewStatus, lesson, sources: report.generated.sources, citations: report.citations ?? {},
        unconfirmedClaims: reviewStatus === "flagged" ? [report.flag] : [], answers, explanations,
      });
      // P4: per-claim results for Mike's review screen. Best effort: the lesson is already saved, and before the P4
      // migration (20261104214500) is applied the function doesn't exist; the review screen then shows only the flag.
      const items = factCheckItems(report);
      if (db.saveFactCheck && items.length) {
        try { await db.saveFactCheck(userId, report.generated.id, items); } catch { log(`drilldown ${report.generated.id}: fact check not stored`); }
      }
    };
    if (status === "rejected") {
      if (report.stopError instanceof StopError) return failure(/** @type {any} */ (report.stopError).stopKind);
      if (/^(quota|provider unavailable)/.test(String(report.stoppedOn ?? ""))) return failure("provider_busy");
      // Keep a validated but rejected lesson for Mike's review (never shown to anyone); its failure doesn't change the answer.
      if (report.generated) { try { await save("rejected"); } catch { /* ignored */ } }
      return failure("generation_failed");
    }
    try { await save(status); } catch (e) { return failure(dbErrorCode(e)); }
    kept = true;
    return { status: 200, body: { ok: true, lessonId: report.generated.id, reviewStatus: status } };
  } finally {
    if (!kept && db.releaseLesson) {
      try { await db.releaseLesson(userId); } catch { log(`drilldown ${gate.lessonId}/${gate.choice.id}: lesson slot not released`); }
    }
  }
}
