import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDiscipline } from "@/content";
import { bookLabel, spineStyle } from "@/lib/progress/logic.mjs";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";
import { toRoman } from "@/lib/ui/roman.mjs";

export const metadata: Metadata = { title: "Bookshelf" };

export default function BookshelfPage() {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">The Permanent Collection</p>
        <h1>Bookshelf</h1>
        <p>One volume for each topic where you&apos;ve completed at least one lesson, shelved by discipline.</p>
        <hr className="rule" />
      </header>
      {/* Reads the session cookie, so it streams in behind Suspense (cacheComponents). */}
      <Suspense fallback={<p className="empty-shelf muted">Loading your bookshelf…</p>}>
        <Shelf />
      </Suspense>
    </>
  );
}

async function Shelf() {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p role="alert" className="empty-shelf error">{PROGRESS_ERROR}</p>;
  if (progress.status === "signedOut") {
    return (
      <p className="empty-shelf">
        <Link href="/login?next=%2Fbookshelf">Sign in</Link> to see your bookshelf.
      </p>
    );
  }
  if (progress.groups.length === 0) {
    return (
      <p className="empty-shelf">
        No books yet. <Link href="/">Start learning</Link> and pass a lesson quiz to add your first book.
      </p>
    );
  }
  return (
    <>
      {progress.groups.map((group) => {
        const { slug, title, color } = group.discipline;
        const passed = group.books.reduce((n, b) => n + b.passedCount, 0);
        const volumes = group.books.length;
        const gallery = `Gallery ${toRoman(group.position)}`;
        return (
          <section key={slug} className="room" aria-labelledby={`shelf-${slug}`}>
            <div className="walltext">
              <p className="eyebrow brass">{gallery}</p>
              <h2 id={`shelf-${slug}`}>{title}</h2>
              <p>{getDiscipline(slug)?.description}</p>
              <p className="count">
                {volumes} {volumes === 1 ? "volume" : "volumes"} · {passed} {passed === 1 ? "lesson" : "lessons"} completed
              </p>
            </div>
            <div className="case">
              <div className="case-inner">
                {/* Color family comes from the discipline's token (globals.css .cover-*). */}
                <ul className={`books cover-${color}`}>
                  {group.books.map((book) => {
                    const s = spineStyle(`${book.disciplineSlug}/${book.topicSlug}`, book.topicTitle);
                    return (
                      <li key={book.topicSlug}>
                        <Link
                          href={book.href}
                          className={`spine shade-${s.shade}`}
                          aria-label={bookLabel(book)}
                          style={{ "--w": `${s.width}px`, "--h": `${s.height}px`, "--fs": `${s.fontSize}px` } as React.CSSProperties}
                        >
                          <span className="cap" aria-hidden="true" />
                          <span className="t" aria-hidden="true">
                            {book.topicTitle}
                          </span>
                          <span className="cap b" aria-hidden="true" />
                          <span className="tag" aria-hidden="true">
                            {book.passedCount}/{book.lessonCount}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                  <li aria-hidden="true">
                    <span className="bookend" />
                  </li>
                </ul>
              </div>
              <div className="ledge">
                {/* The h2 above names the shelf for assistive tech; the plaque is visual. */}
                <span className="plaque" aria-hidden="true">
                  <small>{gallery} ·</small> {title}
                </span>
              </div>
            </div>
          </section>
        );
      })}
      <p className="legend">
        Brass tag <b>1/2</b> = lessons completed of lessons in the topic
      </p>
    </>
  );
}
