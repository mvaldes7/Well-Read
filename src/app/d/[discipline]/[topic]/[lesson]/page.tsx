import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { LessonStatus } from "@/components/Progress";
import Quiz, { type PublicQuestion } from "@/components/Quiz";
import { disciplines, getDiscipline, getLesson, getTopic } from "@/content";
import { toRoman } from "@/lib/ui/roman.mjs";

export function generateStaticParams() {
  return disciplines.flatMap((d) =>
    d.topics.flatMap((t) =>
      t.lessons.map((l) => ({ discipline: d.slug, topic: t.slug, lesson: l.slug })),
    ),
  );
}

export async function generateMetadata({
  params,
}: PageProps<"/d/[discipline]/[topic]/[lesson]">): Promise<Metadata> {
  const { discipline, topic, lesson } = await params;
  return { title: getLesson(discipline, topic, lesson)?.title ?? "Not found" };
}

// Strip answerIndex: only question text and options may reach the client.
function toPublicQuestions(quiz: { question: string; options: readonly string[] }[]): PublicQuestion[] {
  return quiz.map(({ question, options }) => ({ question, options: [...options] }));
}

export default async function LessonPage({
  params,
}: PageProps<"/d/[discipline]/[topic]/[lesson]">) {
  const { discipline: dSlug, topic: tSlug, lesson: lSlug } = await params;
  const discipline = getDiscipline(dSlug);
  const topic = getTopic(dSlug, tSlug);
  const lesson = getLesson(dSlug, tSlug, lSlug);
  if (!discipline || !topic || !lesson) notFound();

  const topicHref = `/d/${discipline.slug}/${topic.slug}`;
  const lessonNo = topic.lessons.findIndex((l) => l.id === lesson.id) + 1;
  return (
    <article className="lesson narrow">
      <Breadcrumbs
        items={[
          { label: "Disciplines", href: "/" },
          { label: discipline.title, href: `/d/${discipline.slug}` },
          { label: topic.title, href: topicHref },
          { label: `Lesson ${toRoman(lessonNo)}` },
        ]}
        motif={discipline.color}
      />
      <h1>{lesson.title}</h1>
      <div className="ornament" aria-hidden="true">◆</div>
      {lesson.sections.map((s, i) => (
        <section key={s.heading} className="entry" aria-labelledby={`sec-${i}`}>
          <div className="num" aria-hidden="true">
            {toRoman(i + 1)}
          </div>
          <div>
            <h2 id={`sec-${i}`}>{s.heading}</h2>
            <p>{s.body}</p>
          </div>
        </section>
      ))}
      <aside className="placard" aria-labelledby="key-facts">
        <div className="in">
          <h2 id="key-facts">
            <small>Placard</small>Key facts
          </h2>
          <ol>
            {lesson.keyFacts.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ol>
        </div>
      </aside>
      <section aria-labelledby="quiz-heading" className="quiz-frame">
        <p className="eyebrow center">
          {lesson.quiz.length} questions · pass at 70%
        </p>
        <h2 id="quiz-heading">Quiz</h2>
        <Suspense fallback={null}>
          <LessonStatus lessonId={lesson.id} />
        </Suspense>
        <Quiz lessonId={lesson.id} questions={toPublicQuestions(lesson.quiz)} />
      </section>
      <p className="back-link">
        <Link href={topicHref}>← Back to {topic.title}</Link>
      </p>
    </article>
  );
}
