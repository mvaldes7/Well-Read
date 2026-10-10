import Link from "next/link";
import { disciplines } from "@/content";

export default function Home() {
  return (
    <>
      <h1>FoundationLearn</h1>
      <p className="muted">Choose a discipline to start learning.</p>
      <ul className="card-list">
        {disciplines.map((d) => (
          <li key={d.slug}>
            <h2>
              <Link href={`/d/${d.slug}`}>{d.title}</Link>
            </h2>
            <p>{d.description}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
