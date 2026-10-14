import type { Discipline } from "@/content";
import { earnedLabel, type AchievementResult } from "@/achievements/definitions.mjs";
import { MASTERY_TIERS, masteryFor, masteryLine, passedInDiscipline } from "@/lib/progress/mastery.mjs";

// Shared by /achievements and /progress (TSK-015). Server component; data comes in as props.

/** One discipline's tier track (layout after the "Mastery Levels" mockup cards, in C2 styling). */
export default function MasteryCard({ discipline, lookup, achievement }: { discipline: Discipline; lookup: Parameters<typeof passedInDiscipline>[1]; achievement: AchievementResult }) {
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
