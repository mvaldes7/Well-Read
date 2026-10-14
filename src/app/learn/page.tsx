import Link from "next/link";
import type { Metadata } from "next";
import { disciplines } from "@/content";
import { toRoman } from "@/lib/ui/roman.mjs";

export const metadata: Metadata = { title: "Learn" };

// Discipline browse (moved from / in TSK-015; / is now the dashboard).
export default function LearnPage() {
  return (
    <div className="narrow">
      <header className="hero">
        <p className="eyebrow">The Collection</p>
        <h1>Learn</h1>
        <p>Choose a discipline to start learning.</p>
        <hr className="rule" />
      </header>
      <ul className="entries">
        {disciplines.map((d, i) => (
          <li key={d.slug} className="entry">
            <div className="num" aria-hidden="true">
              {toRoman(i + 1)}
              <small>Gallery</small>
            </div>
            <div>
              <h2>
                <Link href={`/d/${d.slug}`}>{d.title}</Link>
              </h2>
              <p className="meta">
                {d.topics.length} {d.topics.length === 1 ? "topic" : "topics"}
              </p>
              <p>{d.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
