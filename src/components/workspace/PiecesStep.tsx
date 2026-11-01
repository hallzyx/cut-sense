import { useEffect, useRef, useState } from 'react';
import type { TemplateKind } from '../../types';
import { KIND_LABEL } from '../../engine/templates';
import { KITS } from '../../lib/kits';
import { calibratedInCm } from '../../lib/workspaceUi';
import { fmt, type Project, type TemplateDef } from '../../state';
import { templateLetter } from '../Stage';
import { NumField } from '../fields';
import { Icon } from './Icon';
import { MenuItem, MenuLabel, MenuSep, Popover } from './Menu';
import type { WS } from './useWorkspace';

/** ③ Pieces: fill mode, piece list with a single open editor, “Add piece ▾” and “Options”. */

const SW = 'abcdef';
export function Swatch({ i, color, size }: { i: number; color: string; size?: number }) {
  return <span className={`cs-swatch cs-swatch--${SW[i % 6]}`} data-letter={templateLetter(i)} style={{ ['--_c' as string]: color, ...(size ? { width: size, height: size } : {}) }} aria-hidden="true" />;
}

const MAX = 6;

function KitItems({ w, cm }: { w: WS; cm: boolean }) {
  return (
    <>
      <MenuLabel>Product (sizes in cm)</MenuLabel>
      {KITS.map((k) => (
        <MenuItem key={k.id} icon="kit" label={k.name} hint={cm ? k.blurb : `${k.blurb} · needs calibration in cm`} onSelect={() => w.applyKit(k.id)} testId={`kit-${k.id}`} />
      ))}
    </>
  );
}

function ShapeItems({ w, full }: { w: WS; full: boolean }) {
  const hint = full ? 'At most 6 piece types.' : undefined;
  return (
    <>
      <MenuItem icon="shape" label="Basic shape" hint={hint ?? 'Rectangle, circle, trapezoid…'} disabled={full} onSelect={w.addDef} testId="add-basic" />
      <MenuItem icon="pen" label="Draw a shape…" hint={hint} disabled={full} onSelect={() => w.setPieceDialog('draw')} testId="add-draw" />
      <MenuItem icon="import" label="Import SVG…" hint={hint} disabled={full} onSelect={() => w.setPieceDialog('svg')} testId="add-svg" />
    </>
  );
}

function AddPieceMenu({ w, p }: { w: WS; p: Project }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const cm = calibratedInCm(p.calib);
  const full = p.defs.length >= MAX;
  return (
    <>
      <button ref={btn} type="button" className="cs-btn cs-btn--sm" aria-haspopup="menu" aria-expanded={open} data-testid="add-piece" onClick={() => setOpen((o) => !o)}>
        <Icon name="plus" />Add piece<Icon name={open ? 'caretUp' : 'caret'} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} label="Add piece" align="start" width={320} testId="add-piece-menu">
        <div className="ux-menu__count cs-caption">{p.defs.length} of {MAX} types{full && ' · products replace the order'}</div>
        <KitItems w={w} cm={cm} />
        <MenuSep />
        <MenuItem icon="spark" iconClass="ux-ai-ico" label="Design with AI…" hint={cm ? 'Replaces the order when you approve' : 'Needs calibration in cm'} trailing={w.agentChat.length ? <span className="cs-caption">in progress</span> : undefined} onSelect={w.openAgent} testId="add-agent" />
        <MenuSep />
        <ShapeItems w={w} full={full} />
      </Popover>
    </>
  );
}

function OptionsPopover({ w, p }: { w: WS; p: Project }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={btn} type="button" className="cs-btn cs-btn--sm cs-btn--ghost" aria-haspopup="dialog" aria-expanded={open} data-testid="options" aria-label={`Options: spacing ${fmt(p.spacing, 2)} ${w.unit}`} onClick={() => setOpen((o) => !o)}>
        Options <span className="ux-disc__val">· {fmt(p.spacing, 2)} {w.unit}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} role="dialog" label="Placement options" title="Options" width={280}>
        <div className="ux-pop-body">
          <NumField label="Minimum spacing" value={p.spacing} min={0} suffix={w.unit} onCommit={w.setSpacing} />
          <p className="cs-hint">Between pieces, from excluded zones and from the edge. Rotations are chosen per piece.</p>
        </div>
      </Popover>
    </>
  );
}

function RotationChips({ d, onToggle }: { d: TemplateDef; onToggle: (r: number) => void }) {
  return (
    <div className="ux-rot"><span className="cs-label ux-label-sm" id={`rot-${d.id}`}>Allowed rotations</span>
      <div className="cs-chip-group" role="group" aria-labelledby={`rot-${d.id}`}>
        {[0, 90, 180, 270].map((r) => {
          const on = d.rotations.includes(r);
          return <button key={r} type="button" className="cs-chip" aria-pressed={on} aria-label={`${r}°${on && d.rotations.length === 1 ? ' (at least one)' : ''}`} onClick={() => onToggle(r)}>{r}°</button>;
        })}
      </div>
    </div>
  );
}

function PieceEditor({ w, d, unit, fill, onDone }: { w: WS; d: TemplateDef; unit: string; fill: Project['fill']; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // A single open editor: scrolls into view inside the panel when it opens.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest' }); }, []);
  return (
    <div ref={ref} className="ux-editor" role="group" aria-label={`Edit ${d.name}`} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onDone(); } }}>
      <div className="ux-foot-row">
        <label className="cs-field ux-grow"><span className="cs-label ux-label-sm">Name</span>
          <input className="cs-input ux-input-sm" value={d.name} aria-invalid={!d.name.trim() || undefined} onChange={(e) => w.setDef(d.id, { name: e.target.value })} data-testid="piece-name" />
        </label>
        <label className="cs-field ux-grow"><span className="cs-label ux-label-sm">Shape</span>
          <select className="cs-select ux-input-sm" value={d.kind} onChange={(e) => w.setDef(d.id, { kind: e.target.value as TemplateKind })}>
            {(Object.keys(KIND_LABEL) as TemplateKind[]).filter((k) => k !== 'custom' || d.kind === 'custom').map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      </div>
      <div className={`cs-fields-3 ux-num3 ${unit === 'u' ? 'ux-relative' : ''}`}>
        <NumField label="Width" value={d.w} min={0} exclusive suffix={unit} onCommit={(n) => w.setDef(d.id, { w: n })} />
        <NumField label="Height" value={d.h} min={0} exclusive suffix={unit} onCommit={(n) => w.setDef(d.id, { h: n })} />
        <NumField label={fill === 'maxKits' ? 'Per set' : 'Quantity'} value={d.qty} min={0} int step={1} onCommit={(n) => w.setDef(d.id, { qty: n })} />
      </div>
      <RotationChips d={d} onToggle={(r) => w.toggleRot(d, r)} />
      <div className="ux-editor__foot">
        <button type="button" className="cs-btn cs-btn--danger-quiet cs-btn--sm" data-testid="piece-remove" onClick={() => w.removeDef(d.id)}><Icon name="trash" />Remove piece</button>
        <button type="button" className="cs-btn cs-btn--sm cs-btn--secondary" data-testid="piece-done" onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

function PiecesEmpty({ w, p }: { w: WS; p: Project }) {
  const [menu, setMenu] = useState<'kit' | 'custom' | null>(null);
  const kitBtn = useRef<HTMLButtonElement>(null);
  const customBtn = useRef<HTMLButtonElement>(null);
  const cm = calibratedInCm(p.calib);
  return (
    <div className="ux-options">
      <button ref={kitBtn} type="button" className="ux-option" aria-haspopup="menu" aria-expanded={menu === 'kit'} data-testid="opt-product" onClick={() => setMenu(menu === 'kit' ? null : 'kit')}>
        <span className="ux-option__icon"><Icon name="kit" /></span>
        <span><span className="ux-option__title">Use a product</span><br /><span className="ux-option__meta">{cm ? 'Cardholder, wallet, keychains… sizes in cm' : 'Needs calibration in cm'}</span></span><span className="ux-chev" aria-hidden="true" />
      </button>
      <button type="button" className="ux-option" data-testid="opt-agent" onClick={w.openAgent}>
        <span className="ux-option__icon ux-option__icon--ai"><Icon name="spark" /></span>
        <span><span className="ux-option__title">Design with AI{w.agentChat.length ? ' · in progress' : ''}</span><br /><span className="ux-option__meta">{cm ? 'Describe it; you approve the pieces' : 'Needs calibration in cm'}</span></span><span className="ux-chev" aria-hidden="true" />
      </button>
      <button ref={customBtn} type="button" className="ux-option" aria-haspopup="menu" aria-expanded={menu === 'custom'} data-testid="opt-custom" onClick={() => setMenu(menu === 'custom' ? null : 'custom')}>
        <span className="ux-option__icon"><Icon name="shape" /></span>
        <span><span className="ux-option__title">Custom piece</span><br /><span className="ux-option__meta">Basic shape, drawn or from SVG</span></span><span className="ux-chev" aria-hidden="true" />
      </button>
      <Popover open={menu === 'kit'} onClose={() => setMenu(null)} anchorRef={kitBtn} label="Use a product" width={320}><KitItems w={w} cm={cm} /></Popover>
      <Popover open={menu === 'custom'} onClose={() => setMenu(null)} anchorRef={customBtn} label="Custom piece" width={300}><ShapeItems w={w} full={p.defs.length >= MAX} /></Popover>
    </div>
  );
}

export function PiecesStep({ w, p }: { w: WS; p: Project }) {
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (!p.defs.length) return <PiecesEmpty w={w} p={p} />;
  const maxKits = p.fill === 'maxKits';
  const done = (id: string) => { w.setEditPiece(null); rowRefs.current[id]?.focus(); };
  return (
    <>
      <div className="cs-segmented ux-seg" role="group" aria-label="What to look for">
        <button type="button" aria-pressed={maxKits} data-testid="fill-maxkits" onClick={() => w.setFill('maxKits')}>Complete sets</button>
        <button type="button" aria-pressed={!maxKits} data-testid="fill-fixed" onClick={() => w.setFill('fixed')}>Exact quantity</button>
      </div>
      {p.image?.exampleId && <p className="cs-hint ux-tight">Demo order: change or remove it whenever you like.</p>}
      <p className="cs-hint ux-tight">{maxKits ? <>Quantities for <b>one</b> set; we find how many sets fit.</> : 'Exactly the requested quantities are placed.'}</p>
      <div className="ux-rows">
        {p.defs.map((d, i) => {
          const open = w.editPiece === d.id;
          return (
            <div key={d.id} className="ux-rowwrap">
              <button
                ref={(el) => { rowRefs.current[d.id] = el; }} type="button" className="ux-row" aria-expanded={open} aria-controls={open ? `ed-${d.id}` : undefined} data-testid={`piece-row-${d.id}`}
                onClick={() => w.setEditPiece(open ? null : d.id)}
              >
                <Swatch i={i} color={d.color} />
                <span className="ux-row__name">{d.name || 'Untitled'}</span>
                <span className="ux-row__dim">{fmt(d.w)} × {fmt(d.h)}{w.unit === 'u' && <i> u</i>}</span>
                <span className="ux-row__qty">×{d.qty}</span>
              </button>
              {open && <div id={`ed-${d.id}`}><PieceEditor w={w} d={d} unit={w.unit} fill={p.fill} onDone={() => done(d.id)} /></div>}
            </div>
          );
        })}
      </div>
      <div className="ux-foot-row ux-foot-row--split">
        <AddPieceMenu w={w} p={p} />
        <OptionsPopover w={w} p={p} />
      </div>
    </>
  );
}
