import { useState } from 'react';
import Home from './components/Home';
import Workspace from './components/Workspace';
import { EXAMPLES } from './lib/examples';
import { loadImage } from './lib/mask';
import { KITS } from './lib/kits';
import { defaultDefs, emptyProject, kitToDefs, type Project } from './state';

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function readFile(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('No se pudo leer el archivo.'));
    r.readAsDataURL(f);
  });
}

export default function App() {
  const [p, setP] = useState<Project>(emptyProject());
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  const start = (image: NonNullable<Project['image']>, calib: Project['calib'] = null, kitId?: string) => {
    const kit = KITS.find((k) => k.id === kitId);
    setP({ ...emptyProject(), image, calib, defs: kit ? kitToDefs(kit) : defaultDefs() });
    setKey((k) => k + 1);
    setError(null);
  };

  const onExample = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id)!;
    start({ src: ex.src, w: ex.w, h: ex.h, name: ex.title, exampleId: ex.id }, ex.calib ?? null, ex.kitId);
  };

  const onFile = async (f: File) => {
    if (!OK_TYPES.includes(f.type)) return setError('Formato no admitido. Usa JPG, PNG o WebP.');
    if (f.size > MAX_BYTES) return setError(`El archivo pesa ${(f.size / 1048576).toFixed(1)} MB; el límite es 10 MB.`);
    try {
      const src = await readFile(f);
      const im = await loadImage(src); // falla si el archivo está corrupto
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      if (k === 1) return start({ src, w: im.naturalWidth, h: im.naturalHeight, name: f.name });
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      start({ src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height, name: f.name });
    } catch (e) {
      setError(`No se pudo abrir la imagen: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className="nav">
        <div className="container nav-in">
          <a className="logo" href="/" onClick={(e) => { if (p.image) { e.preventDefault(); if (confirm('¿Volver al inicio? Se perderán los cambios no guardados.')) setP(emptyProject()); } }}>
            <span className="logo-mark" aria-hidden="true" />CutSense
          </a>
          <span className="nav-note">Asistente de preparación de cortes</span>
          {p.image && <button className="btn primary xs" onClick={() => { if (confirm('¿Descartar el proyecto actual?')) setP(emptyProject()); }}>Nuevo proyecto</button>}
        </div>
      </header>
      <main>
        {p.image
          ? <Workspace key={key} p={p} setP={setP} onReset={() => setP(emptyProject())} />
          : <Home onFile={onFile} onExample={onExample} error={error} />}
      </main>
    </>
  );
}
