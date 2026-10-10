import { getMyProgress } from "@/lib/progress/data";

// Per-user completion UI. Each reads the session, so render inside <Suspense>.

/** Small marker for a lesson in a list. Renders nothing unless passed. */
export async function LessonMarker({ lessonId }: { lessonId: string }) {
  const progress = await getMyProgress();
  if (progress.status !== "ok" || !progress.lookup.get(lessonId)?.passed) return null;
  return (
    <span className="completed-marker" role="img" aria-label="Completed" title="Completed">
      ✓
    </span>
  );
}

/** Status line above a lesson's quiz: completed with best score, or best attempt so far. */
export async function LessonStatus({ lessonId }: { lessonId: string }) {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p className="muted">Your progress for this lesson couldn&apos;t be loaded.</p>;
  if (progress.status !== "ok") return null;
  const best = progress.lookup.get(lessonId);
  if (!best) return null;
  return best.passed ? (
    <p className="completed-status">
      <span aria-hidden="true">✓ </span>Completed – best {best.score}/{best.total}. You can retake the quiz any time.
    </p>
  ) : (
    <p className="muted">
      Best attempt so far: {best.score}/{best.total} (not yet passed – you need 70%).
    </p>
  );
}
