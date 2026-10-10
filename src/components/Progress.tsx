import { getTopic } from "@/content";
import { getMyProgress } from "@/lib/progress/data";
import { levelFor, levelProgressText, passedInTopic } from "@/lib/progress/levels.mjs";

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

/** Topic level badge + progress to the next level (AC-4). */
export async function TopicLevel({ disciplineSlug, topicSlug }: { disciplineSlug: string; topicSlug: string }) {
  const topic = getTopic(disciplineSlug, topicSlug);
  const progress = await getMyProgress();
  if (!topic || progress.status === "signedOut") return null;
  if (progress.status === "error") return <p className="topic-level muted">Your level for this topic couldn&apos;t be loaded.</p>;
  const info = levelFor(passedInTopic(topic, progress.lookup));
  const text = levelProgressText(info);
  return (
    <div className="topic-level">
      <span className={`level-badge${info.level === null ? " none" : ""}`}>
        {info.level === null ? "No level yet" : `Level ${info.level}`}
      </span>
      <div className="level-progress">
        <progress value={info.toward} max={info.needed} aria-label={text} />
        <span className="level-text">{text}</span>
      </div>
    </div>
  );
}
