import type { ReactNode } from "react";
import { formatPacific, isoOrEmpty } from "@/lib/ui/pacific-time.mjs";

// One lesson in Mike's owner-only /review queue (P4). Server component: the Pacific timestamp is formatted once on
// the server, so there is nothing to hydrate differently. The lesson id and model name appear only here (owner-only),
// inside a collapsed Details line; learner pages (/dig) never select the model column.
export interface QueueRow {
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

export default function ReviewCard({ row, choiceLabel, parentTitle, actions }: { row: QueueRow; choiceLabel: string; parentTitle: string; actions?: ReactNode }) {
  const unconfirmed = new Set(row.fact_check.filter((f) => !f.supported).map((f) => f.ref));
  for (const c of row.unconfirmed_claims) if (c.ref) unconfirmed.add(c.ref);
  const when = formatPacific(row.created_at);
  return (
    <section className="review-item" aria-labelledby={`rv-${row.id}`}>
      <div className="review-meta">
        <span className={`pill pill-${row.review_status}`}>{row.review_status}</span>
        {row.open_reports.length > 0 && (
          <span className="pill pill-reported">
            {row.open_reports.length} {row.open_reports.length === 1 ? "report" : "reports"}
          </span>
        )}
        {when && <time dateTime={isoOrEmpty(row.created_at)}>{when}</time>}
      </div>
      <h2 id={`rv-${row.id}`}>{choiceLabel}</h2>
      <p className="review-from">from {parentTitle}</p>
      {row.lesson.title && <p className="review-gen-title">Generated lesson: {row.lesson.title}</p>}
      <details className="review-details">
        <summary>Details</summary>
        <dl>
          <dt>Lesson id</dt>
          <dd><code>{row.id}</code></dd>
          <dt>Model</dt>
          <dd><code>{row.model}</code></dd>
          <dt>Prompt</dt>
          <dd><code>{row.prompt_version}</code></dd>
        </dl>
      </details>
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
      {actions}
    </section>
  );
}
