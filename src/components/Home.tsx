import { useRef, useState } from 'react';
import { EXAMPLES } from '../lib/examples';

interface Props {
  onFile: (f: File) => void;
  onExample: (id: string) => void;
  error: string | null;
}

const FAQ = [
  ['¿Garantiza el óptimo matemático?', 'No. Mostramos la mejor solución encontrada por una búsqueda heurística, verificada geométricamente. No es un óptimo demostrado.'],
  ['¿Las medidas son físicas?', 'Solo si calibras con una longitud de referencia. Sin calibración trabajamos en unidades relativas (1 u = 1 % del ancho de la foto) y lo indicamos en pantalla y en el archivo exportado.'],
  ['¿Qué pasa con mi fotografía?', 'Para la segmentación con SAM la imagen se envía al servicio de inferencia a través de nuestro servidor. Si el servicio no está disponible, puedes usar un contorno local o trazarlo a mano. Los proyectos son efímeros: no se guardan.'],
  ['¿Detecta defectos automáticamente?', 'No en esta versión. Los defectos los marcas tú; el optimizador garantiza que ninguna pieza los invada.'],
];

export default function Home({ onFile, onExample, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(0);
  return (
    <>
      <section className="band mint hero">
        <div className="container hero-grid">
          <div>
            <p className="eyebrow">Sentido de corte</p>
            <h1 className="display">Dale sentido a cada <span className="hl">retazo</span>.</h1>
            <p className="lead">Fotografía tu retazo. La IA propone el contorno, tú lo corriges, y la geometría verifica cada plano antes de mostrártelo.</p>
            <div className="cta-row">
              <button className="btn primary" onClick={() => input.current?.click()}>Subir fotografía</button>
              <button className="btn green" onClick={() => onExample(EXAMPLES[0].id)}>Probar con un ejemplo</button>
              <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Subir imagen JPG, PNG o WebP"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            </div>
            {error && <p className="alert error" role="alert">{error}</p>}
            <div className="provenance" aria-label="Quién hace qué">
              <span className="chip ai">La IA propone</span>
              <span className="chip human">Tú corriges</span>
              <span className="chip computed">El motor calcula</span>
              <span className="chip verified">La geometría verifica</span>
            </div>
            <p className="caption">JPG, PNG o WebP · hasta 10 MB · material plano, fondo contrastante, luz uniforme y cámara cenital.</p>
          </div>
          <div className="video-card" aria-hidden="true">
            <img src={EXAMPLES[0].src} alt="" />
            <span className="chip">Ejemplo</span>
          </div>
        </div>
      </section>

      <section className="band white">
        <div className="container">
          <h2 className="h2">Cómo funciona</h2>
          <div className="grid3">
            {[
              ['1', 'Digitaliza', 'SAM 3.1 propone una máscara del material. Aceptas, rechazas o la editas punto a punto.'],
              ['2', 'Restringe', 'Marca zonas que no se pueden cortar, calibra la escala si quieres medidas físicas y define tus piezas.'],
              ['3', 'Optimiza', 'El motor geométrico coloca las piezas; un verificador independiente valida cada plano antes de mostrarlo.'],
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
          <h2 className="h2">Elige un ejemplo</h2>
          <p className="lead">Imágenes de demostración identificadas como ejemplos. El flujo usa la misma lógica que una foto propia.</p>
          <div className="grid2">
            {EXAMPLES.map((ex) => (
              <article className="feature-card example" key={ex.id}>
                <img src={ex.src} alt={`Vista previa: ${ex.title}`} />
                <h3 className="h4">{ex.title}</h3>
                <p>{ex.blurb}</p>
                <button className="btn primary sm" onClick={() => onExample(ex.id)}>Usar este ejemplo</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="band white">
        <div className="container narrow">
          <h2 className="h2">Preguntas honestas</h2>
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
          <p className="quote">«La IA propone la forma; el verificador geométrico decide si un plano es válido.»</p>
          <p className="caption light">Principio de producto #1 de CutSense</p>
        </div>
      </section>

      <footer className="footer">
        <div className="container">CutSense · Los planos exportados son referenciales y no sustituyen instrucciones certificadas para maquinaria.</div>
      </footer>
    </>
  );
}
