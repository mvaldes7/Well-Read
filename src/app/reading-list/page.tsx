import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import ReadingListAddForm from "@/components/ReadingListAddForm";
import ReadingListItem from "@/components/ReadingListItem";
import { getMyReadingList } from "@/lib/reading-list/data";
import { MESSAGES, STATUSES } from "@/lib/reading-list/logic.mjs";

export const metadata: Metadata = { title: "Reading List" };

// Reading List (TSK-017). Protected by the proxy's default rule; reads the session inside <Suspense>.
export default function ReadingListPage() {
  return (
    <>
      <header className="hero">
        <p className="eyebrow">The Queue</p>
        <h1>Reading List</h1>
        <p>Track books, articles, poems, essays — anything you want to explore.</p>
        <hr className="rule" />
      </header>
      <Suspense fallback={<p className="empty-shelf muted">Loading your reading list…</p>}>
        <ReadingListBody />
      </Suspense>
    </>
  );
}

async function ReadingListBody() {
  const list = await getMyReadingList();
  if (list.status === "error") return <p role="alert" className="empty-shelf error">{MESSAGES.loadFailed}</p>;
  if (list.status === "signedOut") {
    return (
      <p className="empty-shelf">
        <Link href="/login?next=%2Freading-list">Sign in</Link> to see your reading list.
      </p>
    );
  }
  if (list.status === "unavailable") {
    return (
      <div className="rl-unavailable" role="status">
        <p className="rl-unavailable-title">{MESSAGES.unavailable}</p>
        <p className="muted">The reading list is being set up. Check back soon.</p>
      </div>
    );
  }
  return (
    <div className="rl">
      <ReadingListAddForm />
      {STATUSES.map((s) => {
        const items = list.groups[s.value];
        return (
          <section key={s.value} className={`rl-section rl-${s.value}`} aria-labelledby={`rl-h-${s.value}`}>
            <h2 id={`rl-h-${s.value}`}>
              {s.label} <span className="rl-count">({items.length})</span>
            </h2>
            {items.length ? (
              <ul className="rl-items">
                {items.map((item) => (
                  <ReadingListItem key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="rl-empty">Nothing here yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
