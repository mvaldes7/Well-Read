import { ICON_PATHS, iconFor } from "@/achievements/icons.mjs";

// Decorative subject icon inside a medallion; colour comes from the coin (earned gold / locked grey).
export default function BadgeIcon({ id }: { id: string }) {
  const name = iconFor(id);
  return (
    <svg className="badge-icon" data-icon={name} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
