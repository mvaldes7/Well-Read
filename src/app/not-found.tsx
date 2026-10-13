import type { Metadata } from "next";
import Link from "next/link";

// Root not-found supports metadata (Next 16 docs); the layout template adds " · Well-Read".
export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="not-found">
      <p className="eyebrow">Not in the collection</p>
      <p className="code" aria-hidden="true">404</p>
      <h1>Not found</h1>
      <p className="muted">That page doesn&apos;t exist.</p>
      <p className="back-link">
        <Link href="/">Back to all disciplines</Link>
      </p>
    </div>
  );
}
