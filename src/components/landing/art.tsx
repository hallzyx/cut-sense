/**
 * Inline SVG illustrations for the landing page (design/landing/LANDING.md).
 * They are drawings, labelled as such on the page; no real plan is computed here.
 */
import type { CSSProperties, ReactNode } from 'react';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Shared <defs>: piece patterns (same colour + pattern + letter rule as the app), defect tape, leftover hatch. */
export function LandingDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="lp-pat-a" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#F5B800" /></pattern>
        <pattern id="lp-pat-b" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#4FC3F7" /><rect width="1.8" height="6" fill="rgba(11,15,13,.55)" /></pattern>
        <pattern id="lp-pat-c" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#F2609E" /><circle cx="3.5" cy="3.5" r="1.5" fill="rgba(11,15,13,.6)" /></pattern>
        <pattern id="lp-pat-d" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#1FB5A0" /><path d="M0 0L7 7M7 0L0 7" stroke="rgba(11,15,13,.55)" strokeWidth="1.1" /></pattern>
        <pattern id="lp-pat-e" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#A07CFF" /><rect width="6" height="1.8" fill="rgba(11,15,13,.55)" /></pattern>
        <pattern id="lp-pat-f" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#B5E61D" /><rect width="1.8" height="6" fill="rgba(11,15,13,.55)" /></pattern>
        <pattern id="lp-pat-defect" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="10" height="10" fill="#FFFFFF" fillOpacity=".9" /><rect width="5" height="10" fill="#FF3B30" /></pattern>
        <pattern id="lp-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2.2" height="7" fill="#1E5A43" fillOpacity=".55" /></pattern>
        <filter id="lp-leather" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4" result="n" /><feColorMatrix in="n" type="saturate" values="0" result="g" /><feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope=".28" /></feComponentTransfer><feComposite in="g2" in2="SourceGraphic" operator="in" result="t" /><feBlend in="SourceGraphic" in2="t" mode="multiply" /></filter>
        <filter id="lp-table" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .2" numOctaves="2" seed="9" result="n" /><feColorMatrix in="n" type="saturate" values="0" result="g" /><feComponentTransfer in="g" result="g2"><feFuncA type="linear" slope=".22" /></feComponentTransfer><feComposite in="g2" in2="SourceGraphic" operator="in" result="t" /><feBlend in="SourceGraphic" in2="t" mode="multiply" /></filter>
        <radialGradient id="lp-vignette" cx="50%" cy="45%" r="75%"><stop offset="60%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".28" /></radialGradient>
        <path id="lp-seal-ring" d="M60 60m-38 0a38 38 0 1 1 76 0a38 38 0 1 1 -76 0" />
      </defs>
    </svg>
  );
}

const SEAL_TEETH = 'M117 60L112.17 65.88L115.57 72.68L109.55 77.34L111.36 84.73L104.45 87.93L104.56 95.54L97.12 97.12L95.54 104.56L87.93 104.45L84.73 111.36L77.34 109.55L72.68 115.57L65.88 112.17L60 117L54.12 112.17L47.32 115.57L42.66 109.55L35.27 111.36L32.07 104.45L24.46 104.56L22.88 97.12L15.44 95.54L15.55 87.93L8.64 84.73L10.45 77.34L4.43 72.68L7.83 65.88L3 60L7.83 54.12L4.43 47.32L10.45 42.66L8.64 35.27L15.55 32.07L15.44 24.46L22.88 22.88L24.46 15.44L32.07 15.55L35.27 8.64L42.66 10.45L47.32 4.43L54.12 7.83L60 3L65.88 7.83L72.68 4.43L77.34 10.45L84.73 8.64L87.93 15.55L95.54 15.44L97.12 22.88L104.56 24.46L104.45 32.07L111.36 35.27L109.55 42.66L115.57 47.32L112.17 54.12Z';

/** The toothed "verified" rosette. Decorative unless a label is given. */
export function Seal({ className = '', label }: { className?: string; label?: string }) {
  return (
    <div className={`cs-seal ${className}`} {...(label ? {} : { 'aria-hidden': true })}>
      <svg viewBox="0 0 120 120" {...(label ? { role: 'img', 'aria-label': label } : { focusable: 'false' })}>
        <g transform="rotate(-10 60 60)">
          <path d={SEAL_TEETH} fill="var(--cs-verified-solid)" />
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--cs-surface)" strokeWidth="1.6" strokeDasharray="3.2 2.6" />
          <text fontFamily="JetBrains Mono, monospace" fontSize="10" fontWeight="700" fill="var(--cs-surface)">
            <textPath href="#lp-seal-ring" textLength="236" lengthAdjust="spacing">VERIFIED · GEOMETRY · PLAN ·</textPath>
          </text>
          <circle cx="60" cy="60" r="27" fill="var(--cs-surface)" />
          <path d="M47.5 61l8.5 8.5 17.5-18.5" fill="none" stroke="var(--cs-verified-solid)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

/* ---------- Hero: an illustrated verified plan on a dark leather offcut ---------- */
const HERO_EDGE = 'M70,90 C120,40 260,50 330,60 C410,70 500,40 545,95 C580,140 560,220 570,290 C578,350 520,385 450,380 C380,375 330,395 250,388 C170,382 90,392 62,330 C40,280 70,230 55,170 C48,135 50,110 70,90 Z';
const HERO_DEFECT = 'M300,195 Q330,172 362,198 Q380,230 350,252 Q318,264 300,240 Q286,215 300,195Z';
const HERO_PIECES: [string, string, string, number, number][] = [
  ['M95,95h150v95h-150z', 'a', 'A1', 170, 142],
  ['M95,200h150v95h-150z', 'a', 'A2', 170, 247],
  ['M258,86h70v50h-70z', 'b', 'B1', 293, 111],
  ['M336,86h70v50h-70z', 'b', 'B2', 371, 111],
  ['M414,86h70v50h-70z', 'b', 'B3', 449, 111],
  ['M258,144h70v40h-70z', 'b', 'B4', 293, 164],
  ['M482,150h58a12,12 0 0 1 12,12v86a12,12 0 0 1 -12,12h-58a12,12 0 0 1 -12,-12v-86a12,12 0 0 1 12,-12z', 'c', 'C1', 511, 205],
  ['M262,300h118l-20,62h-78z', 'd', 'D1', 321, 331],
  ['M100,305h90v26h-50v36h-40z', 'e', 'E1', 128, 328],
  ['M395,290h62v58h-62z', 'f', 'F1', 426, 319],
];

export function HeroPlan() {
  return (
    <svg viewBox="0 0 600 420" width="600" height="420" role="img" aria-labelledby="lp-hero-art-t">
      <title id="lp-hero-art-t">Illustration of a verified plan: ten patterned pieces placed on a dark leather offcut, clear of a marked defect, inside a green verified outline.</title>
      <rect width="600" height="420" fill="#2A211B" filter="url(#lp-table)" />
      <path d={HERO_EDGE} fill="#141210" filter="url(#lp-leather)" />
      <path d={HERO_EDGE} fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="3" transform="translate(2,4)" />
      <path d="M180,180 q40,-20 90,10" stroke="#2c2622" strokeWidth="3" fill="none" />
      <rect width="600" height="420" fill="url(#lp-vignette)" />
      <path d={HERO_EDGE} fill="none" stroke="rgba(255,255,255,.78)" strokeWidth="8" strokeLinejoin="round" />
      <path d={HERO_EDGE} fill="none" stroke="#0B0F0D" strokeWidth="5.5" strokeLinejoin="round" />
      <path d={HERO_EDGE} fill="none" stroke="#5BD69A" strokeWidth="3" strokeLinejoin="round" />
      <path d={HERO_DEFECT} fill="url(#lp-pat-defect)" />
      <path d={HERO_DEFECT} fill="none" stroke="rgba(255,255,255,.78)" strokeWidth="7" strokeLinejoin="round" strokeDasharray="6 4" />
      <path d={HERO_DEFECT} fill="none" stroke="#0B0F0D" strokeWidth="4.5" strokeLinejoin="round" strokeDasharray="6 4" />
      <path d={HERO_DEFECT} fill="none" stroke="#FF3B30" strokeWidth="2" strokeLinejoin="round" strokeDasharray="6 4" />
      {HERO_PIECES.map(([d, pat, label, x, y], i) => (
        <g className="cs-anim-settle" style={{ '--i': i } as Vars} key={label}>
          <path d={d} fill="none" stroke="rgba(255,255,255,.8)" strokeWidth="4.5" />
          <path d={d} fill={`url(#lp-pat-${pat})`} stroke="#0B0F0D" strokeWidth="1.6" />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily="JetBrains Mono, monospace" fontWeight="700" fontSize="15" fill="#0B0F0D" stroke="#fff" strokeWidth="4" paintOrder="stroke" strokeLinejoin="round">{label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- The leftover loop: three generations drawn at one scale (6 px = 1 cm) ---------- */
function Ruler({ y, x0 = 0 }: { y: number; x0?: number }) {
  const ticks = Array.from({ length: 11 }, (_, i) => x0 + i * 6);
  return (
    <g className="lp-art__ruler" aria-hidden="true">
      <path d={`M${x0},${y}H${x0 + 60}`} />
      {ticks.map((x, i) => <path key={i} d={`M${x},${y}v-${i % 5 === 0 ? 6 : 3}`} />)}
      <text x={x0 + 63.6} y={y + 1}>10 cm</text>
    </g>
  );
}

type Piece = { k: 'rect'; x: number; y: number; w: number; h: number; pat: string; l: string } | { k: 'circle'; cx: number; cy: number; r: number; pat: string; l: string } | { k: 'path'; d: string; pat: string; l: string; lx: number; ly: number };

function ArtPieces({ pieces }: { pieces: Piece[] }) {
  return (
    <>
      {pieces.map((p, i) => {
        const fill = `url(#lp-pat-${p.pat})`;
        let shape: ReactNode; let lx: number; let ly: number;
        if (p.k === 'rect') { shape = <rect className="lp-art__piece" fill={fill} x={p.x} y={p.y} width={p.w} height={p.h} rx="3" />; lx = p.x + p.w / 2; ly = p.y + p.h / 2; }
        else if (p.k === 'circle') { shape = <circle className="lp-art__piece" fill={fill} cx={p.cx} cy={p.cy} r={p.r} />; lx = p.cx; ly = p.cy; }
        else { shape = <path className="lp-art__piece" fill={fill} d={p.d} />; lx = p.lx; ly = p.ly; }
        return <g className="cs-anim-settle" style={{ '--i': i } as Vars} key={i}>{shape}<text className="lp-art__label" x={lx} y={ly}>{p.l}</text></g>;
      })}
    </>
  );
}

const GEN1_EDGE = 'M18,24L84,9L168,15L240,6L300,21L324,66L318,126L330,180L300,216L216,213L132,222L60,213L21,186L9,120L15,66Z';
const GEN1: Piece[] = [
  { k: 'rect', x: 27, y: 30, w: 111, h: 57, pat: 'a', l: 'A' },
  { k: 'rect', x: 27, y: 89.4, w: 102, h: 48, pat: 'b', l: 'B' },
  { k: 'rect', x: 140.4, y: 30, w: 51, h: 33, pat: 'c', l: 'C' },
  { k: 'rect', x: 140.4, y: 65.4, w: 51, h: 33, pat: 'c', l: 'C' },
  { k: 'rect', x: 140.4, y: 100.8, w: 51, h: 33, pat: 'c', l: 'C' },
  { k: 'rect', x: 78.6, y: 139.8, w: 51, h: 33, pat: 'c', l: 'C' },
  { k: 'path', d: 'M27,181.8L75,181.8L65.4,139.8L36.6,139.8Z', pat: 'd', l: 'D', lx: 51, ly: 160.8 },
];
const GEN2_EDGE = 'M4.9,129L0,90L15,30L60,6L120,12L174,0L210,30L207,114L208.6,129Z';
const GEN2: Piece[] = [
  { k: 'circle', cx: 30, cy: 90, r: 27, pat: 'e', l: 'E' },
  { k: 'circle', cx: 57, cy: 40.5, r: 27, pat: 'e', l: 'E' },
  { k: 'circle', cx: 85.5, cy: 96, r: 27, pat: 'e', l: 'E' },
  { k: 'circle', cx: 112.5, cy: 46.5, r: 27, pat: 'e', l: 'E' },
];
const GEN3_EDGE = 'M6.9,66.9L0,36L30,0L114,3L129,1.4L129,66.9Z';
const GEN3: Piece[] = [
  { k: 'rect', x: 30, y: 3.6, w: 42, h: 18, pat: 'f', l: 'F' },
  { k: 'rect', x: 74.4, y: 4.8, w: 42, h: 18, pat: 'f', l: 'F' },
  { k: 'rect', x: 13.2, y: 24, w: 42, h: 18, pat: 'f', l: 'F' },
  { k: 'rect', x: 57.6, y: 25.2, w: 42, h: 18, pat: 'f', l: 'F' },
];

function Material({ d }: { d: string }) {
  return <><path className="lp-art__material" d={d} /><path className="lp-art__leftover" d={d} /></>;
}

export function Gen1Art() {
  return (
    <svg className="lp-art" viewBox="-3 -6 345 258" aria-hidden="true" focusable="false">
      <Material d={GEN1_EDGE} />
      <circle className="lp-art__defect" cx="165" cy="177" r="13.2" />
      <ArtPieces pieces={GEN1} />
      <path className="lp-art__frag" pathLength="100" d="M201,10.9L240,6L300,21L324,66L318,126L330,180L300,216L216,213L201,214.6Z" />
      <Ruler y={235.2} x0={9} />
    </svg>
  );
}

export function Gen2Art() {
  return (
    <svg className="lp-art" viewBox="-12 -12 234 171" aria-hidden="true" focusable="false">
      <Material d={GEN2_EDGE} />
      <ArtPieces pieces={GEN2} />
      <path className="lp-art__frag" pathLength="100" d="M143.1,6.9L174,0L210,30L207,114L208.6,129L143.1,129Z" />
      <Ruler y={142.2} />
    </svg>
  );
}

export function Gen3Art() {
  return (
    <svg className="lp-art" viewBox="-12 -12 153 108.9" aria-hidden="true" focusable="false">
      <Material d={GEN3_EDGE} />
      <ArtPieces pieces={GEN3} />
      <Ruler y={80.1} />
    </svg>
  );
}

export function Hop({ children }: { children: ReactNode }) {
  return (
    <>
      <svg className="lp-hop__v" viewBox="0 0 22 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M11 2v36" strokeDasharray="4 4" /><path d="M5 33l6 8 6-8" /></svg>
      <svg className="lp-hop__h" viewBox="0 0 64 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 11h56" strokeDasharray="4 4" /><path d="M53 5l8 6-8 6" /></svg>
      <span>{children}</span>
    </>
  );
}

/* ---------- Verifier check glyphs ---------- */
export function CheckGlyph({ kind }: { kind: 'overlap' | 'inside' | 'defect' | 'spacing' }) {
  return (
    <svg viewBox="0 0 64 48" aria-hidden="true" focusable="false">
      {kind === 'overlap' && <><rect className="lp-glyph__piece" x="6" y="12" width="22" height="24" rx="2" /><rect className="lp-glyph__piece" x="34" y="12" width="22" height="24" rx="2" /><path className="lp-glyph__ok" d="M24 41l4 4 8-8" transform="translate(4 -2)" /></>}
      {kind === 'inside' && <><path className="lp-glyph__ink" d="M6 14C14 4 40 6 54 8 61 12 60 26 58 36 52 44 22 44 10 40 3 34 2 22 6 14Z" /><rect className="lp-glyph__piece" x="18" y="16" width="26" height="16" rx="2" /></>}
      {kind === 'defect' && <><circle className="lp-glyph__defect" cx="18" cy="24" r="11" /><rect className="lp-glyph__piece" x="36" y="12" width="22" height="24" rx="2" /></>}
      {kind === 'spacing' && <><rect className="lp-glyph__piece" x="4" y="12" width="22" height="24" rx="2" /><rect className="lp-glyph__piece" x="38" y="12" width="22" height="24" rx="2" /><path className="lp-glyph__dim" d="M26 24h12M29 21l-3 3 3 3M35 21l3 3-3 3M26 6v4M38 6v4" /></>}
    </svg>
  );
}

/* ---------- 1:1 print tiling ---------- */
export function PrintTiling() {
  const marks = [
    'M154,36v-6h6M282,36v-6h-6M154,112v6h6M282,112v6h-6',
    'M280,36v-6h6M408,36v-6h-6M280,112v6h6M408,112v6h-6',
    'M154,122v-6h6M282,122v-6h-6M154,198v6h6M282,198v6h-6',
    'M280,122v-6h6M408,122v-6h-6M280,198v6h6M408,198v6h-6',
  ];
  const pieces: [string, string][] = [
    ['M178,56h70v40h-70z', 'a'], ['M256,52h44v30h-44z', 'b'], ['M306,50h44v30h-44z', 'b'], ['M356,58h30v52h-30z', 'c'],
    ['M178,104h70v40h-70z', 'a'], ['M258,134h70l-10,40h-50z', 'd'], ['M178,152h56v30h-56z', 'e'], ['M336,124h44v48h-44z', 'f'],
  ];
  return (
    <svg viewBox="0 0 430 226" role="img" aria-labelledby="lp-til-t">
      <title id="lp-til-t">Illustration of a 1:1 print: a cover page with a 5 by 5 cm check square and a 10 cm ruler, then the plan tiled across four sheets that overlap by 1 cm.</title>
      <g transform="translate(18,40) rotate(-3 48 68)">
        <rect className="lp-tile__sheet" width="96" height="136" rx="2" />
        <rect className="lp-tile__bar" x="10" y="12" width="60" height="6" />
        <rect className="lp-tile__bar" x="10" y="24" width="44" height="4" />
        <rect className="lp-tile__check" x="10" y="40" width="30" height="30" />
        <text className="lp-tile__text" x="44" y="58">5 × 5 cm</text>
        <path className="lp-tile__mark" d="M10,88h60M10,88v-6M16,88v-3M22,88v-3M28,88v-3M34,88v-3M40,88v-6M46,88v-3M52,88v-3M58,88v-3M64,88v-3M70,88v-6" />
        <text className="lp-tile__text" x="10" y="100">10 cm</text>
        <rect className="lp-tile__bar" x="10" y="110" width="70" height="4" />
        <rect className="lp-tile__bar" x="10" y="119" width="52" height="4" />
        <text className="lp-tile__text" x="10" y="8" dy="-2">PRINT AT 100 %</text>
      </g>
      <rect className="lp-tile__sheet" x="150" y="26" width="136" height="96" rx="1.5" />
      <rect className="lp-tile__sheet" x="276" y="26" width="136" height="96" rx="1.5" />
      <rect className="lp-tile__sheet" x="150" y="112" width="136" height="96" rx="1.5" />
      <rect className="lp-tile__sheet" x="276" y="112" width="136" height="96" rx="1.5" />
      <rect className="lp-tile__overlap" x="276" y="26" width="10" height="182" />
      <rect className="lp-tile__overlap" x="150" y="112" width="262" height="10" />
      <path className="lp-tile__plan" d="M170,52 C200,34 280,40 330,40 C380,42 398,60 398,96 C398,130 404,160 390,180 C370,198 300,194 250,196 C200,198 168,194 162,170 C156,140 166,120 160,96 C156,74 158,62 170,52Z" />
      {pieces.map(([d, pat], i) => <path key={i} className="lp-tile__piece" d={d} fill={`url(#lp-pat-${pat})`} />)}
      {marks.map((d, i) => <path key={i} className="lp-tile__mark" d={d} />)}
      <text className="lp-tile__text" x="156" y="116" dy="-1">1·1</text>
      <text className="lp-tile__text" x="282" y="116" dy="-1">1·2</text>
      <text className="lp-tile__text" x="156" y="202" dy="-1">2·1</text>
      <text className="lp-tile__text" x="282" y="202" dy="-1">2·2</text>
    </svg>
  );
}

/* ---------- Small icons ---------- */
export const Icon = {
  camera: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  sun: <svg className="lp-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg className="lp-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>,
  alert: <svg className="cs-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></svg>,
  warn: <svg className="cs-alert__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></svg>,
  bench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>,
  lock: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>,
};
