import { forwardRef, useRef, useState } from 'react';
import { KITS } from '../../lib/kits';
import { PAPERS, type PaperKey } from '../../lib/print';
import { heroFor, staleWhat } from '../../lib/workspaceUi';
import { fmt, type Project, type Result } from '../../state';
import { Icon } from './Icon';
import { MenuItem, MenuLabel, MenuSep, MenuSwitch, Popover } from './Menu';
import { Swatch } from './PiecesStep';
import { Alert, Disclosure, PanelShell, Reason } from './primitives';
import type { WS } from './useWorkspace';

/** Paso 3 · Resultado: pestañas Plan | Sobrante. Plan = héroe + 3 cifras + honestidad + Detalles; pie: Exportar ▾ · ⋯. */

/** Sello «verificado» (DESIGN.md): roseta + ✓; el texto del anillo solo a ≥ 80 px. */
function Seal() {
  const pts: string[] = [];
  for (let i = 0; i < 56; i++) { const a = (i * Math.PI) / 28, r = i % 2 ? 52.5 : 57; pts.push(`${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`); }
  return (
    <div className="cs-seal cs-seal--animate">
      <svg viewBox="0 0 120 120" role="img" aria-label="Plan verificado">
        <defs><path id="ux-seal-ring" d="M60 60m-38 0a38 38 0 1 1 76 0a38 38 0 1 1 -76 0" /></defs>
        <g transform="rotate(-10 60 60)">
          <path d={`M${pts.join('L')}Z`} fill="var(--cs-verified-solid)" />
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--cs-surface)" strokeWidth="1.6" strokeDasharray="3.2 2.6" />
          <text fontFamily="JetBrains Mono, monospace" fontSize="10" fontWeight="700" fill="var(--cs-surface)"><textPath href="#ux-seal-ring" textLength="236" lengthAdjust="spacing">VERIFICADO · GEOMETRÍA · PLAN ·</textPath></text>
          <circle cx="60" cy="60" r="27" fill="var(--cs-surface)" />
          <path d="M47.5 61l8.5 8.5 17.5-18.5" fill="none" stroke="var(--cs-verified-solid)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}

function MetricTrio({ items, relative }: { items: { value: string; unit?: string; label: string }[]; relative?: boolean }) {
  return (
    <>
      <div className="ux-trio" data-testid="metric-trio">
        {items.map((x) => <div key={x.label}><b>{x.value}{x.unit && <small>{x.unit}</small>}</b><span>{x.label}</span></div>)}
      </div>
      {relative && <p className="cs-caption ux-tight"><span className="cs-unit cs-unit--relative">Sin calibrar</span> ≈ unidades relativas, no centímetros</p>}
    </>
  );
}

function ResultHero({ r, extraPieces, names, stale, onAskHilo }: { r: Result; extraPieces: number; names: Record<string, string>; stale: boolean; onAskHilo: () => void }) {
  const h = heroFor(r, extraPieces, names);
  return (
    <>
      <div className={`ux-hero ${stale ? 'ux-hero--stale' : ''}`} data-testid="result-hero" aria-label={stale ? 'Plan anterior, desactualizado' : undefined}>
        <Seal />
        <div><div className="ux-hero__value">{h.value}{h.unit && <small>{h.unit}</small>}</div><div className="ux-hero__label">{stale ? 'plan anterior' : h.label}</div></div>
      </div>
      {!stale && h.warn && (
        <Alert tone="warn" testId="partial-warn" actions={r.kits?.n === 0
          ? <button type="button" className="cs-btn cs-btn--sm" data-testid="ask-hilo-shortfall" onClick={onAskHilo}><Icon name="spark" className="ux-ico ux-ai-ico" />Pedir ayuda a Hilo</button>
          : undefined}>{h.warn}</Alert>
      )}
    </>
  );
}

function DetailsDisclosure({ r, p, w, stale }: { r: Result; p: Project; w: WS; stale: boolean }) {
  const m = r.solution.metrics;
  const a = (x: number) => `${fmt(x / r.ppu ** 2)} ${r.unit}²`;
  return (
    <Disclosure summary="Detalles" value={stale ? 'del plan anterior' : 'áreas · piezas · JSON'} storageKey="cs-details-open" testId="details">
      <dl className="cs-metrics">
        <div><dt>Área total digitalizada</dt><dd>{a(m.totalArea)}</dd></div>
        <div><dt>Área excluida (sin doble conteo)</dt><dd>{a(m.excludedArea)}</dd></div>
        <div className="cs-metrics__total"><dt>Área utilizable (total − excluida)</dt><dd>{a(m.usableArea)}</dd></div>
        <div><dt>Área ocupada</dt><dd>{a(m.occupiedArea)}</dd></div>
        <div><dt>Ocupada ÷ utilizable</dt><dd>{fmt(m.usableUtilization)} %</dd></div>
        <div><dt>Ocupada ÷ total</dt><dd>{fmt(m.materialUtilization)} %</dd></div>
      </dl>
      <p className="cs-caption">{r.calibrated
        ? <><span className="cs-unit cs-unit--calibrated">Calibrado · {r.unit}</span> escala física por calibración manual.</>
        : <><span className="cs-unit cs-unit--relative">Sin calibrar</span> Sin calibración: unidades relativas (u), no medidas físicas.</>}</p>
      <table className="ux-tbl">
        <thead><tr><th>Pieza</th><th>Colocadas</th><th>Pendientes</th></tr></thead>
        <tbody>
          {w.resultDefs.map((d, i) => (
            <tr key={d.id}><td><Swatch i={i} color={d.color} size={18} /> {d.name}</td><td>{m.placed[d.id] ?? 0}/{m.requested[d.id] ?? 0}</td><td>{m.pending[d.id] ?? 0}</td></tr>
          ))}
        </tbody>
      </table>
      <div>
        <button type="button" className="cs-link" data-testid="download-json" onClick={w.downloadJson}>Descargar problema + solución (JSON)</button>
        <p className="cs-caption cs-mono">semilla {r.solution.seed} · {fmt(r.solution.elapsedMs, 0)} ms · {r.solution.optimizerVersion}</p>
      </div>
    </Disclosure>
  );
}

function ExportMenu({ w }: { w: WS }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const { ex, prefs } = w;
  const err = w.errAt === 'export' ? w.err : null;
  const off = !ex.physical;
  return (
    <>
      <button ref={btn} type="button" className="cs-btn cs-btn--primary" aria-haspopup="menu" aria-expanded={open} data-testid="primary-action" onClick={() => setOpen((o) => !o)}>
        <Icon name="down" />Exportar<Icon name={open ? 'caretUp' : 'caret'} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Exportar plano" title="Exportar plano" placement="up" align="start" width={352} className="ux-export" testId="export-menu">
        <MenuLabel>Imagen</MenuLabel>
        <MenuItem icon="file" label="SVG" hint="Vectorial, para ver o editar" trailing={<span className="cs-badge">.svg</span>} onSelect={() => w.doExport('svg')} testId="export-svg" />
        <MenuItem icon="photo" label="PNG" hint="Imagen para compartir" trailing={<span className="cs-badge">.png</span>} onSelect={() => w.doExport('png')} testId="export-png" />
        <MenuSwitch label="Incluir fotografía" checked={prefs.withPhoto} onToggle={() => w.setPrefs({ withPhoto: !prefs.withPhoto })} testId="export-photo" />
        <MenuSep />
        <MenuLabel>A escala real 1:1</MenuLabel>
        {off && (
          <div className="ux-menu__note ux-menu__note--off" data-testid="export-1to1-reason">
            <span>{ex.physicalReason} <button type="button" className="cs-link" onClick={() => { setOpen(false); w.goStep(2, 'scale'); }}>Ir a Escala</button></span>
          </div>
        )}
        <div className="ux-menu__split">
          <MenuItem icon="print" label="Imprimir" hint="Imprime al 100 % y mide el cuadro de 5 cm" disabled={off} keepOpen onSelect={w.printReal} testId="export-print" />
          <select className="cs-select ux-paper" aria-label="Tamaño de papel" value={prefs.paper} disabled={off} data-testid="export-paper" onChange={(e) => w.setPrefs({ paper: e.target.value as PaperKey })}>
            {(Object.keys(PAPERS) as PaperKey[]).map((k) => <option key={k} value={k}>{PAPERS[k].label}</option>)}
          </select>
        </div>
        <MenuItem icon="file" label="SVG en centímetros" trailing={<span className="cs-badge">.svg</span>} disabled={off} onSelect={w.exportReal} testId="export-svgcm" />
        <MenuItem icon="machine" label="DXF para máquina" hint="R12 · mm · piezas en capa CUT" trailing={<span className="cs-badge">.dxf</span>} disabled={off} onSelect={w.exportDxf} testId="export-dxf" />
        <MenuSwitch label="DXF: borde y zonas como referencia" checked={prefs.dxfRef} disabled={off} onToggle={() => w.setPrefs({ dxfRef: !prefs.dxfRef })} testId="export-dxfref" />
        {err && <p className="cs-error ux-menu__err" role="alert">{err}</p>}
        <div className="ux-menu__note"><Icon name="warn" className="ux-ico ux-warn-ico" /><span>Planos de referencia: revisa una medida antes de cortar. Tu máquina decide kerf, velocidad y potencia.</span></div>
      </Popover>
    </>
  );
}

function MoreMenu({ w }: { w: WS }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="cs-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Más acciones" data-testid="more-button" onClick={() => setOpen((o) => !o)}><Icon name="more" /></button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Más acciones" placement="up" width={300} testId="more-menu">
        <MenuItem icon="redo" label="Volver a calcular" hint="Mismos datos y semilla: mismo plan" disabled={!w.problem} onSelect={w.optimize} testId="more-recompute" />
        <MenuItem icon="pen" label="Editar piezas" onSelect={() => w.goStep(2, 'pieces')} testId="more-edit" />
      </Popover>
    </>
  );
}

function LeftoverTab({ w, r, onLeftoverPhoto }: { w: WS; r: Result; onLeftoverPhoto: (f: File) => void }) {
  const lo = w.leftover;
  const fileRef = useRef<HTMLInputElement>(null);
  const cm = r.unit.trim().toLowerCase() === 'cm';
  const err = w.errAt === 'leftover' ? w.err : null;
  if (!lo) return null;
  const pickedSingle = KITS.find((k) => k.id === w.productId)?.kind === 'piece';
  const a =(x: number) => fmt(x / r.ppu ** 2);
  return (
    <>
      <MetricTrio items={[
        { value: a(lo.area), unit: `${r.unit}²`, label: 'sobrante' },
        { value: fmt((lo.area / lo.materialArea) * 100), unit: '%', label: 'del material' },
        { value: fmt(lo.fragments.length, 0), label: lo.fragments.length === 1 ? 'fragmento' : 'fragmentos' },
      ]} relative={!r.calibrated} />
      <p className="ux-honest">Estimación digital: el sobrante real tendrá los bordes del corte.</p>
      <label className="cs-field"><span className="cs-label">Hacer otro producto con el sobrante</span>
        <select className="cs-select" value={w.productId} disabled={!cm || !!w.busy} data-testid="leftover-product" onChange={(e) => w.setProductId(e.target.value)}>
          <option value="">Elegir producto…</option>
          <optgroup label="Productos de varias piezas (se arman)">{KITS.filter((k) => k.kind !== 'piece').map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</optgroup>
          <optgroup label="Productos de una sola pieza">{KITS.filter((k) => k.kind === 'piece').map((k) => <option key={k.id} value={k.id}>{k.name} · {k.blurb.replace(/^pieza suelta · /, '')}</option>)}</optgroup>
        </select>
        <span className="cs-hint">{cm ? 'El plan actual queda fijo.' : 'Calibra la foto en cm para usar productos con medidas reales.'}</span>
      </label>
      <label className="cs-field"><span className="cs-label">{pickedSingle ? '¿Cuántas piezas quieres?' : '¿Cuántos productos completos quieres?'}</span>
        <input className="cs-input" type="number" inputMode="numeric" min={1} max={200} step={1} value={w.productQty} placeholder="Tantos como quepan" disabled={!cm || !!w.busy} data-testid="leftover-qty"
          onChange={(e) => w.setProductQty(e.target.value)} />
        <span className="cs-hint">Si no caben todos, hacemos los que quepan y te avisamos cuántos fueron.</span>
      </label>
      <button type="button" className="ux-linkrow" data-testid="leftover-agent" disabled={!cm || !!w.busy} onClick={w.openAgentForLeftover}>
        <Icon name="spark" className="ux-ico ux-ai-ico" /><span>Diseñar con IA un producto para el sobrante<small>Hilo propone las piezas según el material que queda</small></span><span className="ux-chev" aria-hidden="true" />
      </button>
      {err && <p className="cs-error" role="alert">{err}</p>}
      {(r.extras ?? []).map((e) => (
        <div key={e.id} className="ux-zone ux-extra" data-testid={`extra-${e.id}`}>
          <span className="cs-badge cs-badge--ink" aria-hidden="true">+</span>
          <span><b>{e.name}</b> <span className="cs-caption">· {e.kind === 'piece' ? `${e.kits.n} ${e.kits.n === 1 ? 'pieza añadida' : 'piezas añadidas'}` : `${e.kits.n} ${e.kits.n === 1 ? 'producto completo añadido' : 'productos completos añadidos'}`}</span></span>
          <button type="button" className="cs-btn cs-btn--danger-quiet cs-btn--sm" aria-label={`Quitar ${e.name}`} data-testid={`extra-remove-${e.id}`} onClick={() => w.dropProduct(e.id)}>Quitar</button>
        </div>
      ))}
      <span className="ux-section-title">Reutilizar el retazo</span>
      {lo.fragments.slice(0, 4).map((f, i) => (
        <button key={i} type="button" className="ux-linkrow" data-testid={`fragment-${i}`} onClick={() => w.useFragment(i)}>
          <Icon name="layers" /><span>Planificar sobre el fragmento {i + 1}<small>{a(f.area)} {r.unit}² · vuelve a Preparar</small></span><span className="ux-chev" aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="ux-linkrow" data-testid="leftover-photo" onClick={() => fileRef.current?.click()}>
        <Icon name="photo" /><span>Subir foto del sobrante real<small>Proyecto nuevo · conserva tus piezas</small></span><span className="ux-chev" aria-hidden="true" />
      </button>
      <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" aria-label="Foto del sobrante" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f && confirm('¿Empezar un proyecto nuevo con la foto del sobrante? Se conserva el pedido; tendrás que calibrar la foto nueva.')) onLeftoverPhoto(f);
      }} />
    </>
  );
}

function Progress({ w, label }: { w: WS; label: string }) {
  const pct = Math.round(w.progress * 100);
  return (
    <div role="status" className="ux-progress" data-testid="optimizing">
      <div className="cs-progress"><div className="cs-progress__bar" style={{ width: `${Math.max(4, pct)}%` }} /></div>
      <div className="cs-progress__meta"><span>{label}</span><span>{pct} %</span></div>
    </div>
  );
}

export const ResultPanel = forwardRef<HTMLHeadingElement, { w: WS; p: Project; onLeftoverPhoto: (f: File) => void }>(function ResultPanel({ w, p, onLeftoverPhoto }, titleRef) {
  const r = w.result;
  const optimizing = w.busy === 'opt';
  const failed = w.errAt === 'optimize' ? w.err : null;
  const names = Object.fromEntries(w.resultDefs.map((d) => [d.id, d.name]));
  const invalid = !!r && !r.verify.valid;
  const empty = !!r && r.verify.valid && r.solution.placements.length === 0;
  const canLeft = w.leftoverOk && !optimizing;
  const leftoverTab = w.tab === 'leftover' && canLeft && !!r;
  const tabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = w.tab === 'plan' ? 'leftover' : 'plan';
    if (next === 'leftover' && !canLeft) return;
    w.setTab(next);
    (e.currentTarget.parentElement?.querySelector(`[data-testid="tab-${next}"]`) as HTMLElement | null)?.focus();
  };
  const tabs = (
    <div className="ux-tabs" role="tablist" aria-label="Vista del resultado">
      <button type="button" className="ux-tab" role="tab" id="tab-plan" aria-selected={!leftoverTab} aria-controls="tp-result" tabIndex={leftoverTab ? -1 : 0} data-testid="tab-plan" disabled={optimizing} onKeyDown={tabKey} onClick={() => w.setTab('plan')}>Plan</button>
      <button type="button" className="ux-tab" role="tab" id="tab-leftover" aria-selected={leftoverTab} aria-controls="tp-result" tabIndex={leftoverTab ? 0 : -1} data-testid="tab-leftover" disabled={!canLeft} title={!canLeft ? 'Disponible con un plan verificado y vigente' : undefined} onKeyDown={tabKey} onClick={() => w.setTab('leftover')}>Sobrante</button>
    </div>
  );

  let footer: React.ReactNode;
  if (optimizing) footer = <Progress w={w} label={w.tab === 'leftover' ? 'Buscando sitio en el sobrante…' : 'Acomodando piezas…'} />;
  else if (leftoverTab) footer = <>
    <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={!w.productId || r!.unit.trim().toLowerCase() !== 'cm'} aria-describedby={!w.productId ? 'r3l' : undefined} onClick={() => void w.tryProduct()}>Calcular con el sobrante</button>
    {!w.productId && <Reason id="r3l">Elige un producto para calcular.</Reason>}
  </>;
  else if (!r || failed || invalid) footer = <button type="button" className="cs-btn cs-btn--primary cs-btn--block" data-testid="primary-action" disabled={!w.problem} onClick={w.optimize}><Icon name="redo" />Reoptimizar</button>;
  else if (empty) footer = <div className="ux-foot-row">
    <button type="button" className="cs-btn cs-btn--primary" data-testid="primary-action" onClick={() => w.goStep(2, 'pieces')}>Revisar piezas</button>
    <button type="button" className="cs-btn" onClick={() => w.goStep(2, 'zones')}>Ver zonas</button>
  </div>;
  else if (w.stale) footer = <>
    <div className="ux-foot-row">
      <button type="button" className="cs-btn cs-btn--primary" data-testid="primary-action" disabled={!w.problem} onClick={w.optimize}><Icon name="redo" />Reoptimizar</button>
      <button type="button" className="cs-btn" disabled aria-describedby="r3s" data-testid="export-disabled"><Icon name="down" />Exportar</button>
    </div>
    <Reason id="r3s">{w.problem ? w.ex.reason : 'Corrige el contorno en el paso 1 para reoptimizar.'}</Reason>
  </>;
  else footer = <>
    <div className="ux-foot-row"><ExportMenu w={w} /><MoreMenu w={w} /></div>
    {w.errAt === 'export' && w.err && <p className="cs-error" role="alert">{w.err}</p>}
  </>;

  return (
    <PanelShell ref={titleRef} step={3} label="Panel del resultado" title="Resultado" tabs={tabs} footer={footer}>
      <div id="tp-result" role="tabpanel" aria-labelledby={leftoverTab ? 'tab-leftover' : 'tab-plan'} className="ux-tabpanel">
        {w.errAt === 'zones' && w.err && <p className="cs-error" role="alert">{w.err}</p>}
        {optimizing && <p className="ux-muted">Buscando la mejor distribución. El verificador revisará cada pieza antes de mostrar el plan.</p>}
        {!optimizing && failed && <Alert tone="danger" role="alert" title="La optimización falló">{failed.replace(/^La optimización falló: /, '')}</Alert>}
        {r && !optimizing && leftoverTab && <LeftoverTab w={w} r={r} onLeftoverPhoto={onLeftoverPhoto} />}
        {r && !optimizing && !leftoverTab && (invalid ? (
          <Alert tone="danger" role="alert" title="Este plan no pasó la verificación" testId="verify-failed">
            No se muestra como válido ni se exporta.
            <ul>{r.verify.violations.slice(0, 4).map((v, i) => <li key={i}>{v.message}</li>)}</ul>
          </Alert>
        ) : empty ? (
          <div className="cs-empty ux-nosol" data-testid="no-solution">
            <div className="cs-empty__title">Ninguna pieza entra sin tocar una zona excluida</div>
            <p className="cs-empty__body">Las piezas son más grandes que el área libre o la separación es muy alta.</p>
          </div>
        ) : (
          <>
            {w.stale && (
              <Alert tone="warn" title="Cambiaste algo después de optimizar" testId="stale-notice">
                {staleWhat(r, w.problem, p.fill === 'maxKits', r.ppu !== w.ppu || r.unit !== w.unit)} Este plan ya no corresponde a tus datos y no se puede exportar.
              </Alert>
            )}
            {w.change && !w.stale && !w.changeSeen && (
              <Alert tone="info" icon="redo" title="Qué cambió" testId="change-notice" actions={<button type="button" className="cs-link" onClick={() => w.setChangeSeen(true)}>Entendido</button>}>
                <ul>
                  {w.change.changes.map((c) => <li key={c.label}>{c.label}: {c.detail}</li>)}
                  <li>Piezas con posición o giro distinto: {w.change.moved}</li>
                </ul>
                <span className="cs-caption">El área útil cambió: no comparamos porcentajes como “mejora”.</span>
              </Alert>
            )}
            <ResultHero r={r} extraPieces={w.extraPieces} names={names} stale={w.stale} onAskHilo={w.askHiloAboutShortfall} />
            {!w.stale && (
              <>
                <MetricTrio relative={!r.calibrated} items={[
                  { value: fmt(r.solution.metrics.usableUtilization), unit: '%', label: 'del área útil' },
                  { value: fmt(r.solution.metrics.occupiedArea / r.ppu ** 2), unit: `${r.unit}²`, label: 'ocupada' },
                  { value: fmt(r.solution.metrics.usableArea / r.ppu ** 2, 0), unit: `${r.unit}²`, label: 'útil' },
                ]} />
                <p className="ux-honest" data-testid="honesty">Mejor distribución encontrada ({r.solution.optimizerVersion} · semilla {r.solution.seed}). No es un óptimo demostrado.</p>
              </>
            )}
            <DetailsDisclosure r={r} p={p} w={w} stale={w.stale} />
          </>
        ))}
      </div>
    </PanelShell>
  );
});
