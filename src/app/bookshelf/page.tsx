import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { bookLabel } from "@/lib/progress/logic.mjs";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";

export const metadata: Metadata = { title: "Bookshelf" };

export default function BookshelfPage() {
  return (
    <>
      <h1>Bookshelf</h1>
      <p className="muted">One book for each topic where you&apos;ve completed at least one lesson.</p>
      {/* Reads the session cookie, so it streams in behind Suspense (cacheComponents). */}
      <Suspense fallback={<p>Loading your bookshelf…</p>}>
        <Shelf />
      </Suspense>
    </>
  );
}

async function Shelf() {
  const progress = await getMyProgress();
  if (progress.status === "error") return <p role="alert" className="error">{PROGRESS_ERROR}</p>;
  if (progress.status === "signedOut") {
    return (
      <p>
        <Link href="/login?next=%2Fbookshelf">Sign in</Link> to see your bookshelf.
      </p>
    );
  }
  if (progress.books.length === 0) {
    return (
      <p>
        No books yet. <Link href="/">Start learning</Link> and pass a lesson quiz to add your first book.
      </p>
    );
  }
  return (
    <ul className="bookshelf" aria-label="Your books">
      {progress.books.map((book) => (
        <li key={`${book.disciplineSlug}/${book.topicSlug}`}>
          <Link href={book.href} className="book" aria-label={bookLabel(book)}>
            <span className="book-title">{book.topicTitle}</span>
            <span className="book-meta">{book.disciplineTitle}</span>
            <span className="book-count" aria-hidden="true">
              {book.passedCount}/{book.lessonCount}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
