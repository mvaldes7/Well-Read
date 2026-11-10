import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getDiscipline } from "@/content";
import BookshelfView from "@/components/BookshelfView";
import { PROGRESS_ERROR, getMyProgress } from "@/lib/progress/data";

export const metadata: Metadata = { title: "Bookshelf" };

function Hero({ children }: { children?: React.ReactNode }) {
  return (
    <header className="hero">
      <p className="eyebrow">The Permanent Collection</p>
      <h1>Bookshelf</h1>
      <p>One volume for each topic where you&apos;ve completed at least one lesson, shelved by discipline.</p>
      <hr className="rule" />
      {children}
    </header>
  );
}

export default function BookshelfPage() {
  return (
    <Suspense
      fallback={
        <>
          <Hero />
          <p className="empty-shelf muted">Loading your bookshelf…</p>
        </>
      }
    >
      <Shelf />
    </Suspense>
  );
}

async function Shelf() {
  const progress = await getMyProgress();
  if (progress.status === "error") {
    return (
      <>
        <Hero />
        <p role="alert" className="empty-shelf error">{PROGRESS_ERROR}</p>
      </>
    );
  }
  if (progress.status === "signedOut") {
    return (
      <>
        <Hero />
        <p className="empty-shelf">
          <Link href="/login?next=%2Fbookshelf">Sign in</Link> to see your bookshelf.
        </p>
      </>
    );
  }
  if (progress.groups.length === 0) {
    return (
      <>
        <Hero />
        <p className="empty-shelf">
          No books yet. <Link href="/learn">Start learning</Link> and pass a lesson quiz to add your first book.
        </p>
      </>
    );
  }
  const descriptions = Object.fromEntries(
    progress.groups.map((group) => [group.discipline.slug, getDiscipline(group.discipline.slug)?.description ?? ""]),
  );
  return <BookshelfView groups={progress.groups} descriptions={descriptions} />;
}
