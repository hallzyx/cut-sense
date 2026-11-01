import { useEffect, useState } from 'react';
import { Logo, LogoMark } from './components/Logo';
import Home from './components/Home';
import Workspace from './components/Workspace';
import { EXAMPLES } from './lib/examples';
import { loadImage } from './lib/mask';
import { KITS } from './lib/kits';
import { MAX_FILE_BYTES, parseProjectFile, type LoadedProject } from './lib/projectFile';
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
  const [restored, setRestored] = useState<LoadedProject | null>(null);
  // Hueco de la cabecera donde el espacio de trabajo pone sus pasos y el menú «Proyecto».
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try { const t = localStorage.getItem('cs-theme'); return t === 'light' || t === 'dark' ? t : null; } catch { return null; }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
    try { if (theme) localStorage.setItem('cs-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const isDark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;

  const start = (image: NonNullable<Project['image']>, calib: Project['calib'] = null, kitId?: string, keep?: { defs: Project['defs']; spacing: number }) => {
    const kit = KITS.find((k) => k.id === kitId);
    setP({ ...emptyProject(), image, calib, defs: keep?.defs ?? (kit ? kitToDefs(kit) : image.exampleId ? defaultDefs() : []), spacing: keep?.spacing ?? 0, fill: keep || kit ? 'maxKits' : 'fixed' });
    setKey((k) => k + 1);
    setRestored(null);
    setError(null);
  };

  const onOpenProject = async (f: File) => {
    if (f.size > MAX_FILE_BYTES) return setError('El archivo es demasiado grande para ser un proyecto de CutSense.');
    try {
      const loaded = parseProjectFile(await f.text());
      setP(loaded.project);
      setRestored(loaded);
      setKey((k) => k + 1);
      setError(null);
    } catch (e) { setError((e as Error).message); }
  };

  const onExample = (id: string) => {
    const ex = EXAMPLES.find((e) => e.id === id)!;
    start({ src: ex.src, w: ex.w, h: ex.h, name: ex.title, exampleId: ex.id }, ex.calib ?? null, ex.kitId);
  };

  const onFile = async (f: File, keep?: { defs: Project['defs']; spacing: number }) => {
    if (!OK_TYPES.includes(f.type)) return setError('Formato no admitido. Usa JPG, PNG o WebP.');
    if (f.size > MAX_BYTES) return setError(`El archivo pesa ${(f.size / 1048576).toFixed(1)} MB; el límite es 10 MB.`);
    try {
      const src = await readFile(f);
      const im = await loadImage(src); // falla si el archivo está corrupto
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      if (k === 1) return start({ src, w: im.naturalWidth, h: im.naturalHeight, name: f.name }, null, undefined, keep);
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      start({ src: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height, name: f.name }, null, undefined, keep);
    } catch (e) {
      setError(`No se pudo abrir la imagen: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <header className={`nav ${p.image ? 'nav--app' : ''}`}>
        <div className={p.image ? 'nav-in nav-in--app' : 'container nav-in'}>
          <a className="logo" href="/" onClick={(e) => { if (p.image) { e.preventDefault(); if (confirm('¿Volver al inicio? Se perderán los cambios no guardados.')) setP(emptyProject()); } }}>
            {p.image ? <><span className="logo-word"><Logo height={26} /></span><span className="logo-mark" role="img" aria-label="CutSense"><LogoMark size={30} /></span></> : <Logo height={30} />}
          </a>
          {p.image
            ? <div className="nav-slot" ref={setSlot} />
            : <>
              <span className="nav-note">Dale sentido a cada retazo</span>
              <button className="theme-toggle" aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} onClick={() => setTheme(isDark ? 'light' : 'dark')}>{isDark ? '☀' : '☾'}</button>
            </>}
        </div>
      </header>
      <main>
        {p.image
          ? <Workspace key={key} p={p} setP={setP} restored={restored} onReset={() => setP(emptyProject())} onLeftoverPhoto={(f, defs, spacing) => onFile(f, { defs, spacing })}
            headerSlot={slot} isDark={!!isDark} onTheme={() => setTheme(isDark ? 'light' : 'dark')} />
          : <Home onFile={onFile} onExample={onExample} onOpenProject={onOpenProject} error={error} />}
      </main>
    </>
  );
}
