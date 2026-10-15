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
  // Same wording as daysLabel ("1 day", "6 days"), with the number emphasised.
  const [current, unit] = daysLabel(s.current).split(" ");
  return (
    <dl className="streak-list">
      <div>
        <dt>Streak</dt>
        <dd>
          <b>{current}</b> {unit}
        </dd>
      </div>
      <div>
        <dt>Best</dt>
        <dd>{daysLabel(s.best)}</dd>
      </div>
    </dl>
  );
}
