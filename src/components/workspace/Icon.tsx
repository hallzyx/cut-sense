/** Stroke icons (24×24, currentColor) from the design/ux prototype. Decorative: the control's text names them. */
const P: Record<string, React.ReactNode> = {
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  poly: <><path d="M5 18L4 8l8-4 7 6-3 9z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="5" cy="18" r="2" fill="currentColor" /><circle cx="12" cy="4" r="2" fill="currentColor" /><circle cx="19" cy="10" r="2" fill="currentColor" /></>,
  circle: <><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  spark: <path d="M11 3l1.9 5.6L18.5 10.5l-5.6 1.9L11 18l-1.9-5.6L3.5 10.5l5.6-1.9zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill="currentColor" />,
  photo: <><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M3 16l5-5 4 4 3-3 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="16" cy="9" r="1.6" fill="currentColor" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  more: <><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /></>,
  down: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  print: <path d="M7 8V3h10v5M7 17H4v-8h16v8h-3M7 14h10v7H7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  file: <path d="M6 3h8l4 4v14H6zM14 3v4h4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  plus: <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  target: <><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" /></>,
  hand: <><path d="M4 18c3-9 7 2 9-5s5-6 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="4" cy="18" r="2" fill="currentColor" /></>,
  contrast: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></>,
  kit: <path d="M4 8h16v11H4zM9 8V5h6v3M4 13h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  shape: <rect x="4" y="6" width="16" height="12" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />,
  pen: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  import: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  save: <path d="M5 3h11l3 3v15H5zM8 3v5h7M8 21v-7h8v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  new: <path d="M6 3h8l4 4v14H6zM12 10v7M8.5 13.5h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  sun: <><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  redo: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  x: <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  warn: <><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 10v5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><circle cx="12" cy="18" r="1.3" fill="currentColor" /></>,
  caret: <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  caretUp: <path d="M7 14l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  machine: <path d="M3 6h18v8H3zM7 14v4M17 14v4M5 18h14M8 10h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
  ruler: <path d="M3 16.5L16.5 3 21 7.5 7.5 21zM7 12.5l2 2M10 9.5l1.5 1.5M13 6.5l2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};

export type IconName = keyof typeof P;

export function Icon({ name, className = 'ux-ico' }: { name: IconName; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">{P[name]}</svg>;
}
