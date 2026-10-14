import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MasteryCard from "@/components/MasteryCard";
import { disciplines } from "@/content";
import { evaluateAchievements } from "@/achievements/definitions.mjs";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";
import { barPercents, dashboardData, last7Days } from "@/lib/progress/dashboard.mjs";

export const metadata: Metadata = { title: "Progress" };

// Progress (TSK-015): CSS bar charts (no chart library), each with a table for assistive tech.
export default function ProgressPage() {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">The Record</p>
        <h1>Progress</h1>
        <p>Days are counted in Pacific time, the same as achievement dates.</p>
        <hr className="rule" />
      </header>
      <Suspense fallback={<p className="empty-shelf muted">Loading your progress…</p>}>
        <ProgressBody />
      </Suspense>
    </>
  );
}

async function ProgressBody() {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p role="alert" className="empty-shelf error">{PROGRESS_ERROR}</p>;
  if (progress.status === "signedOut") {
    return (
      <p className="empty-shelf">
        <Link href="/login?next=%2Fprogress">Sign in</Link> to see your progress.
      </p>
    );
  }
  const data = dashboardData(progress.rows, disciplines);
  // Rendered per request after the session read above, so "today" is the request's LA day.
  const days = last7Days(progress.rows, disciplines);
  const all = evaluateAchievements(progress.rows, disciplines);
  return (
    <>
      <div className="charts">
        <Chart
          id="by-discipline"
          title="Lessons by discipline"
          caption="Lessons passed in each discipline"
          head={["Discipline", "Lessons passed"]}
          bars={data.perDiscipline.map((d) => ({ key: d.slug, label: d.title, value: d.passed, extra: ` of ${d.total}`, color: d.color }))}
        />
        <Chart
          id="last-7"
          title="Last 7 days"
          caption="Lessons first passed per day, last 7 days (Pacific time)"
          head={["Day", "Lessons passed"]}
          bars={days.map((d) => ({ key: d.key, label: d.isToday ? "Today" : d.label, value: d.count, extra: "", title: d.key }))}
        />
      </div>
      <section className="board" aria-labelledby="progress-mastery">
        <h2 id="progress-mastery" className="section-title">
          Mastery
        </h2>
        <ul className="mastery">
          {disciplines.map((d) => {
            const a = all.find((x) => x.id === `mastery:${d.slug}`);
            return a ? <MasteryCard key={d.slug} discipline={d} lookup={progress.lookup} achievement={a} /> : null;
          })}
        </ul>
      </section>
    </>
  );
}

type Bar = { key: string; label: string; value: number; extra: string; color?: string; title?: string };

/** Vertical CSS bars; the visual chart is aria-hidden and a table carries the same numbers. */
function Chart({ id, title, caption, head, bars }: { id: string; title: string; caption: string; head: [string, string]; bars: Bar[] }) {
  const pct = barPercents(bars.map((b) => b.value));
  return (
    <section className="chart-card" aria-labelledby={`chart-${id}`}>
      <h2 id={`chart-${id}`} className="chart-title">
        {title}
      </h2>
      <div className="chart" aria-hidden="true">
        {bars.map((b, i) => (
          <div key={b.key} className={`chart-col${b.color ? ` cover-${b.color}` : ""}`} title={b.title}>
            <span className="chart-num">{b.value}</span>
            <span className="chart-track">
              <span className="chart-bar" style={{ height: `${pct[i]}%` }} />
            </span>
            <span className="chart-label">{b.label}</span>
          </div>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.title ? `${b.label} (${b.title})` : b.label}</th>
              <td>
                {b.value}
                {b.extra}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
