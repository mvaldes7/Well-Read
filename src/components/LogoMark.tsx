// Book-spine icon (option B, docs/design/icons/well-read-b-spines.svg) inlined next to the
// wordmark: no extra request. Decorative only; the "Well-Read" text is the link's label.
export default function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="6.5" fill="#232326" stroke="#a8915f" strokeWidth="1.5" />
      <rect x="5" y="8" width="5" height="16" fill="#7d3a3b" />
      <rect x="10.5" y="6" width="5" height="18" fill="#3f4f6c" />
      <rect x="16" y="9" width="4.5" height="15" fill="#3e5744" />
      <rect x="21.5" y="9.5" width="5" height="15" fill="#a8915f" transform="rotate(10 24 24)" />
      <rect x="5" y="11" width="5" height="1.2" fill="#e2cb93" />
      <rect x="10.5" y="9" width="5" height="1.2" fill="#e2cb93" />
      <rect x="16" y="12" width="4.5" height="1.2" fill="#e2cb93" />
      <rect x="3" y="24" width="26" height="3" rx="1" fill="#e2cb93" />
    </svg>
  );
}
