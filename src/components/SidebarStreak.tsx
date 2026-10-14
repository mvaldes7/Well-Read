import { STREAK_UNAVAILABLE, getMyStreak } from "@/lib/streaks/data";
import { daysLabel } from "@/lib/streaks/streaks.mjs";

// Sidebar footer "Streak / Best" (TSK-016, after the original progress mockup). Reads the
// session, so it renders inside <Suspense>. Signed out: nothing.
export default async function SidebarStreak() {
  const s = await getMyStreak();
  if (s.status === "signedOut") return null;
  if (s.status === "unavailable") {
    return <p className="streak-line muted-on-dark">Streak: {STREAK_UNAVAILABLE.toLowerCase()}</p>;
  }
  return (
    <dl className="streak-list">
      <div>
        <dt>Streak</dt>
        <dd>
          <b>{s.current}</b> {s.current === 1 ? "day" : "days"}
          <span className="visually-hidden">{` (${daysLabel(s.current)})`}</span>
        </dd>
      </div>
      <div>
        <dt>Best</dt>
        <dd>{daysLabel(s.best)}</dd>
      </div>
    </dl>
  );
}
