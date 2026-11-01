import type { Express, Request as ExRequest, Response as ExResponse } from 'express';
import type { AgentPiece } from '../src/lib/agentSchema';
import { ALIGN_SCHEMA, blankNode, CRITIQUE_SCHEMA, SCENE_SCHEMA, type SceneSpec } from '../src/lib/assembly/dsl';
import { sanitizePieces } from '../src/lib/assembly/pieces';
import { parseScene, resolveScene, explicitScene } from '../src/lib/assembly/validate';

/**
 * 3D assembly preview: Muse Spark describes how the flat pieces become the product, as a
 * strictly validated scene (data, never code), and later critiques a render of it.
 *
 *   POST /api/assembly           { productName, pieces, assumptions? } → { scene, warnings, model, latencyMs }
 *   POST /api/assembly/critique  { productName, pieces, assumptions?, scene, image, sanity, round }
 *                                → { verdict, score, issues, scene, warnings, model, latencyMs }
 *   POST /api/assembly/align     { productName, pieces, assumptions?, scene, issues, sanity?, image? }
 *                                → { changes, scene, warnings, model, latencyMs }  (final verification step)
 *   503 ASSEMBLY_NOT_CONFIGURED · 429 ASSEMBLY_RATE_LIMIT · 400 ASSEMBLY_BAD_REQUEST · 502/504 upstream
 */
export interface AssemblyConfig {
  base?: string; key?: string; model: string;
  fetchImpl?: typeof fetch;
  /** Return true to reject the request (429). Defaults to 30 requests per minute per IP. */
  rateLimit?: (ip: string) => boolean;
  timeoutMs?: number;
}

export class AssemblyError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

export const LIMITS = { productName: 120, assumptions: 10, assumptionChars: 300, imageChars: 1_600_000, sanityChars: 3000, maxRounds: 2, alignIssues: 12, issueChars: 300 };

const ex = (nodes: SceneSpec['nodes'], rest: Partial<SceneSpec>): SceneSpec => ({
  category: 'other', label: '', description: '', material: { kind: 'leather', color: 'cognac', thickness_mm: 1.5 },
  macro: { type: 'none', roles: [], closure: 'none', fold_angle_deg: 0 }, nodes, camera: { azimuth_deg: 30, elevation_deg: 35 }, assembly_notes: [], ...rest,
});
/** Worked examples (few-shot). Built with the same helpers as the app so they always satisfy the schema. */
export const EXAMPLES: { request: string; pieces: string; scene: SceneSpec }[] = [
  {
    request: 'Leather bifold wallet',
    pieces: 'Exterior (rrect 19×9.5 cm ×1), Bill pocket (rrect 17.5×8 ×1), Card pocket (rrect 9×6 ×4)',
    scene: ex([], {
      category: 'wallet', label: 'Bifold wallet', description: 'Closed 9.5 × 9.5 cm wallet: the exterior folds in half and inside there is a bill pocket and four staggered card slots.',
      macro: { type: 'bifold_wallet', roles: [{ role: 'body', piece: 'Exterior' }, { role: 'bill_pocket', piece: 'Bill pocket' }, { role: 'card_pocket', piece: 'Card pocket' }], closure: 'none', fold_angle_deg: 0 },
      assembly_notes: ['Pockets U-stitched onto the exterior'],
    }),
  },
  {
    request: 'Glasses case with a flap',
    pieces: 'Back (rrect 8×17 ×1), Front (rrect 8×15 ×1), Flap (rrect 8×5 ×1)',
    scene: ex([
      blankNode('back', { piece: 'Back', joint: 'root', stitch: 'all', bulge_mm: -1.5 }),
      blankNode('front', { piece: 'Front', parent: 'back', joint: 'stack', anchor_y: -0.5, self_y: -0.5, stitch: 'u_shape', bulge_mm: 2 }),
      blankNode('flap', { piece: 'Flap', parent: 'back', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 180, stitch: 'all' }),
      blankNode('snap', { type: 'hardware', hardware: 'snap', parent: 'flap', joint: 'stack', side: 'bottom', anchor_y: 0.25 }),
    ], {
      category: 'glasses_case', label: 'Glasses case', description: 'Upright 8 × 17 cm case: the front is U-stitched onto the back and the top flap closes forward with a snap.',
      camera: { azimuth_deg: 25, elevation_deg: 40 }, assembly_notes: ['U-shaped seam, open at the top'],
    }),
  },
  {
    request: 'Cardboard box with lid',
    pieces: 'Base (rect 10×10 ×1), Wall (rect 10×4 ×4), Lid (rect 10×10 ×1)',
    scene: ex([
      blankNode('base', { piece: 'Base', joint: 'root' }),
      blankNode('w0', { piece: 'Wall', instance: 0, parent: 'base', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 90 }),
      blankNode('w1', { piece: 'Wall', instance: 1, parent: 'base', joint: 'hinge', hinge_edge: 'bottom', hinge_angle_deg: 90 }),
      blankNode('w2', { piece: 'Wall', instance: 2, parent: 'base', joint: 'hinge', hinge_edge: 'left', hinge_angle_deg: 90 }),
      blankNode('w3', { piece: 'Wall', instance: 3, parent: 'base', joint: 'hinge', hinge_edge: 'right', hinge_angle_deg: 90 }),
      blankNode('lid', { piece: 'Lid', parent: 'w0', joint: 'hinge', hinge_edge: 'top', hinge_angle_deg: 75 }),
    ], {
      category: 'box', label: 'Box with lid', description: '10 × 10 × 4 cm box with the four walls raised and the lid half open, attached to the back wall.',
      material: { kind: 'cardboard', color: 'natural', thickness_mm: 2 }, camera: { azimuth_deg: 32, elevation_deg: 30 },
    }),
  },
  {
    request: 'Short leather jacket',
    pieces: 'Back (rect 50×55 ×1), Front (rect 26×55 ×2), Sleeve (rect 18×52 ×2), Collar (rrect 36×7 ×1)',
    scene: ex([], {
      category: 'garment', label: 'Short jacket', description: 'Jacket laid flat, face up: the two fronts cross over at the centre on top of the back, the sleeves hang from the shoulders and the collar folds over the neckline.',
      macro: { type: 'garment_top', roles: [{ role: 'back', piece: 'Back' }, { role: 'front', piece: 'Front' }, { role: 'sleeve', piece: 'Sleeve' }, { role: 'collar', piece: 'Collar' }], closure: 'zipper', fold_angle_deg: 0 },
      camera: { azimuth_deg: 0, elevation_deg: 62 }, assembly_notes: ['Garment laid flat, without body volume'],
    }),
  },
];

export const DSL_GUIDE = `Scene (JSON with the given schema). The app draws it deterministically with the real measurements of each piece: you only decide placement, folds, layers, seams and hardware. Never invent measurements or pieces.

OPTION A — macro (preferred when the product fits one). nodes = [] and macro.type one of:
- bifold_wallet: body (exterior that folds in half) + bill_pocket + card_pocket (spread out, staggered, over the two halves) + coin_pocket + optional flap/tab.
- cardholder: body + pockets (front, pocket, card_pocket) staggered on the body + optional flap/tab that closes over it with a snap.
- card_slot_stack: same as cardholder, without a flap.
- zip_pouch: back + front, cushioned, with a zipper on top (or a single piece folded in half) + optional tab (zip pull) and lining.
- flap_pouch: back + front + flap with a snap (if there is no flap and the back is taller, its top part folds down as the flap).
- flat_sleeve: back + front U-stitched together (phone sleeve, glasses case) + optional flap and tab.
- envelope_flap: a single piece folded in three (envelope, one-piece wallet).
- tube_sleeve: one piece rolled into a tube.
- box_with_lid: base + wall (walls at 90°) + lid.
- tote: base + front/back + wall/gusset (sides) + handle (arched handles).
- keychain_loop: a strip folded around a ring with a rivet, or a flat tag with a ring.
- coaster_stack: equal pieces (item) fanned out; optional holder.
- garment_top: torso garments (jacket, coat, shirt, vest, sweatshirt) laid flat, face up, like a technical flat drawing: back (the root) + front (one or two fronts on top, meeting or crossing over at the centre) + sleeve (sleeves sewn to the armhole next to the shoulder, hanging down on each side) + collar (folded over the neckline) + optional hood, cuff, waistband, pocket, flap and lining. It is the most reliable way to model a garment.
- generic_stack: the largest piece at the bottom and the rest on top.
macro.roles binds each piece (exact name) to a role: body, front, back, base, wall, lid, flap, pocket, card_pocket, bill_pocket, coin_pocket, gusset, handle, tab, item, lining, sleeve, collar, cuff, waistband, hood, other. Every instance of that piece takes the role. macro.closure: none|snap|stud|zipper|buckle. macro.fold_angle_deg: 0 = default.

OPTION B — macro.type "none" and explicit nodes (at most 60), as a flat list with parent:
Frame of each piece: x = width (width_cm), y = height (height_cm; +y is the top edge of the piece), z = thickness ("top" face up). The root lies flat on the table with its top face up.
- unique id; type panel|strap|hardware; piece = exact name; instance from 0 to qty-1 (each instance only once); the root is the only one with parent "" and joint "root".
- joint "stack": it rests on the side face (top|bottom) of the parent. layer orders the layers (0 touches the parent; overlapping pieces stack on their own). anchor_x/anchor_y: point of the parent as a fraction of its size (-0.5 = left/bottom edge, 0.5 = right/top); self_x/self_y: own point that lands on the anchor. To align bottom edges: anchor_y -0.5 and self_y -0.5. rotation_deg turns it in the plane; flip turns it face down; offset_mm is usually 0.
- joint "hinge": its bottom edge joins the hinge_edge edge (top|bottom|left|right) of the parent and the piece points outward; hinge_angle_deg: 0 flat, 90 standing (wall), 180 folded over the parent (flap); positive turns toward the parent's top face. anchor_x (top/bottom edges) or anchor_y (left/right) shifts it along the edge.
- joint "seam": sewn edge to edge to the parent and stays in the same plane (sleeves, hoods, waistbands, cuffs, stand collars). The self_x point of its bottom edge (with a seam allowance inside) lands on the anchor_x point (top/bottom edges) or anchor_y point (left/right edges) of the parent's hinge_edge edge; with rotation_deg 0 it points straight out and rotation_deg turns it in the plane around that point (+ = counter-clockwise seen from the top face). side and layer as in stack; self_y shifts it into the piece. Left sleeve hanging from the shoulder, tucked under the armhole: parent = back, side "bottom", hinge_edge "left", anchor_y 0.38, self_x -0.3, rotation_deg 78; right sleeve: side "bottom", hinge_edge "right", anchor_y 0.38, self_x 0.3, rotation_deg -78.
- folds (at most 3) fold the piece itself: axis "horizontal" = line parallel to the width at height at (0..1 from the bottom); "vertical" = parallel to the height at at from the left; positive angle_deg folds toward the top face (180 = closed onto itself, 350 = tube); moving "positive" moves the top or right part; radius_mm 0 = automatic.
- bulge_mm: cushioning for padded pouches (+ toward the top face). stitch: none|all|u_shape|sides|top|bottom|left|right (stitched edges, drawn as stitches).
- type "strap" (handles, straps): parent = node where it starts, target = node where it ends, anchor_x/y and target_x/y = attachment points, hinge_edge = where the arc rises. Its real length defines the arc.
- type "hardware": piece "" and hardware snap|stud|ring|zipper|rivet|buckle on the parent, at anchor_x/y and face side; zipper runs along the hinge_edge edge; ring hangs toward hinge_edge.
Fields that do not apply go to 0, "", false, [] , "none" or "top".
Hints: for padded pouches or toiletry bags use bulge_mm from 10 to 25 (+ on the front piece, − on the back one) and put the zipper (hardware zipper) on the front piece with hinge_edge "top"; for a closing flap, hinge 180 on the top edge of the back; a piece must not be separated with offset_mm unless something sits in between.

Garments: do not roll them into tubes or lay them out in a cross; back behind, fronts in front meeting at the centre, sleeves joined at the armhole hanging down and collar on top (the most reliable is the garment_top macro).

Rules: use every instance of every piece; each piece must touch the piece it joins (no gaps); pieces must not pass through each other or float; the assembled object must look like the requested product. label: short name. description: 1–2 sentences on how it looks assembled (read by screen readers). assembly_notes: up to 4 short simplifications or assumptions. camera: suggested azimuth_deg (0 = from the front) and elevation_deg. material: real kind, color and thickness_mm (leather 1.2–2 mm, felt 2–4 mm). Write label, description and assembly_notes in the language of the product name and pieces (English when unsure).`;

const examplesText = () => EXAMPLES.map((e, i) => `Example ${i + 1}. Product: ${e.request}. Pieces: ${e.pieces}.\n${JSON.stringify(e.scene)}`).join('\n\n');

export const SCENE_PROMPT = `You are the 3D modeler of CutSense, an app that plans the cutting of flat pieces (leather, felt, fabric, cardboard). You receive the product the person wants to make and the proposed flat pieces, and you describe how they are assembled for an approximate 3D preview.

${DSL_GUIDE}

${examplesText()}`;

export const CRITIQUE_PROMPT = `You are the 3D preview reviewer of CutSense. I give you the requested product, its flat pieces, the current scene (JSON), an automatic geometry report and an image with 4 views of the assembled object (1: front and above, 2: back and above, 3: low side, 4: from above), with each piece painted a different color.

Judge honestly: does it look like the requested product? Are the folds and layers plausible? Are there pieces passing through each other, floating or out of place? Is the scale reasonable?
- verdict "ok" if it is convincing and has no geometric problems; then return the same scene in scene.
- verdict "revise" if something important fails; return a complete corrected scene in scene. The current scene already comes expanded into explicit nodes (if it came from a macro, they are exactly its nodes): fix it by editing those nodes (anchors, layers, faces, angles, folds) or switch to a different macro; do not return the same scene with verdict "revise".
- Do not ask for things the model cannot represent (textures, exact color, real stitching, fabric volume): judge shape, layers, folds and scale. A scene arriving as explicit nodes is normal and not a problem.
- Garments are shown laid flat, face up, like a technical flat drawing: it is correct that they are flat and that the sleeves hang open to the sides, tucked under the armhole.
score: 1–10. issues: up to 5 short problems in the language of the product name (empty if it is fine).

${DSL_GUIDE}`;

const COLOR_NAMES = ['yellow', 'light blue', 'pink', 'teal', 'violet', 'lime'];

function piecesText(pieces: AgentPiece[]) {
  return pieces.map((p, i) => `- "${p.name}": ${p.kind} ${p.width_cm}×${p.height_cm} cm, ${p.qty_per_set} unit(s)${p.notes ? ` (${p.notes.slice(0, 120)})` : ''} — color in the image: ${COLOR_NAMES[i % COLOR_NAMES.length]}`).join('\n');
}
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);

export interface AssemblyInput { productName: string; pieces: AgentPiece[]; assumptions: string[] }

export function checkInput(body: unknown): AssemblyInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof b.productName !== 'string' || !b.productName.trim() || b.productName.length > LIMITS.productName) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', 'Invalid product name.', 400);
  const { pieces, error } = sanitizePieces(b.pieces);
  if (error) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', `Invalid pieces: ${error}.`, 400);
  const assumptions = Array.isArray(b.assumptions) ? b.assumptions.filter((a): a is string => typeof a === 'string').slice(0, LIMITS.assumptions).map((a) => clean(a, LIMITS.assumptionChars)) : [];
  return { productName: clean(b.productName, LIMITS.productName), pieces, assumptions };
}

type Content = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
async function complete(messages: { role: string; content: Content }[], schema: object, name: string, cfg: AssemblyConfig, signal: AbortSignal): Promise<string> {
  const f = cfg.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${cfg.base}/chat/completions`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({ model: cfg.model, messages, reasoning_effort: 'low', response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AssemblyError('ASSEMBLY_TIMEOUT', 'The model took too long to answer.', 504);
    throw new AssemblyError('ASSEMBLY_UPSTREAM', 'Could not reach the model service.');
  }
  if (!res.ok) throw new AssemblyError('ASSEMBLY_UPSTREAM', `The model service answered ${res.status}.`);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] } | null;
  const msg = body?.choices?.[0]?.message;
  if (msg?.refusal) throw new AssemblyError('ASSEMBLY_REFUSED', 'The model cannot help with that request.', 422);
  return msg?.content ?? '';
}

/** Validate a raw scene against the real pieces; a structural error triggers the single retry. */
function check(raw: unknown, pieces: AgentPiece[]): { ok: true; scene: SceneSpec; warnings: string[] } | { ok: false; error: string } {
  const p = parseScene(raw);
  if (!p.ok) return p;
  const r = resolveScene(p.scene, pieces);
  if (!r.ok) return r;
  // A scene that leaves most pieces unplaced is not a usable answer.
  const total = pieces.reduce((s, x) => s + x.qty_per_set, 0);
  if (r.unused.length > total / 2) return { ok: false, error: `${r.unused.length} of ${total} pieces are still unplaced` };
  return { ok: true, scene: p.scene, warnings: [...p.warnings, ...r.warnings] };
}

async function askScene(msgs: { role: string; content: Content }[], schema: object, name: string, pieces: AgentPiece[], cfg: AssemblyConfig, signal: AbortSignal, pick: (j: any) => unknown) {
  let lastError = 'invalid format';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await complete(msgs, schema, name, cfg, signal);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { json = undefined; }
    const v = check(pick(json), pieces);
    if (v.ok) return { json, ...v };
    lastError = v.error;
    msgs.push({ role: 'assistant', content: raw || '{}' }, { role: 'user', content: `Your answer is not valid (${v.error}). Fix it and answer again with the complete JSON.` });
  }
  throw new AssemblyError('ASSEMBLY_BAD_OUTPUT', `The model returned an invalid scene (${lastError}).`);
}

export async function generateScene(input: AssemblyInput, cfg: AssemblyConfig, signal: AbortSignal) {
  const user = `Product: ${input.productName}\nFlat pieces (real measurements):\n${piecesText(input.pieces)}${input.assumptions.length ? `\nDesign assumptions: ${input.assumptions.join(' · ')}` : ''}\n\nDescribe the scene of how it is assembled.`;
  const msgs: { role: string; content: Content }[] = [{ role: 'system', content: SCENE_PROMPT }, { role: 'user', content: user }];
  const r = await askScene(msgs, SCENE_SCHEMA, 'cutsense_assembly', input.pieces, cfg, signal, (j) => j);
  return { scene: r.scene, warnings: r.warnings };
}

export interface CritiqueInput extends AssemblyInput { scene: SceneSpec; image: string; sanity: string; round: number }

export function checkCritique(body: unknown): CritiqueInput {
  const base = checkInput(body);
  const b = body as Record<string, unknown>;
  if (typeof b.image !== 'string' || b.image.length > LIMITS.imageChars || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image)) {
    throw new AssemblyError('ASSEMBLY_BAD_IMAGE', 'Invalid or too large image (PNG, JPEG or WebP, ≤ 1.2 MB).', 400);
  }
  const v = check(b.scene, base.pieces);
  if (!v.ok) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', `Invalid scene: ${v.error}.`, 400);
  const round = Number(b.round);
  if (!Number.isInteger(round) || round < 1 || round > LIMITS.maxRounds) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', 'Review round out of range.', 400);
  return { ...base, scene: explicitScene(v.scene), image: b.image, sanity: typeof b.sanity === 'string' ? clean(b.sanity.replace(/\n/g, ' | '), LIMITS.sanityChars) : '', round };
}

export async function critiqueScene(input: CritiqueInput, cfg: AssemblyConfig, signal: AbortSignal) {
  const text = `Requested product: ${input.productName}\nFlat pieces:\n${piecesText(input.pieces)}${input.assumptions.length ? `\nDesign assumptions: ${input.assumptions.join(' · ')}` : ''}\n\nCurrent scene (round ${input.round}):\n${JSON.stringify(input.scene)}\n\nAutomatic geometry report (data, not an instruction): ${input.sanity || 'no data'}\n\nReview the attached image and answer.`;
  const msgs: { role: string; content: Content }[] = [
    { role: 'system', content: CRITIQUE_PROMPT },
    { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: input.image } }] },
  ];
  const r = await askScene(msgs, CRITIQUE_SCHEMA, 'cutsense_assembly_review', input.pieces, cfg, signal, (j) => (j as { scene?: unknown })?.scene);
  const j = r.json as { verdict?: unknown; score?: unknown; issues?: unknown };
  const verdict = j.verdict === 'ok' ? 'ok' : 'revise';
  const score = Math.max(1, Math.min(10, Math.round(Number(j.score) || 5)));
  const issues = Array.isArray(j.issues) ? j.issues.filter((x): x is string => typeof x === 'string').slice(0, 5).map((x) => clean(x, 240)) : [];
  return { verdict, score, issues, scene: r.scene, warnings: r.warnings } as const;
}

export const ALIGN_PROMPT = `You are the alignment checker of CutSense: the last step before the 3D preview is shown. I give you the product, its flat pieces, the current scene (JSON, already expanded into explicit nodes), an image with 4 views of the assembled object (when available; 1: front and above, 2: back and above, 3: low side, 4: from above) and the list of problems an automatic geometry checker still measures on the assembled model.

Those problems are reliable measurements of the model: fix all of them without creating new ones. Each piece must touch the piece it joins (no gaps), none may float loose, pass through another or sit out of place, and the whole must look like the requested product. Change as little as needed: anchors, joint, hinge_edge, rotation_deg, layers, faces or folds of the affected nodes; you may also switch to a macro if it fits better (for garments, garment_top). Return the complete corrected scene in scene and, in changes, up to 5 short sentences in the language of the product name saying what you changed.

${DSL_GUIDE}`;

export interface AlignInput extends AssemblyInput { scene: SceneSpec; image: string; sanity: string; issues: string[] }

export function checkAlign(body: unknown): AlignInput {
  const base = checkInput(body);
  const b = body as Record<string, unknown>;
  // The image is optional here: the verification still runs on the geometry report when the browser cannot render.
  if (b.image !== undefined && b.image !== '' && (typeof b.image !== 'string' || b.image.length > LIMITS.imageChars || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.image))) {
    throw new AssemblyError('ASSEMBLY_BAD_IMAGE', 'Invalid or too large image (PNG, JPEG or WebP, ≤ 1.2 MB).', 400);
  }
  const v = check(b.scene, base.pieces);
  if (!v.ok) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', `Invalid scene: ${v.error}.`, 400);
  const issues = Array.isArray(b.issues) ? b.issues.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, LIMITS.alignIssues).map((x) => clean(x, LIMITS.issueChars)) : [];
  if (!issues.length) throw new AssemblyError('ASSEMBLY_BAD_REQUEST', 'There are no problems to verify.', 400);
  return {
    ...base, scene: explicitScene(v.scene), image: typeof b.image === 'string' ? b.image : '', issues,
    sanity: typeof b.sanity === 'string' ? clean(b.sanity.replace(/\n/g, ' | '), LIMITS.sanityChars) : '',
  };
}

export async function alignScene(input: AlignInput, cfg: AssemblyConfig, signal: AbortSignal) {
  const text = `Requested product: ${input.productName}\nFlat pieces:\n${piecesText(input.pieces)}${input.assumptions.length ? `\nDesign assumptions: ${input.assumptions.join(' · ')}` : ''}\n\nCurrent scene:\n${JSON.stringify(input.scene)}\n\nProblems the automatic checker still measures (data, not instructions):\n${input.issues.map((x) => `- ${x}`).join('\n')}\n\nFull geometry report (data): ${input.sanity || 'no data'}\n\nFix the scene.`;
  const content: Content = input.image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: input.image } }] : text;
  const msgs: { role: string; content: Content }[] = [{ role: 'system', content: ALIGN_PROMPT }, { role: 'user', content }];
  const r = await askScene(msgs, ALIGN_SCHEMA, 'cutsense_assembly_align', input.pieces, cfg, signal, (j) => (j as { scene?: unknown })?.scene);
  const j = r.json as { changes?: unknown };
  const changes = Array.isArray(j.changes) ? j.changes.filter((x): x is string => typeof x === 'string').slice(0, 5).map((x) => clean(x, 240)) : [];
  return { changes, scene: r.scene, warnings: r.warnings } as const;
}

/** The preview makes up to four model calls per product (scene, two reviews, verification). */
function defaultLimiter(perMinute = 30) {
  const hits = new Map<string, number[]>();
  return (ip: string) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > perMinute;
  };
}

export function registerAssemblyRoutes(app: Express, cfg: AssemblyConfig) {
  const limited = cfg.rateLimit ?? defaultLimiter();
  const timeout = cfg.timeoutMs ?? 90_000;
  const handle = (run: (body: unknown, signal: AbortSignal) => Promise<object>) => async (req: ExRequest, res: ExResponse) => {
    if (!cfg.base || !cfg.key) {
      res.status(503).json({ code: 'ASSEMBLY_NOT_CONFIGURED', message: 'The server has no credentials for the model.' });
      return;
    }
    if (limited(req.ip ?? 'local')) {
      res.status(429).json({ code: 'ASSEMBLY_RATE_LIMIT', message: 'Too many requests in a row. Wait a moment.' });
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    const t0 = Date.now();
    try {
      const out = await run(req.body, ctl.signal);
      res.json({ ...out, model: cfg.model, latencyMs: Date.now() - t0 });
    } catch (e) {
      const err = e instanceof AssemblyError ? e : new AssemblyError('ASSEMBLY_UPSTREAM', 'Unexpected model error.');
      res.status(err.status).json({ code: err.code, message: err.message });
    } finally {
      clearTimeout(timer);
    }
  };
  app.post('/api/assembly', handle((body, signal) => generateScene(checkInput(body), cfg, signal)));
  app.post('/api/assembly/critique', handle((body, signal) => critiqueScene(checkCritique(body), cfg, signal)));
  app.post('/api/assembly/align', handle((body, signal) => alignScene(checkAlign(body), cfg, signal)));
}
