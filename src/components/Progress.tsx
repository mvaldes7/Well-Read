import { getDiscipline } from "@/content";
import { getMyProgress } from "@/lib/progress/data";
import { NOT_STARTED, masteryFor, nextTierText, passedInDiscipline } from "@/lib/progress/mastery.mjs";

// Per-user completion UI. Each reads the session, so render inside <Suspense>.

/** Small marker for a lesson in a list. Renders nothing unless passed. */
export async function LessonMarker({ lessonId }: { lessonId: string }) {
  const progress = await getMyProgress();
  if (progress.status !== "ok" || !progress.lookup.get(lessonId)?.passed) return null;
  return (
    <span className="completed-marker" role="img" aria-label="Completed" title="Completed">
      <span aria-hidden="true">✓ Completed</span>
    </span>
  );
}

/** Status line above a lesson's quiz: completed with best score, or best attempt so far. */
export async function LessonStatus({ lessonId }: { lessonId: string }) {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p className="status muted">Your progress for this lesson couldn&apos;t be loaded.</p>;
  if (progress.status !== "ok") return null;
  const best = progress.lookup.get(lessonId);
  if (!best) return null;
  return best.passed ? (
    <p className="status completed-status">
      <span aria-hidden="true">✓ </span>Completed – best {best.score}/{best.total}. You can retake the quiz any time.
    </p>
  ) : (
    <p className="status muted">
      Best attempt so far: {best.score}/{best.total} (not yet passed – you need 70%).
    </p>
  );
}

/** The topic's discipline mastery tier + progress to the next tier (TSK-019). */
export async function DisciplineMastery({ disciplineSlug }: { disciplineSlug: string }) {
  const discipline = getDiscipline(disciplineSlug);
  const progress = await getMyProgress();
  if (!discipline || progress.status === "signedOut") return null;
  if (progress.status === "error") return <p className="topic-mastery muted">Your mastery for this discipline couldn&apos;t be loaded.</p>;
  const info = masteryFor(passedInDiscipline(discipline, progress.lookup));
  const n = info.passed;
  const hint = nextTierText(info);
  return (
    <div className={`topic-mastery cover-${discipline.color}`}>
      <span className={`tier-badge${info.tier === null ? " none" : ""}`}>{info.tier ?? NOT_STARTED}</span>
      <span className="mastery-count">
        {n} {n === 1 ? "lesson" : "lessons"} in {discipline.title}
      </span>
      <div className="tier-progress">
        {info.next && <progress value={info.toward} max={info.needed} aria-label={hint} />}
        <span className="tier-text">{hint}</span>
      </div>
    </div>
  );
}
