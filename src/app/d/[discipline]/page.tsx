import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import { disciplines, getDiscipline } from "@/content";

export function generateStaticParams() {
  return disciplines.map((d) => ({ discipline: d.slug }));
}

export async function generateMetadata({ params }: PageProps<"/d/[discipline]">): Promise<Metadata> {
  const { discipline } = await params;
  return { title: getDiscipline(discipline)?.title ?? "Not found" };
}

export default async function DisciplinePage({ params }: PageProps<"/d/[discipline]">) {
  const { discipline: slug } = await params;
  const discipline = getDiscipline(slug);
  if (!discipline) notFound();

  return (
    <>
      <Breadcrumbs items={[{ label: "Disciplines", href: "/" }, { label: discipline.title }]} />
      <h1>{discipline.title}</h1>
      <p className="muted">{discipline.description}</p>
      <ul className="card-list">
        {discipline.topics.map((t) => (
          <li key={t.slug}>
            <span className="tag">{t.kind}</span>
            <h2>
              <Link href={`/d/${discipline.slug}/${t.slug}`}>{t.title}</Link>
            </h2>
            <p>{t.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
