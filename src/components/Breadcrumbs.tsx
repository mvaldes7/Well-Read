import Link from "next/link";
import type { DisciplineColor } from "@/content";

export interface Crumb {
  label: string;
  href?: string;
}

/** Breadcrumb trail. `motif` adds a small decorative row of spines in that discipline's colors. */
export default function Breadcrumbs({ items, motif }: { items: Crumb[]; motif?: DisciplineColor }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      {motif && (
        <span className={`motif cover-${motif}`} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <ol>
        {items.map((c, i) => (
          <li key={i}>
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
