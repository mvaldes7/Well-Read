import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import DigQuiz from "@/components/DigQuiz";
import ReportLesson from "@/components/ReportLesson";
import { getLessonById } from "@/content";
import { AI_GENERATED_LABEL, drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { getGeneratedLesson, type GeneratedLessonRow } from "@/lib/drilldowns/data";
import { getDigBest, loadDigQuiz } from "@/lib/drilldowns/quiz-data";
import { toPublicQuestions } from "@/lib/quiz/public.mjs";
import { createClient } from "@/lib/supabase/server";
import { paragraphs } from "@/lib/ui/paragraphs.mjs";
import { toRoman } from "@/lib/ui/roman.mjs";

export const metadata: Metadata = { title: "Dig deeper" };

// A generated (Dig deeper) lesson at /dig?id=gen_… (a query param, not a [id] segment, so the shell prerenders under
// cacheComponents). Read with the user's own session: RLS shows own pending/flagged and published rows,
// with explicit columns only. Behind WELL_READ_DRILLDOWNS.
export default function GeneratedLessonPage({ searchParams }: PageProps<"/dig">) {
  return (
    <article className="lesson narrow">
      <Suspense fallback={<p className="muted">Loading lesson…</p>}>
        <GeneratedLessonBody searchParams={searchParams} />
      </Suspense>
    </article>
  );
}

async function GeneratedLessonBody({ searchParams }: { searchParams: PageProps<"/dig">["searchParams"] }) {
  if (!drilldownsEnabled(process.env)) notFound();
  const raw = (await searchParams).id;
  const id = typeof raw === "string" ? raw : "";
  const r = await getGeneratedLesson(id);
  if (r.status === "notFound") notFound();
  if (r.status === "signedOut") {
    return (
      <p>
        <Link href={`/login?next=${encodeURIComponent(`/dig?id=${id}`)}`}>Sign in</Link> to read this lesson.
      </p>
    );
  }
  if (r.status !== "ok") return <p role="alert" className="error">This lesson is unavailable right now. Please try again later.</p>;
  const { row } = r;
  const parent = getLessonById(row.parent_lesson_id);
  const parentHref = parent ? `/d/${parent.discipline.slug}/${parent.topic.slug}/${parent.lesson.slug}` : null;
  return (
    <>
      <p className="eyebrow ai-label">
        <span className="badge">{AI_GENERATED_LABEL}</span>
        {row.review_status === "published" ? " · Reviewed" : " · Private to you until reviewed"}
      </p>
      <h1>{row.lesson.title}</h1>
      {row.review_status === "flagged" && (
        <p className="muted flag-note">One claim in this lesson couldn&apos;t be confirmed against its sources and is marked for review.</p>
      )}
      {row.lesson.sections.map((s, i) => (
        <section key={i} className="entry" aria-labelledby={`sec-${i}`}>
          <div className="num" aria-hidden="true">{toRoman(i + 1)}</div>
          <div>
            <h2 id={`sec-${i}`}>{s.heading}</h2>
            {paragraphs(s.body).map((p, j) => (
              <p key={j}>{p}</p>
            ))}
          </div>
        </section>
      ))}
      <aside className="placard" aria-labelledby="key-facts">
        <div className="in">
          <h2 id="key-facts">
            <small>Placard</small>Key facts
          </h2>
          <ol>
            {row.lesson.keyFacts.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ol>
        </div>
      </aside>
      <section aria-labelledby="quiz-heading" className="quiz-frame">
        <h2 id="quiz-heading">Quiz</h2>
        <Suspense fallback={<p className="muted">Loading quiz…</p>}>
          <DigQuizSection row={row} parentHref={parentHref} parentTitle={parent?.lesson.title ?? null} />
        </Suspense>
      </section>
      <section className="sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">
          <small>Checked against</small>Sources
        </h2>
        <ol>
          {row.sources.map((s) => (
            <li key={s.url}>
              <span className="cite">
                {s.publisher && <span className="pub">{s.publisher}, </span>}
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title ?? s.url}
                  <span className="visually-hidden"> (opens in a new tab)</span>
                </a>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <ReportLesson lessonId={row.id} />
      {parentHref && (
        <p className="back-link">
          <Link href={parentHref}>← Back to {parent?.lesson.title}</Link>
        </p>
      )}
    </>
  );
}

// Quiz on a Dig deeper lesson (docs/plans/dig-deeper-quizzes.md). Only question text and options reach the client;
// the key is read server-side through drilldown_quiz_key() and used again only when grading. Locked until the
// parent lesson's quiz has been submitted (pass or fail), the same rule as Dig deeper itself.
async function DigQuizSection({ row, parentHref, parentTitle }: { row: GeneratedLessonRow; parentHref: string | null; parentTitle: string | null }) {
  const unavailable = <p className="muted">The quiz is unavailable right now. Please try again later.</p>;
  const supabase = await createClient();
  if (!supabase) return unavailable;
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string" || !userId) return unavailable;
  const ctx = await loadDigQuiz(supabase, userId, row);
  if (ctx.status === "locked") {
    return (
      <p className="muted">
        Finish the quiz on {parentHref ? <Link href={parentHref}>{parentTitle ?? "the original lesson"}</Link> : "the original lesson"} first.
        This quiz opens after it.
      </p>
    );
  }
  if (ctx.status === "no_quiz") return <p className="muted">This lesson doesn&apos;t have a quiz.</p>;
  if (ctx.status !== "ok") return unavailable;
  const best = await getDigBest(supabase, userId, row.id);
  return (
    <>
      <p className="eyebrow center">{ctx.quiz.length} questions · pass at 70%</p>
      {best && (
        <p className="muted center">
          Your best: {best.score}/{best.total}
          {best.passed ? " (passed)" : " (not passed yet)"}
        </p>
      )}
      <DigQuiz lessonId={row.id} questions={toPublicQuestions(ctx.quiz)} />
    </>
  );
}
