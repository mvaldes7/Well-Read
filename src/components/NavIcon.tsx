// Small line icons for the sidebar (decorative; each link has a text label).
const PATHS: Record<string, string> = {
  home: "M3 10.5 10 4l7 6.5M5 9v7h4v-4h2v4h4V9",
  book: "M10 6c-2-1.3-4.5-1.5-7-1v11c2.5-.5 5-.3 7 1 2-1.3 4.5-1.5 7-1V5c-2.5-.5-5-.3-7 1Zm0 0v11",
  shelf: "M4 4v12M7.5 4v12M11 5l3.5 11M3 17h14",
  list: "M8 6h9M8 10h9M8 14h9M3.5 6h.01M3.5 10h.01M3.5 14h.01",
  chart: "M5 16V10M10 16V5M15 16v-4",
  badge: "M10 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm-2.5 8.3L6.5 17l3.5-2 3.5 2-1-5.7",
  gear: "M10 7.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6ZM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4",
};

export default function NavIcon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ""} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
