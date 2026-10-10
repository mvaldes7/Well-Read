import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { disciplines } from "@/content";
import { evaluateAchievements, earnedLabel, type AchievementResult } from "@/achievements/definitions.mjs";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";

export const metadata: Metadata = { title: "Achievements" };

const GROUPS: { key: AchievementResult["group"]; title: string }[] = [
  { key: "milestones", title: "Milestones" },
  { key: "topics", title: "Topic levels" },
  { key: "disciplines", title: "Completionist" },
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
