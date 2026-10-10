import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/Breadcrumbs";
import { disciplines, getDiscipline } from "@/content";
import { toRoman } from "@/lib/ui/roman.mjs";

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
    <div className="narrow">
      <header className="page-head">
        <Breadcrumbs items={[{ label: "Disciplines", href: "/" }, { label: discipline.title }]} motif={discipline.color} />
        <h1>{discipline.title}</h1>
        <p className="dek">{discipline.description}</p>
        <div className="ornament" aria-hidden="true">◆</div>
      </header>
      <ul className="entries">
        {discipline.topics.map((t, i) => (
          <li key={t.slug} className="entry">
            <div className="num" aria-hidden="true">
              {toRoman(i + 1)}
              <small>{t.kind}</small>
            </div>
            <div>
              <h2>
                <Link href={`/d/${discipline.slug}/${t.slug}`}>{t.title}</Link>
              </h2>
              <p className="meta">
                <span className="visually-hidden">Kind: </span>
                {t.kind} · {t.lessons.length} {t.lessons.length === 1 ? "lesson" : "lessons"}
              </p>
              <p>{t.summary}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
