import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AssemblyPreview, type AssemblyDevApi } from '../components/AssemblyPreview';
import { PRODUCT_FIXTURES } from '../lib/assembly/fixtures';
import '../styles.css';

/**
 * Dev-only lab for the 3D assembly preview (served by Vite at /assembly-lab.html; not part of
 * the production build). Query: ?product=billetera&ai=0&theme=dark.
 * window.__asm exposes the preview's dev API; window.__lab.setScene(json) renders a recorded scene.
 */
declare global {
  interface Window { __asm?: AssemblyDevApi; __lab?: { setScene(scene: unknown): void; setProduct(key: string): void } }
}

function Lab() {
  const q = new URLSearchParams(location.search);
  const [key, setKey] = useState(q.get('product') ?? PRODUCT_FIXTURES[0].key);
  const [ai, setAi] = useState(q.get('ai') !== '0');
  const [theme, setTheme] = useState(q.get('theme') ?? 'light');
  const [scene, setScene] = useState<unknown>(undefined);
  const f = PRODUCT_FIXTURES.find((x) => x.key === key) ?? PRODUCT_FIXTURES[0];
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { window.__lab = { setScene, setProduct: (k) => { setScene(undefined); setKey(k); } }; }, []);
  return (
    <main className="container" style={{ padding: '24px 16px', maxWidth: 960 }}>
      <h1 className="h4">Laboratorio de vista 3D</h1>
      <p className="caption" style={{ marginBottom: 12 }}>Solo desarrollo. Las piezas son de ejemplo, como las propondría el agente.</p>
      <div className="cs-btn-row" style={{ marginBottom: 12, gap: 6 }}>
        {PRODUCT_FIXTURES.map((x) => (
          <button key={x.key} type="button" className={`cs-btn cs-btn--sm ${x.key === key ? 'cs-btn--primary' : 'cs-btn--secondary'}`} onClick={() => { setScene(undefined); setKey(x.key); }}>{x.key}</button>
        ))}
      </div>
      <div className="cs-btn-row" style={{ marginBottom: 16, gap: 6 }}>
        <label className="caption"><input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} /> Usar IA (gasta cuota)</label>
        <button type="button" className="cs-btn cs-btn--sm cs-btn--ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Tema: {theme}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 260px)', gap: 16, alignItems: 'start' }}>
        <AssemblyPreview key={`${f.key}-${ai}`} productName={f.productName} pieces={f.pieces} assumptions={f.assumptions} ai={ai} scene={scene} onDevApi={(api) => { window.__asm = api; }} />
        <aside className="caption">
          <strong>{f.productName}</strong>
          <ul>{f.pieces.map((p) => <li key={p.name}>{p.name}: {p.kind} {p.width_cm}×{p.height_cm} cm ×{p.qty_per_set}</li>)}</ul>
        </aside>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Lab /></StrictMode>);
