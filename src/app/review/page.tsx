import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import ReviewActions from "@/components/ReviewActions";
import { getLessonById } from "@/content";
import { drilldownsEnabled } from "@/lib/drilldowns/config.mjs";
import { actionsFor, filterQueue, loadReviewQueue, parseFilter, queueCounts, REVIEW_FILTERS } from "@/lib/drilldowns/review.mjs";
import { drilldownDbConfigured, reviewQueue } from "@/lib/drilldowns/server-db.mjs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review AI lessons", robots: { index: false, follow: false } };

const FILTER_LABELS = { all: "All", pending: "Pending", flagged: "Flagged", reported: "Reported" } as const;

interface QueueRow {
  id: string;
  parent_lesson_id: string;
  choice_id: string;
  review_status: "pending" | "flagged" | "published" | "rejected";
  model: string;
  prompt_version: string;
  lesson: { title?: string; sections?: { heading: string; body: string }[]; keyFacts?: string[]; quiz?: { question: string; options: string[] }[] };
  sources: { publisher?: string; title?: string; url: string }[];
  unconfirmed_claims: { ref?: string; claim?: string | null; reason?: string }[];
  fact_check: { ref: string; supported: boolean; note?: string }[];
  created_at: string | Date;
  open_reports: { id: number; reason: string; created_at: string }[];
}

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
      {rows.map((row) => <ReviewItem key={row.id} row={row} />)}
    </>
  );
}

function ReviewItem({ row }: { row: QueueRow }) {
  const parent = getLessonById(row.parent_lesson_id);
  const unconfirmed = new Set(row.fact_check.filter((f) => !f.supported).map((f) => f.ref));
  for (const c of row.unconfirmed_claims) if (c.ref) unconfirmed.add(c.ref);
  return (
    <section className="entry review-item" aria-labelledby={`rv-${row.id}`}>
      <div>
        <p className="eyebrow">
          <span className="badge">{row.review_status}</span>
          {row.open_reports.length > 0 && <span className="badge"> {row.open_reports.length} report(s)</span>} · {row.id} ·{" "}
          {parent ? parent.lesson.title : row.parent_lesson_id} / {row.choice_id} · {row.model} · {String(row.created_at)}
        </p>
        <h2 id={`rv-${row.id}`}>{row.lesson.title ?? "(untitled)"}</h2>
        {row.unconfirmed_claims.length > 0 && (
          <div className="flag-note">
            <h3>Unconfirmed claim</h3>
            <ul>
              {row.unconfirmed_claims.map((c, i) => (
                <li key={i}>
                  <strong>{c.ref}</strong>: {c.claim ?? "(text unavailable)"}. <em>{c.reason}</em>
                </li>
              ))}
            </ul>
          </div>
        )}
        {row.open_reports.length > 0 && (
          <div>
            <h3>User reports</h3>
            <ul>
              {row.open_reports.map((rep) => (
                <li key={rep.id}>{rep.reason}</li>
              ))}
            </ul>
          </div>
        )}
        <details>
          <summary>Lesson content</summary>
          {(row.lesson.sections ?? []).map((s, i) => (
            <div key={i}>
              <h3>{s.heading}</h3>
              <p>{s.body}</p>
            </div>
          ))}
          <h3>Key facts</h3>
          <ol>
            {(row.lesson.keyFacts ?? []).map((f, i) => (
              <li key={i}>
                {f} {unconfirmed.has(`fact${i + 1}`) && <strong>(unconfirmed)</strong>}
              </li>
            ))}
          </ol>
          <h3>Quiz questions</h3>
          <ol>
            {(row.lesson.quiz ?? []).map((q, i) => (
              <li key={i}>
                {q.question} {unconfirmed.has(`quiz${i + 1}`) && <strong>(unconfirmed)</strong>}
              </li>
            ))}
          </ol>
        </details>
        <details>
          <summary>Fact check ({row.fact_check.length ? `${row.fact_check.filter((f) => f.supported).length}/${row.fact_check.length} confirmed` : "per-claim results not stored"})</summary>
          {row.fact_check.length > 0 ? (
            <table>
              <thead>
                <tr><th scope="col">Claim</th><th scope="col">Result</th><th scope="col">Note</th></tr>
              </thead>
              <tbody>
                {row.fact_check.map((f) => (
                  <tr key={f.ref}>
                    <td>{f.ref}</td>
                    <td>{f.supported ? "Confirmed" : "Unconfirmed"}</td>
                    <td>{f.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">Generated before per-claim results were stored; only the flag above is available.</p>
          )}
        </details>
        <h3>Sources</h3>
        <ul>
          {row.sources.map((s) => (
            <li key={s.url}>
              {s.publisher && `${s.publisher}, `}
              <a href={s.url} target="_blank" rel="noopener noreferrer">{s.title ?? s.url}</a>
            </li>
          ))}
        </ul>
        <ReviewActions lessonId={row.id} actions={actionsFor(row) as ("publish" | "reject" | "unpublish" | "clear_report")[]} />
      </div>
    </section>
  );
}
