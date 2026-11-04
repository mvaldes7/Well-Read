import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReviewActions from "@/components/ReviewActions";
import ReviewCard, { type QueueRow } from "@/components/ReviewCard";
import { getLessonById } from "@/content";
import { drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { actionsFor, filterQueue, loadReviewQueue, parseFilter, queueCounts, REVIEW_FILTERS } from "@/lib/drilldowns/review.mjs";
import { drilldownDbConfigured, reviewQueue } from "@/lib/drilldowns/server-db.mjs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review AI lessons", robots: { index: false, follow: false } };

const FILTER_LABELS = { all: "All", pending: "Pending", flagged: "Flagged", reported: "Reported" } as const;


// Mike's owner-only review screen (P4) at /review?filter=…. Behind WELL_READ_DRILLDOWNS; anyone who is not the
// owner configured in the DB (public.drilldown_owner), including signed-out visitors, gets a 404. The answer key is never loaded here.
export default function ReviewPage({ searchParams }: PageProps<"/review">) {
  return (
    <article className="lesson review">
      <Suspense fallback={<p className="muted">Loading review queue…</p>}>
        <ReviewBody searchParams={searchParams} />
      </Suspense>
    </article>
  );
}

async function ReviewBody({ searchParams }: { searchParams: PageProps<"/review">["searchParams"] }) {
  if (!drilldownsEnabled(process.env)) notFound();
  const filter = parseFilter((await searchParams).filter);
  const supabase = await createClient();
  const r = await loadReviewQueue({
    enabled: true,
    configured: drilldownDbConfigured() && Boolean(supabase),
    getUserId: async () => {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getClaims();
      const sub = data?.claims?.sub;
      return !error && typeof sub === "string" && sub ? sub : null;
    },
    db: { reviewQueue },
  });
  if (r.status === "hidden") notFound();
  if (r.status !== "ok") return <p role="alert" className="error">The review queue is unavailable right now.</p>;
  const all = r.rows as QueueRow[];
  const rows = filterQueue(all, filter) as QueueRow[];
  const counts = queueCounts(all);
  return (
    <>
      <p className="eyebrow">Owner only</p>
      <h1>Review AI lessons</h1>
      <nav aria-label="Filter" className="review-filters">
        {REVIEW_FILTERS.map((f) => (
          <Link key={f} href={f === "all" ? "/review" : `/review?filter=${f}`} aria-current={f === filter ? "page" : undefined}>
            {FILTER_LABELS[f]} ({counts[f]})
          </Link>
        ))}
      </nav>
      {rows.length === 0 && <p className="muted">Nothing to review.</p>}
      {rows.map((row) => {
        const parent = getLessonById(row.parent_lesson_id)?.lesson;
        const choice = parent?.digDeeper?.find((c) => c.id === row.choice_id);
        return (
          <ReviewCard
            key={row.id}
            row={row}
            choiceLabel={choice?.label ?? row.choice_id}
            parentTitle={parent?.title ?? row.parent_lesson_id}
            actions={<ReviewActions lessonId={row.id} actions={actionsFor(row) as ("publish" | "reject" | "unpublish" | "clear_report")[]} />}
          />
        );
      })}
    </>
  );
}
