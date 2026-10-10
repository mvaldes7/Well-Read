import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { LessonMarker } from "@/components/Progress";
import { disciplines, getDiscipline, getTopic } from "@/content";

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
    <>
      <Breadcrumbs
        items={[
          { label: "Disciplines", href: "/" },
          { label: discipline.title, href: `/d/${discipline.slug}` },
          { label: topic.title },
        ]}
      />
      <span className="tag">{topic.kind}</span>
      <h1>{topic.title}</h1>
      <p className="muted">{topic.summary}</p>
      <h2>Lessons</h2>
      <ol className="card-list">
        {topic.lessons.map((l) => (
          <li key={l.slug}>
            <Link href={`/d/${discipline.slug}/${topic.slug}/${l.slug}`}>{l.title}</Link>{" "}
            {/* Per-user marker streams in; the list itself stays in the static shell. */}
            <Suspense fallback={null}>
              <LessonMarker lessonId={l.id} />
            </Suspense>
          </li>
        ))}
      </ol>
    </>
  );
}
