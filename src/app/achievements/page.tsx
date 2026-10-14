import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { disciplines } from "@/content";
import { evaluateAchievements, earnedLabel, type AchievementResult } from "@/achievements/definitions.mjs";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";
import { MASTERY_TIERS, masteryFor, masteryLine, passedInDiscipline } from "@/lib/progress/mastery.mjs";

export const metadata: Metadata = { title: "Achievements" };

const GROUPS: { key: AchievementResult["group"]; title: string }[] = [
  { key: "milestones", title: "Milestones" },
  { key: "completionist", title: "Completionist" },
];

export default function AchievementsPage() {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">The Honours Board</p>
        <h1>Achievements</h1>
        <p>Recognition for what you&apos;ve learned. &ldquo;Earned by&rdquo; marks an older record: you earned it on or before that date.</p>
        <hr className="rule" />
      </header>
      {/* Reads the session cookie, so it streams in behind Suspense (cacheComponents). */}
      <Suspense fallback={<p className="empty-shelf muted">Loading your achievements…</p>}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p role="alert" className="empty-shelf error">{PROGRESS_ERROR}</p>;
  if (progress.status === "signedOut") {
    return (
      <p className="empty-shelf">
        <Link href="/login?next=%2Fachievements">Sign in</Link> to see your achievements.
      </p>
    );
  }
  // Computed on the server from the user's completions + static content; nothing is stored.
  const all = evaluateAchievements(progress.rows, disciplines);
  const earned = all.filter((a) => a.earned).length;
  return (
    <>
      <p className="board-count">
        {earned} of {all.length} earned
      </p>
      <section className="board" aria-labelledby="ach-mastery">
        <h2 id="ach-mastery" className="section-title">
          Mastery
        </h2>
        <ul className="mastery">
          {disciplines.map((d) => {
            const a = all.find((x) => x.id === `mastery:${d.slug}`);
            return a ? <MasteryCard key={d.slug} discipline={d} lookup={progress.lookup} achievement={a} /> : null;
          })}
        </ul>
      </section>
      {GROUPS.map((g) => {
        const items = all.filter((a) => a.group === g.key);
        if (items.length === 0) return null;
        return (
          <section key={g.key} className="board" aria-labelledby={`ach-${g.key}`}>
            <h2 id={`ach-${g.key}`} className="section-title">
              {g.title}
            </h2>
            <ul className="medals">
              {items.map((a) => {
                return (
                  <li key={a.id} className={`medal ${a.earned ? "earned" : "locked"}`}>
                    <span className="medallion" aria-hidden="true">
                      {a.earned ? (a.tier ?? "★") : "◇"}
                    </span>
                    <div className="medal-body">
                      <h3>
                        {a.title}
                        <span className="visually-hidden">{a.earned ? " (earned)" : " (locked)"}</span>
                      </h3>
                      <p className="req">{a.requirement}</p>
                      <p className="medal-status">
                        {earnedLabel(a)}
                        {a.progress && <span className="medal-progress"> · {a.progress}</span>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </>
  );
}

type Discipline = (typeof disciplines)[number];

/** One discipline's tier track (layout after the "Mastery Levels" mockup cards, in C2 styling). */
function MasteryCard({ discipline, lookup, achievement }: { discipline: Discipline; lookup: Parameters<typeof passedInDiscipline>[1]; achievement: AchievementResult }) {
  const info = masteryFor(passedInDiscipline(discipline, lookup));
  const headingId = `mastery-${discipline.slug}`;
  return (
    <li className={`mastery-card cover-${discipline.color}${info.tier ? "" : " not-started"}`} aria-labelledby={headingId}>
      <h3 id={headingId}>
        <span className="mastery-dot" aria-hidden="true" />
        {discipline.title}
      </h3>
      <ol className="tier-track" aria-label={`${discipline.title} tiers`}>
        {MASTERY_TIERS.map((t, i) => {
          const reached = i < info.tierIndex;
          const current = i === info.tierIndex - 1;
          return (
            <li key={t.name} className={`tier${reached ? " reached" : ""}${current ? " current" : ""}`} aria-current={current ? "step" : undefined}>
              <span className="tier-pip" aria-hidden="true" />
              <span className="tier-name">{t.name}</span>
              <span className="visually-hidden">
                {` (${t.min} ${t.min === 1 ? "lesson" : "lessons"}, ${reached ? "reached" : "not reached"})`}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mastery-line">{masteryLine(info)}</p>
      <p className="medal-status">
        {earnedLabel(achievement)}
        {achievement.progress && <span className="medal-progress"> · {achievement.progress}</span>}
      </p>
    </li>
  );
}
