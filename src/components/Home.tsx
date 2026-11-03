import { useEffect, useRef, type CSSProperties } from 'react';
import { EXAMPLES } from '../lib/examples';
import { OPTIMIZER_VERSION } from '../engine/optimize';
import { Logo } from './Logo';
import { CheckGlyph, Gen1Art, Gen2Art, Gen3Art, HeroPlan, Hop, Icon, LandingDefs, PrintTiling, Seal } from './landing/art';
import walletLight from '../../docs/3d-preview/billetera.webp';
import walletDark from '../../docs/3d-preview/billetera-dark.webp';

/* The landing page: "The life of an offcut" (design/landing/LANDING.md). */

interface Props {
  onFile: (f: File) => void;
  onExample: (id: string) => void;
  onOpenProject: (f: File) => void;
  error: string | null;
  isDark: boolean;
  onTheme: () => void;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

/** Real screenshots of the app (public/landing), one per theme. */
const shot = (name: string, dark: boolean) => `${import.meta.env.BASE_URL}landing/${name}-${dark ? 'dark' : 'light'}.webp`;

const STEPS = [
  {
    kind: 'ai', pill: 'AI proposal · SAM 3.1', title: 'Photograph it. AI traces the edge.', img: 'how-1-outline',
    body: 'Lay the offcut flat on a contrasting background and shoot from above. SAM 3.1 proposes the edge as a dashed line, and holes as zones to avoid. Accept it, move any point, or trace it by hand. No AI available? Outline by contrast instead.',
    alt: 'CutSense, step 1: a leather offcut with a dashed blue outline proposed by AI, and the panel asking “Is this the edge of your material?” with an Accept outline button.',
    caption: 'The outline is a proposal until you accept it.',
  },
  {
    kind: 'human', pill: 'Corrected by you', title: 'Mark the flaws. Set the scale.', img: 'how-2-zones',
    body: <>Mark scars, stains and holes so no piece lands on them, or ask SAM to look for them and keep only what is right. Then calibrate with a length you know, such as a bank card (<span className="cs-measure">8.56 cm</span>), to work in real centimetres.</>,
    alt: 'CutSense, step 2: the hole in the offcut is now a hatched excluded zone listed in the panel, and the scale is marked as calibrated in cm.',
    caption: 'Excluded zones carry a barrier-tape hatch, unlike any piece.',
  },
  {
    kind: 'computed', pill: 'Your order', title: 'Choose what to make.', img: 'how-3-pieces',
    body: <>Pick a kit (leather cardholder, bifold wallet), single pieces (keychains, coasters, bookmarks), shapes you draw or import, or pieces designed with Hilo. In <b>Complete sets</b> mode, CutSense looks for as many complete sets as fit. Partial sets never count.</>,
    alt: 'CutSense pieces list: the bifold wallet kit with outer, bill pocket, four card pockets and coin pocket, each with its size in centimetres, in Complete sets mode.',
    caption: 'Every piece type has a colour, a pattern and a letter.',
  },
  {
    kind: 'verified', pill: 'Verified', title: 'Get a plan that has been checked.', img: 'how-4-verified',
    body: 'A deterministic engine places the pieces. Then a separate verifier checks the whole plan: no overlaps, nothing outside the material, nothing on a defect, the spacing you asked for. Only a plan that passes is shown.',
    alt: 'CutSense, step 3: a verified plan with one complete bifold wallet on the offcut, clear of the excluded zone, with the occupied and usable areas and the seed of the run.',
    caption: 'Every number on this screen is measured from the final shapes.',
  },
  {
    kind: 'human', pill: 'You decide', title: 'Export it and cut.', img: 'how-5-export',
    body: 'Save the plan as SVG or PNG, print it at 1:1 across A4 or Letter sheets, or export SVG in centimetres and DXF for a cutter. Then plan the next product on what is left.',
    alt: 'CutSense export menu: SVG, PNG, print at real scale on A4 or Letter, SVG in centimetres and DXF for machines.',
    caption: 'Exports are made in your browser from the verified plan.',
  },
] as const;

const CHECKS = [
  ['overlap', 'No overlaps', 'No two pieces share any material.'],
  ['inside', 'Nothing outside the material', 'Every piece sits fully inside the outline you approved.'],
  ['defect', 'Nothing on a defect', 'No piece touches a zone you marked as excluded.'],
  ['spacing', 'The spacing you asked for', 'Measured edge to edge, between pieces and to the edge of the material.'],
] as const;

const FILES: [string, string, string, boolean][] = [
  ['SVG', 'Plan image', 'With or without the photo. Legend, seed and optimizer version included.', false],
  ['PNG', 'To share', 'The same plan, rendered at twice the resolution.', false],
  ['Print', 'At 1:1', 'Across A4 or Letter sheets, with a scale check you can measure.', true],
  ['SVG cm', 'Real scale', 'One unit is one centimetre, so it opens at 1:1 in a vector editor.', true],
  ['DXF', 'For machines', 'R12, millimetres, pieces on the CUT layer. Outline and zones as optional reference layers.', true],
];

const EXAMPLE_COPY: Record<string, { body: string; meta: string; cta: string; alt: string }> = {
  fieltro: {
    body: 'A concave edge, a hole and a stain, all visible. A good first run: outline, mark the flaws, then choose your pieces.',
    meta: 'Saved outline · relative units until you calibrate',
    cta: 'Start with the felt offcut',
    alt: 'Example photo: a teal felt offcut with a concave edge, a round hole and a dark stain, on a light background.',
  },
  cuero: {
    body: 'Set up for a bifold wallet, so you can go straight to a verified plan and see how many complete wallets fit.',
    meta: 'Assumed scale · 14 px = 1 cm · bifold wallet kit',
    cta: 'Start with the leather scrap',
    alt: 'Example photo: a brown leather scrap with a dark mark near the middle, on a light background.',
  },
};

const FAQ: [string, string][] = [
  ['Is the plan the mathematical optimum?', 'No, and we do not pretend it is. A bounded search looks for a layout that places as many pieces as it can, and the verifier checks that it is valid. Every plan carries its seed and optimizer version, so you can reproduce it.'],
  ['Are the measurements real?', 'Only after you calibrate, with the material’s real width or two points on a known length. Until then sizes are relative units, and both the screen and the exported files say so. A photo taken from straight above gives the most accurate scale.'],
  ['What happens to my photo?', 'When you use the AI outline, the photo is sent through our server to the segmentation service (SAM 3.1); our server does not store it. Projects stay in your browser and in files you choose to save. A saved project contains your photo, so treat it as private.'],
  ['Do I need an account, or AI at all?', 'No account. Without AI you can still outline by contrast or trace by hand, mark zones yourself, use the built-in kits and try the examples. The app tells you plainly when AI did not run.'],
  ['Which materials work best?', 'Flat sheets you cut by hand or by machine, such as leather, felt, foam and cardboard. Photograph one sheet at a time, flat, on a background that contrasts with it, in even light. Pieces turn in steps of 90°.'],
  ['Does it find the flaws for me?', 'It can help. Ask SAM to look for short phrases such as “scar, stain, hole”: it proposes zones, and nothing becomes an excluded zone until you accept it. You can always draw zones by hand.'],
  ['What if I change something after optimizing?', 'The plan is marked out of date and cannot be exported until you optimize again, so you never cut from a layout that no longer matches your material.'],
];

export default function Home({ onFile, onExample, onOpenProject, error, isDark, onTheme }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const loopSection = useRef<HTMLElement>(null);
  const loop = useRef<HTMLOListElement>(null);
  const upload = () => input.current?.click();
  const tryId = EXAMPLES.find((e) => e.id === 'cuero')?.id ?? EXAMPLES[0].id;

  // The leftover loop plays once when it scrolls into view; with reduced motion
  // (or no IntersectionObserver) everything stays in its final, static state.
  useEffect(() => {
    const sec = loopSection.current, list = loop.current;
    if (!sec || !list || typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    sec.classList.add('lp-motion');
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { list.classList.add('is-in'); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(list);
    return () => io.disconnect();
  }, []);

  const walletSrc = isDark ? walletDark : walletLight;

  return (
    <div className="cs-root lp-page">
      <LandingDefs />
      <a className="lp-skip" href="#main">Skip to content</a>

      <header className="lp-top">
        <div className="cs-container lp-top__in">
          <a className="lp-logo" href="#top" aria-label="CutSense, back to top"><Logo height={28} /></a>
          <nav className="lp-top__nav" aria-label="On this page">
            <a href="#how">How it works</a><a href="#leftover">Leftover</a><a href="#trust">Trust</a><a href="#hilo">Hilo</a><a href="#exports">Exports</a><a href="#faq">Good to know</a>
          </nav>
          <div className="lp-top__end">
            <button className="cs-btn cs-btn--ghost cs-btn--sm" type="button" onClick={() => projectInput.current?.click()} title="Open a saved project (.json)">Open project</button>
            <button className="cs-btn cs-btn--secondary cs-btn--sm lp-top__cta" type="button" onClick={upload}>Upload a photo</button>
            <button className="cs-btn cs-btn--ghost lp-theme" type="button" aria-pressed={isDark} aria-label="Dark theme" onClick={onTheme}>{isDark ? Icon.moon : Icon.sun}</button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* 1 · Hero */}
        <section className="lp-hero cs-grid-paper" id="top" aria-labelledby="lp-h1">
          <div className="cs-container lp-hero__grid">
            <div>
              <p className="cs-eyebrow">Sense of the cut</p>
              <h1 className="cs-display lp-hero__title" id="lp-h1">Make sense of every <span className="cs-chalk-underline">offcut</span>.</h1>
              <p className="cs-lead">Photograph a scrap of leather, felt, foam or cardboard. AI proposes the outline, you correct it, and an independent geometric check verifies every cutting plan before you see it. Then what is left becomes your next piece of material.</p>
              <div className="cs-btn-row cs-btn-row--stack lp-hero__ctas">
                <button className="cs-btn cs-btn--primary cs-btn--lg" type="button" onClick={upload}>{Icon.camera}Upload a photo of your offcut</button>
                <button className="cs-btn cs-btn--secondary cs-btn--lg" type="button" onClick={() => onExample(tryId)}>Try an example</button>
              </div>
              <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Upload a JPG, PNG or WebP photo of your offcut"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
              <input ref={projectInput} type="file" hidden accept="application/json,.json" aria-label="Open a saved CutSense project (.json)"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onOpenProject(f); e.target.value = ''; }} />
              <div className="lp-hero__aux">
                <p className="cs-caption">JPG, PNG or WebP · up to 10 MB · flat material, contrasting background, even light, overhead camera</p>
              </div>
              <div className="lp-hero__alert" role="alert">{error && (
                <div className="cs-alert cs-alert--danger">{Icon.alert}<span className="cs-alert__title">We could not open that file</span><span className="cs-alert__body">{error}</span></div>
              )}</div>
            </div>

            <figure className="lp-hero__visual">
              <div className="cs-stage">
                <HeroPlan />
                <div className="cs-stage__bar"><span className="cs-stage__tag lp-tag--verified">Verified</span></div>
              </div>
              <Seal className="cs-seal--animate lp-hero__seal" />
              <figcaption className="lp-ticket lp-hero__ticket">
                <span className="lp-ticket__k">Illustration</span>
                <span className="lp-ticket__v">10 of 10 pieces placed</span>
                <span className="lp-ticket__m">real plans carry seed + {OPTIMIZER_VERSION}</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 2 · How it works */}
        <section className="lp-sec" id="how" aria-labelledby="lp-how-h">
          <div className="cs-container">
            <header className="lp-head">
              <p className="cs-eyebrow"><span className="lp-num">01</span> How it works</p>
              <h2 className="cs-h2" id="lp-how-h">From a photo to a plan you can trust.</h2>
              <p className="cs-lead">Five steps at the bench. Each one tells you who did the work: the AI proposes, you correct, the engine computes, geometry verifies, and you decide.</p>
            </header>
            <ol className="lp-steps">
              {STEPS.map((s, i) => (
                <li className={`lp-step lp-step--${s.kind}`} key={s.img}>
                  <span className="lp-step__dot" aria-hidden="true">{i + 1}</span>
                  <div className="lp-step__text">
                    <span className={`cs-pill cs-pill--${s.kind}`}>{s.pill}</span>
                    <h3 className="cs-h3">{s.title}</h3>
                    <p className="lp-body">{s.body}</p>
                  </div>
                  <figure className="lp-shot">
                    <div className="lp-shot__frame">
                      <img src={shot(s.img, isDark)} width="1200" height="900" loading="lazy" decoding="async" alt={s.alt} />
                    </div>
                    {s.kind === 'verified' && <Seal />}
                    <figcaption className="cs-caption">{s.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 3 · The leftover loop (signature) */}
        <section className="lp-sec lp-mat cs-grid-paper" id="leftover" aria-labelledby="lp-loop-h" ref={loopSection}>
          <div className="cs-container">
            <header className="lp-head">
              <p className="cs-eyebrow"><span className="lp-num">02</span> The leftover loop</p>
              <h2 className="cs-h2" id="lp-loop-h">What is left is your next piece of material.</h2>
              <p className="cs-lead">A plan is not the end of an offcut. Plan another product on what is left, or photograph the real remnant after cutting, and start again. A second life for every offcut, and sometimes a third.</p>
            </header>

            <figure className="lp-loop-fig" aria-labelledby="lp-loop-cap">
              <p className="lp-sr" id="lp-loop-desc">Illustration in three stages. First life: a leather offcut with the seven pieces of a bifold wallet; the largest free area on the right is outlined in green. Second life: that area, turned on its side, becomes the material for four coasters; the free area at one end is outlined. Third life: that last area becomes the material for four keychains. All three are drawn at the same scale, so each generation is visibly smaller.</p>
              <ol className="lp-loop" aria-describedby="lp-loop-desc" ref={loop}>
                <li className="lp-gen" style={{ '--g': 0, '--w': 1 } as Vars}>
                  <div className="lp-gen__art"><Gen1Art /></div>
                  <div className="lp-ticket lp-ticket--flat"><span className="lp-ticket__k">1st life</span><span className="lp-ticket__v">Bifold wallet × 1</span><span className="lp-ticket__m">7 pieces · leather offcut</span></div>
                </li>
                <li className="lp-hop" style={{ '--g': 0.6 } as Vars} aria-hidden="true"><Hop>largest free fragment becomes the material</Hop></li>
                <li className="lp-gen" style={{ '--g': 1, '--w': 0.68 } as Vars}>
                  <div className="lp-gen__art"><Gen2Art /></div>
                  <div className="lp-ticket lp-ticket--flat"><span className="lp-ticket__k">2nd life</span><span className="lp-ticket__v">Coasters × 4</span><span className="lp-ticket__m">quantity you chose · 9 cm</span></div>
                </li>
                <li className="lp-hop" style={{ '--g': 1.6 } as Vars} aria-hidden="true"><Hop>and again</Hop></li>
                <li className="lp-gen" style={{ '--g': 2, '--w': 0.44 } as Vars}>
                  <div className="lp-gen__art"><Gen3Art /></div>
                  <div className="lp-ticket lp-ticket--flat"><span className="lp-ticket__k">3rd life</span><span className="lp-ticket__v">Keychains × 4</span><span className="lp-ticket__m">7 × 3 cm each</span></div>
                </li>
              </ol>
              <figcaption className="cs-caption lp-loop__note" id="lp-loop-cap">Illustration, not a computed plan. All three stages are drawn at the same scale; green hatching is the leftover.</figcaption>
            </figure>

            <div className="lp-ways">
              <article className="cs-card cs-card--stitched">
                <span className="cs-pill cs-pill--computed">Leftover-aware</span>
                <h3 className="cs-h3">It keeps the leftover in one piece.</h3>
                <p className="cs-body-sm lp-body">When two layouts place the same pieces just as well, CutSense picks the one that leaves the largest single free fragment. Less confetti, more material.</p>
              </article>
              <article className="cs-card">
                <span className="cs-pill cs-pill--human">You choose how many</span>
                <h3 className="cs-h3">Make another product on what is left.</h3>
                <p className="cs-body-sm lp-body">Pick a kit or a single piece and the quantity you want. It is planned around the pieces already placed, and the combined plan is verified again as a whole.</p>
              </article>
              <article className="cs-card">
                <span className="cs-pill cs-pill--ai">New photo</span>
                <h3 className="cs-h3">Photograph the real remnant.</h3>
                <p className="cs-body-sm lp-body">After cutting, take a photo of what is really left. A new project starts from it and keeps your pieces, so the next plan follows the real edge.</p>
              </article>
            </div>

            <div className="lp-proof">
              <figure className="lp-shot">
                <div className="lp-shot__frame">
                  <img src={shot('leftover-product', isDark)} width="1200" height="900" loading="lazy" decoding="async"
                    alt="CutSense Leftover tab: the leather scrap example after one bifold wallet, with four keychains added around the placed pieces, the hatched leftover and the remaining area in cm²." />
                </div>
              </figure>
              <div className="lp-proof__text">
                <span className="cs-pill cs-pill--verified">In the app</span>
                <h3 className="cs-h3">Four keychains on what a wallet left.</h3>
                <p className="cs-body-sm lp-body">The leather scrap example after one bifold wallet. In the Leftover tab, four keychains were added around the pieces already placed, and the combined plan was verified again before it was shown.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 4 · Why you can trust the plan */}
        <section className="lp-sec" id="trust" aria-labelledby="lp-trust-h">
          <div className="cs-container lp-trust">
            <div className="lp-trust__lead">
              <header className="lp-head lp-head--flush">
                <p className="cs-eyebrow"><span className="lp-num">03</span> Why you can trust the plan</p>
                <h2 className="cs-h2" id="lp-trust-h">AI helps you start. Geometry has the last word.</h2>
                <p className="cs-lead">AI proposes, deterministic code places and verifies, and you decide. Before a plan reaches your screen, a second, independent check measures it again.</p>
              </header>
              <Seal />
            </div>
            <div className="cs-card cs-card--stitched cs-card--notched">
              <h3 className="cs-card__title lp-checks__title">The verifier checks every plan for</h3>
              <ul className="lp-checks">
                {CHECKS.map(([k, t, d]) => (
                  <li className="lp-check" key={k}>
                    <CheckGlyph kind={k} />
                    <div><p className="cs-h4">{t}</p><p className="cs-caption">{d}</p></div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="cs-container">
            <div className="lp-facts">
              <article className="cs-card">
                <h3 className="cs-h4">Numbers from the geometry</h3>
                <p className="cs-body-sm lp-body">Occupied area, usable area, pieces placed and what did not fit are recomputed from the final shapes, not copied from the search.</p>
              </article>
              <article className="cs-card">
                <h3 className="cs-h4">Reproducible</h3>
                <p className="cs-body-sm lp-body">Every plan carries its seed and optimizer version (<span className="cs-mono">{OPTIMIZER_VERSION}</span>). Download the problem and solution as JSON: the same input and seed give the same plan.</p>
              </article>
              <article className="cs-card">
                <h3 className="cs-h4">Honest about limits</h3>
                <p className="cs-body-sm lp-body">The search is bounded. Its plan is checked, not proven to be the optimum, and the screen says so. Change anything afterwards and the plan is marked out of date.</p>
              </article>
            </div>
          </div>
        </section>

        {/* 5 · Hilo + 3D assembly preview */}
        <section className="lp-sec cs-grid-paper" id="hilo" aria-labelledby="lp-hilo-h">
          <div className="cs-container lp-hilo">
            <div className="lp-stack lp-stack--loose">
              <header className="lp-head lp-head--flush">
                <p className="cs-eyebrow"><span className="lp-num">04</span> Hilo, the AI pattern maker</p>
                <h2 className="cs-h2" id="lp-hilo-h">Not sure what to cut? Ask Hilo.</h2>
                <p className="cs-lead">Describe what you want to make, in words or with a sketch. Hilo asks one question at a time and proposes flat pieces with sizes in centimetres. Nothing is applied until you approve it, and then the pieces are placed and verified like any kit.</p>
              </header>
              <div className="lp-chat" role="group" aria-label="Example conversation with Hilo">
                <p className="lp-msg lp-msg--you"><span className="lp-sr">You: </span>I want a small bifold wallet for cards and a few notes.</p>
                <p className="lp-msg lp-msg--hilo"><span className="lp-msg__who">Hilo</span>A bifold wallet, then. How many card slots do you need?</p>
                <div className="cs-chip-group" aria-hidden="true">
                  <span className="cs-chip">2 slots</span><span className="cs-chip cs-chip--on">4 slots</span><span className="cs-chip">6 slots</span>
                </div>
                <div className="cs-card lp-proposal">
                  <div className="cs-section__head"><span className="cs-pill cs-pill--ai">AI proposal · Hilo</span><span className="cs-caption">7 pieces per set</span></div>
                  <ul className="lp-proposal__rows">
                    <li><span className="cs-swatch cs-swatch--a" data-letter="A" aria-hidden="true" /><span>Outer</span><span className="cs-measure">18.5 × 9.5 <small>cm</small> ×1</span></li>
                    <li><span className="cs-swatch cs-swatch--b" data-letter="B" aria-hidden="true" /><span>Bill pocket</span><span className="cs-measure">17 × 8 <small>cm</small> ×1</span></li>
                    <li><span className="cs-swatch cs-swatch--c" data-letter="C" aria-hidden="true" /><span>Card pocket</span><span className="cs-measure">8.5 × 5.5 <small>cm</small> ×4</span></li>
                    <li><span className="cs-swatch cs-swatch--d" data-letter="D" aria-hidden="true" /><span>Coin pocket</span><span className="cs-measure">8 × 7 <small>cm</small> ×1</span></li>
                  </ul>
                  <div className="cs-btn-row" aria-hidden="true"><span className="cs-btn cs-btn--primary cs-btn--sm">Approve pieces</span><span className="cs-btn cs-btn--ghost cs-btn--sm">Make it bigger</span></div>
                </div>
              </div>
              <p className="cs-caption">Approving needs a photo calibrated in cm. Your messages and sketches are sent to the AI model through our server, which keeps nothing.</p>
            </div>

            <figure className="lp-render">
              <div className="lp-render__stage">
                <div className="lp-quad lp-render__main" style={{ '--qx': 1, '--qy': 0 } as Vars}>
                  <span className="cs-stage__tag">Approximate assembled view</span>
                  <img src={walletSrc} width="1280" height="962" loading="lazy" decoding="async" alt="3D preview of the bifold wallet, opened, built from the proposed piece sizes." />
                </div>
                <div className="lp-quad lp-render__inset" style={{ '--qx': 0, '--qy': 0 } as Vars}>
                  <img src={walletSrc} width="1280" height="962" loading="lazy" decoding="async" alt="The same seven pieces laid out flat." />
                </div>
              </div>
              <figcaption className="cs-caption">Each proposal comes with a 3D assembly preview, checked before it is shown. It is an approximate view (uniform thickness, ideal folds) to see how the pieces go together, not a photo of the finished piece.</figcaption>
            </figure>
          </div>
        </section>

        {/* 6 · Exports */}
        <section className="lp-sec" id="exports" aria-labelledby="lp-exp-h">
          <div className="cs-container">
            <header className="lp-head">
              <p className="cs-eyebrow"><span className="lp-num">05</span> Exports</p>
              <h2 className="cs-h2" id="lp-exp-h">Ready for the bench, or the machine.</h2>
              <p className="cs-lead">Print the pieces at real size on the paper you already have, or send a DXF to a cutter. Every file is made in your browser from the verified plan.</p>
            </header>
            <div className="lp-exports">
              <figure className="lp-tiling cs-card">
                <PrintTiling />
                <figcaption className="cs-caption">1:1 print: a cover page with a <span className="cs-measure">5 × 5 cm</span> check square, the plan tiled across sheets with <span className="cs-measure">1 cm</span> overlap and corner marks, and a template for each piece.</figcaption>
              </figure>
              <div>
                <ul className="lp-files">
                  {FILES.map(([badge, name, desc, cm]) => (
                    <li className="lp-file" key={badge}>
                      <span className="cs-badge cs-badge--ink">{badge}</span>
                      <span className="lp-file__name">{name}{cm && <> <span className="cs-unit cs-unit--calibrated" title="Needs a calibrated photo">cm</span></>}</span>
                      <span className="cs-caption">{desc}</span>
                    </li>
                  ))}
                  <li className="lp-file"><span className="cs-badge">JSON</span><span className="lp-file__name">Project and problem</span><span className="cs-caption">Save the project to reopen it later, or download the exact problem and solution.</span></li>
                </ul>
                <p className="cs-caption lp-exports__note">Exports marked <span className="cs-unit cs-unit--calibrated lp-unit-sm">cm</span> need a photo calibrated in cm or mm.</p>
                <aside className="lp-note" aria-label="Before you cut">
                  <span className="lp-note__k">Before you cut</span>
                  <p><b>Exports are reference drawings.</b> Check one measurement on the real piece first. Accuracy depends on the calibration and a photo taken from straight above, and your machine decides kerf, speed and power.</p>
                </aside>
              </div>
            </div>
          </div>
        </section>

        {/* 7 · Examples */}
        <section className="lp-sec cs-grid-paper" id="examples" aria-labelledby="lp-ex-h">
          <div className="cs-container">
            <header className="lp-head">
              <p className="cs-eyebrow"><span className="lp-num">06</span> Examples</p>
              <h2 className="cs-h2" id="lp-ex-h">No offcut at hand? Start with ours.</h2>
              <p className="cs-lead">Two sample offcuts, labelled as examples. They go through the same steps as your own photo.</p>
            </header>
            <div className="lp-examples">
              {EXAMPLES.map((ex) => {
                const c = EXAMPLE_COPY[ex.id];
                return (
                  <article className="cs-card cs-card--notched lp-example" key={ex.id}>
                    <div className="lp-example__art">
                      <img src={ex.src} width={ex.w} height={ex.h} alt={c?.alt ?? `Example photo: ${ex.title}`} />
                      <span className="cs-stage__tag">Example</span>
                    </div>
                    <div className="lp-example__body">
                      <h3 className="cs-h3">{ex.title}</h3>
                      <p className="cs-body-sm lp-body">{c?.body ?? ex.blurb}</p>
                      {c && <p className="cs-caption cs-mono">{c.meta}</p>}
                      <button className="cs-btn cs-btn--secondary" type="button" onClick={() => onExample(ex.id)}>{c?.cta ?? 'Use this example'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* 8 · Good to know */}
        <section className="lp-sec" id="faq" aria-labelledby="lp-faq-h">
          <div className="cs-container lp-faq-wrap">
            <header className="lp-head">
              <p className="cs-eyebrow"><span className="lp-num">07</span> Good to know</p>
              <h2 className="cs-h2" id="lp-faq-h">Straight answers.</h2>
              <p className="cs-body-sm lp-body">What CutSense does, what it does not, and where your photo goes.</p>
            </header>
            <div className="lp-faq">
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* 9 · Footer */}
      <footer className="lp-foot">
        <div className="cs-container">
          <div className="lp-foot__grid">
            <div className="lp-foot__brand">
              <span className="lp-logo"><Logo height={28} /></span>
              <p className="cs-body-sm lp-body">Make sense of every offcut.</p>
            </div>
            <div className="lp-foot__notes">
              <p>{Icon.bench}<span><b>Reference plans.</b> Exported plans are reference drawings: check one measurement before cutting.</span></p>
              <p>{Icon.lock}<span><b>Private by design.</b> No accounts and no cloud storage: projects live in your browser and in files you save. When you use the AI outline, your photo is sent to the segmentation service through our server.</span></p>
            </div>
          </div>
          <div className="lp-foot__base">
            <span className="cs-caption cs-mono">Optimizer {OPTIMIZER_VERSION} · light and dark · keyboard accessible</span>
            <a className="cs-link cs-body-sm" href="#top">Back to top</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
