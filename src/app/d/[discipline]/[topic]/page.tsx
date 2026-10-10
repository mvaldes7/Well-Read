import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { LessonMarker } from "@/components/Progress";
import { disciplines, getDiscipline, getTopic } from "@/content";
import { toRoman } from "@/lib/ui/roman.mjs";

export function generateStaticParams() {
  return disciplines.flatMap((d) => d.topics.map((t) => ({ discipline: d.slug, topic: t.slug })));
}

export async function generateMetadata({
  params,
}: PageProps<"/d/[discipline]/[topic]">): Promise<Metadata> {
  const { discipline, topic } = await params;
  return { title: getTopic(discipline, topic)?.title ?? "Not found" };
}

export default async function TopicPage({ params }: PageProps<"/d/[discipline]/[topic]">) {
  const { discipline: dSlug, topic: tSlug } = await params;
  const discipline = getDiscipline(dSlug);
  const topic = getTopic(dSlug, tSlug);
  if (!discipline || !topic) notFound();

  return (
    <div className="narrow">
      <header className="page-head">
        <Breadcrumbs
          items={[
            { label: "Disciplines", href: "/" },
            { label: discipline.title, href: `/d/${discipline.slug}` },
            { label: topic.title },
          ]}
          motif={discipline.color}
        />
        <h1>{topic.title}</h1>
        <p className="dek">{topic.summary}</p>
        <div className="ornament" aria-hidden="true">◆</div>
      </header>
      <h2 className="section-title">Lessons</h2>
      <ol className="entries">
        {topic.lessons.map((l, i) => (
          <li key={l.slug} className="entry">
            <div className="num" aria-hidden="true">
              {toRoman(i + 1)}
              <small>Lesson</small>
            </div>
            <div>
              <h3 className="entry-title">
                <Link href={`/d/${discipline.slug}/${topic.slug}/${l.slug}`}>{l.title}</Link>
                {/* Per-user marker streams in; the list itself stays in the static shell. */}
                <Suspense fallback={null}>
                  <LessonMarker lessonId={l.id} />
                </Suspense>
              </h3>
              <p className="meta">
                {l.sections.length} {l.sections.length === 1 ? "section" : "sections"} · {l.quiz.length}-question quiz
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
