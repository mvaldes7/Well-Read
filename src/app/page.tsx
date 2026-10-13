import Link from "next/link";
import { disciplines } from "@/content";
import { toRoman } from "@/lib/ui/roman.mjs";

export default function Home() {
  return (
    <div className="narrow">
      <header className="hero">
        <p className="eyebrow">The Collection</p>
        <h1>Well-Read</h1>
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
