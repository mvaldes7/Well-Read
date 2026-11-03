import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReportLesson from "@/components/ReportLesson";
import { getLessonById } from "@/content";
import { AI_GENERATED_LABEL, drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { getGeneratedLesson } from "@/lib/drilldowns/data";
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
