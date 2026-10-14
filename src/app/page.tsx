import Link from "next/link";
import { Suspense } from "react";
import HomeNotice from "@/components/HomeNotice";
import { disciplines } from "@/content";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";
import { dashboardData } from "@/lib/progress/dashboard.mjs";
import { nextTierText } from "@/lib/progress/mastery.mjs";
import { STREAK_UNAVAILABLE, getMyStreak } from "@/lib/streaks/data";
import { daysLabel } from "@/lib/streaks/streaks.mjs";

// Dashboard (TSK-015). Layout after Mike's dashboard mockup, in C2 styling.
export default function Dashboard() {
  return (
    <>
      <Suspense fallback={null}>
        <HomeNotice />
      </Suspense>
      <header className="hero">
        <p className="eyebrow">The Reading Room</p>
        <h1>Dashboard</h1>
        <hr className="rule" />
      </header>
      {/* Reads the session cookie, so it streams in behind Suspense (cacheComponents). */}
      <Suspense fallback={<p className="empty-shelf muted">Loading your dashboard…</p>}>
        <DashboardBody />
      </Suspense>
    </>
  );
}

async function DashboardBody() {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p role="alert" className="empty-shelf error">{PROGRESS_ERROR}</p>;
  if (progress.status === "signedOut") {
    return (
      <p className="empty-shelf">
        <Link href="/login">Sign in</Link> to see your dashboard.
      </p>
    );
  }
  const data = dashboardData(progress.rows, disciplines);
  const streak = await getMyStreak();
  return (
    <>
      <section aria-labelledby="dash-stats">
        <h2 id="dash-stats" className="visually-hidden">
          Your numbers
        </h2>
        <ul className="stats">
          <Stat value={`${data.lessons.passed}`} of={data.lessons.total} label="Lessons passed" />
          <Stat value={`${data.badges.earned}`} of={data.badges.total} label="Badges earned" />
          <Stat value={`${data.disciplines.started}`} of={data.disciplines.total} label="Disciplines started" />
          {/* Streaks (TSK-016). Before the activity_log migration: "Not available yet", never a made-up number. */}
          <StreakStat value={streak.status === "ok" ? streak.current : null} label="Day streak" />
          <StreakStat value={streak.status === "ok" ? streak.best : null} label="Best streak" />
        </ul>
      </section>
      <section className="board" aria-labelledby="dash-disciplines">
        <h2 id="dash-disciplines" className="section-title">
          Your disciplines
        </h2>
        <ul className="subjects">
          {data.perDiscipline.map((d) => {
            const { mastery: m, next } = d;
            const pct = m.next ? Math.round((m.toward / m.needed) * 100) : 100;
            return (
              <li key={d.slug} className={`subject cover-${d.color}${m.tier ? "" : " not-started"}`}>
                <h3>
                  <span className="mastery-dot" aria-hidden="true" />
                  <Link href={`/d/${d.slug}`}>{d.title}</Link>
                </h3>
                <p className="subject-meta">
                  <span className="subject-tier">{m.tier ?? "Not started"}</span>
                  <span>
                    {d.passed} of {d.total} {d.total === 1 ? "lesson" : "lessons"}
                  </span>
                </p>
                <div className="subject-bar" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="subject-next muted">{nextTierText(m)}</p>
                <p className="subject-cta">
                  {next.kind === "review" ? (
                    <Link href={next.href}>
                      Review {d.title} <span aria-hidden="true">→</span>
                    </Link>
                  ) : (
                    <Link href={next.href}>
                      {next.kind === "start" ? "Start" : "Continue"}: {next.lessonTitle} <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function Stat({ value, of, label }: { value: string; of: number; label: string }) {
  return (
    <li className="stat">
      <span className="stat-value">
        {value}
        <small> / {of}</small>
      </span>
      <span className="stat-label">{label}</span>
    </li>
  );
}

function StreakStat({ value, label }: { value: number | null; label: string }) {
  if (value === null) {
    return (
      <li className="stat stat-soon">
        <span className="stat-value">{STREAK_UNAVAILABLE}</span>
        <span className="stat-label">{label}</span>
      </li>
    );
  }
  return (
    <li className="stat">
      <span className="stat-value" aria-label={daysLabel(value)}>
        {value}
        <small>d</small>
      </span>
      <span className="stat-label">{label}</span>
    </li>
  );
}
