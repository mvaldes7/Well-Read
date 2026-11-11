// Book-spine icon (option B, docs/design/icons/well-read-b-spines.svg) inlined next to the
// wordmark: no extra request. Decorative only; the "Well-Read" text is the link's label.
export default function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="244" height="244" rx="52" fill="#232326" stroke="#a8915f" strokeWidth="12" />
      <path d="M37,192 L37,70 Q37,60 47,60 L68,60 Q78,60 78,70 L78,192 Z" fill="#7d3a3b" />
      <rect x="42" y="72" width="3.5" height="120" rx="1" fill="#5a2a2b" />
      <rect x="37" y="84" width="41" height="8" fill="#e2cb93" />
      <path d="M82,192 L82,52 Q82,42 92,42 L114,42 Q124,42 124,52 L124,192 Z" fill="#3f4f6c" />
      <rect x="87" y="54" width="3.5" height="138" rx="1" fill="#2d394e" />
      <rect x="82" y="66" width="42" height="8" fill="#e2cb93" />
      <path d="M128,192 L128,78 Q128,68 138,68 L155,68 Q165,68 165,78 L165,192 Z" fill="#3e5744" />
      <rect x="133" y="80" width="3.5" height="112" rx="1" fill="#2c3d31" />
      <rect x="128" y="91" width="37" height="8" fill="#e2cb93" />
      <g transform="rotate(10 178 192)">
        <path d="M176,194 L176,102 Q176,96 182,96 L211,96 Q217,96 217,102 L217,194 Z" fill="#f3ead4" />
        <path d="M176,194 L176,102 Q176,96 182,96 L212,96 L212,194 Z" fill="#a8915f" />
        <rect x="210" y="102" width="2" height="92" fill="#796844" />
      </g>
      <rect x="22" y="192" width="212" height="21" rx="10.5" fill="#e2cb93" />
    </svg>
  );
}
