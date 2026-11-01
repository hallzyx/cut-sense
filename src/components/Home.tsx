import { useRef, useState } from 'react';
import { EXAMPLES } from '../lib/examples';

interface Props {
  onFile: (f: File) => void;
  onExample: (id: string) => void;
  onOpenProject: (f: File) => void;
  error: string | null;
}

const FAQ = [
  ['Does it guarantee the mathematical optimum?', 'No. We show the best solution a heuristic search found, geometrically verified. It is not a proven optimum.'],
  ['Are the measurements physical?', 'Only if you calibrate with a reference length. Without calibration we work in relative units (1 u = 1% of the photo width) and say so on screen and in the exported file.'],
  ['What happens to my photo?', 'For SAM segmentation the image is sent to the inference service through our server. If the service is unavailable, you can use a local outline or trace it by hand. Projects are ephemeral: nothing is stored.'],
  ['Does it detect defects automatically?', 'Not in this version. You mark the defects; the optimizer guarantees no piece overlaps them.'],
];

export default function Home({ onFile, onExample, onOpenProject, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="band mint hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Sense of the cut</p>
            <h1 className="display">Make sense of every <span className="hl">offcut</span>.</h1>
            <p className="lead">Photograph your offcut. AI proposes the outline, you correct it, and geometry verifies every plan before showing it to you.</p>
            <div className="cta-row">
              <button className="btn primary" onClick={() => input.current?.click()}>Upload a photo</button>
              <button className="btn green" onClick={() => onExample(EXAMPLES[0].id)}>Try an example</button>
              <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Upload a JPG, PNG or WebP image"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            </div>
            <p className="caption"><button className="link" onClick={() => projectInput.current?.click()}>Open a saved project (.json)</button></p>
            <input ref={projectInput} type="file" hidden accept="application/json,.json" aria-label="Open saved project"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onOpenProject(f); e.target.value = ''; }} />
            {error && <p className="alert error" role="alert">{error}</p>}
            <p className="caption">JPG, PNG or WebP · up to 10 MB · flat material, contrasting background, even light and an overhead camera.</p>
          </div>
          <div className="video-card" aria-hidden="true">
            <img src={EXAMPLES[0].src} alt="" />
            <span className="chip">Example</span>
          </div>
        </div>
      </section>

      <section className="band white">
        <div className="container">
          <h2 className="h2">How it works</h2>
          <div className="grid3">
            {[
              ['1', 'Digitize', 'SAM 3.1 proposes a mask of the material. Accept it, reject it or edit it point by point.'],
              ['2', 'Constrain', 'Mark zones that cannot be cut, calibrate the scale if you want physical measurements and define your pieces.'],
              ['3', 'Optimize', 'The geometry engine places the pieces; an independent verifier validates every plan before showing it.'],
            ].map(([n, t, d]) => (
              <article className="feature-card" key={n}>
                <span className="score-ring">{n}</span>
                <h3 className="h4">{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band mint">
        <div className="container">
          <h2 className="h2">Pick an example</h2>
          <p className="lead">Demo images, labeled as examples. The flow uses the same logic as your own photo.</p>
          <div className="grid2">
            {EXAMPLES.map((ex) => (
              <article className="feature-card example" key={ex.id}>
                <img src={ex.src} alt={`Preview: ${ex.title}`} />
                <h3 className="h4">{ex.title}</h3>
                <p>{ex.blurb}</p>
                <button className="btn primary sm" onClick={() => onExample(ex.id)}>Use this example</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band white">
        <div className="container narrow">
          <h2 className="h2">Honest questions</h2>
          {FAQ.map(([q, a], i) => (
            <div className="faq" key={q}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <span>{q}</span><b aria-hidden="true">{open === i ? '−' : '+'}</b>
              </button>
              {open === i && <p>{a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="band black">
        <div className="container narrow center">
          <p className="quote">“AI proposes the shape; the geometric verifier decides whether a plan is valid.”</p>
          <p className="caption light">CutSense product principle #1</p>
        </div>
      </section>

      <footer className="footer">
        <div className="container">CutSense · Exported plans are for reference and do not replace certified machinery instructions.</div>
      </footer>
    </>
  );
}
