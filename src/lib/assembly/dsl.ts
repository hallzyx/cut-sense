/**
 * Scene DSL for the 3D assembly preview.
 *
 * The model (Muse Spark) never writes code: it fills this closed, strictly validated
 * data structure. Sizes always come from the real pieces (AgentPiece); the scene only
 * chooses placement, folding, layering, seams and hardware.
 *
 * Conventions (all lengths in cm unless the key says _mm):
 *  - Every panel lives in its own local frame: u = width (x), v = height (y, +v = top edge
 *    of the piece as drawn), w = thickness (z, bottom face w=0, top face w=T).
 *  - The node tree is a flat list with parent ids (the strict schema forbids recursion).
 *  - "joint" says how a node hangs from its parent: stacked on a face, hinged on an edge,
 *    sewn edge to edge in the parent's plane (seam), or root. A hinge or a fold angle animates
 *    from 0 (flat) to its target ("assemble").
 */
export const CATEGORIES = [
  'wallet', 'cardholder', 'coin_pouch', 'zip_pouch', 'glasses_case', 'phone_sleeve', 'bag', 'keychain', 'coaster_set', 'box', 'sleeve', 'garment', 'other',
] as const;
export const MATERIAL_KINDS = ['leather', 'felt', 'fabric', 'cardboard', 'foam'] as const;
export const COLORS = ['cognac', 'tan', 'brown', 'dark_brown', 'black', 'burgundy', 'olive', 'navy', 'grey', 'natural', 'red', 'green', 'blue'] as const;
export const NODE_TYPES = ['panel', 'strap', 'hardware'] as const;
export const JOINTS = ['root', 'stack', 'hinge', 'seam'] as const;
export const SIDES = ['top', 'bottom'] as const;
export const EDGES = ['top', 'bottom', 'left', 'right'] as const;
export const STITCHES = ['none', 'all', 'u_shape', 'sides', 'top', 'bottom', 'left', 'right'] as const;
export const HARDWARE = ['none', 'snap', 'stud', 'ring', 'zipper', 'rivet', 'buckle'] as const;
export const CLOSURES = ['none', 'snap', 'stud', 'zipper', 'buckle'] as const;
export const FOLD_AXES = ['horizontal', 'vertical'] as const;
export const MOVING = ['positive', 'negative'] as const;
export const MACROS = [
  'none', 'bifold_wallet', 'cardholder', 'card_slot_stack', 'zip_pouch', 'flap_pouch', 'flat_sleeve', 'envelope_flap',
  'tube_sleeve', 'box_with_lid', 'tote', 'keychain_loop', 'coaster_stack', 'garment_top', 'generic_stack',
] as const;
export const ROLES = [
  'body', 'front', 'back', 'base', 'wall', 'lid', 'flap', 'pocket', 'card_pocket', 'bill_pocket', 'coin_pocket', 'gusset', 'handle', 'tab', 'item', 'lining',
  'sleeve', 'collar', 'cuff', 'waistband', 'hood', 'other',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export type ColorName = (typeof COLORS)[number];
export type NodeType = (typeof NODE_TYPES)[number];
export type Joint = (typeof JOINTS)[number];
export type Side = (typeof SIDES)[number];
export type Edge = (typeof EDGES)[number];
export type Stitch = (typeof STITCHES)[number];
export type Hardware = (typeof HARDWARE)[number];
export type Closure = (typeof CLOSURES)[number];
export type MacroType = (typeof MACROS)[number];
export type Role = (typeof ROLES)[number];

export interface FoldSpec {
  /** horizontal = the fold line runs along the width (constant v); vertical = along the height (constant u). */
  axis: (typeof FOLD_AXES)[number];
  /** Position of the fold line as a fraction of the piece (0 = bottom/left edge, 1 = top/right edge). */
  at: number;
  /** Signed target angle. Positive folds toward the top face (w+). 180 = folded flat onto itself. */
  angle_deg: number;
  /** Mid-plane bend radius in mm; 0 = automatic (fits what is stacked inside). */
  radius_mm: number;
  /** Which side of the line moves. */
  moving: (typeof MOVING)[number];
}

export interface SceneNode {
  id: string;
  type: NodeType;
  /** Piece name (panel/strap) or '' (hardware). */
  piece: string;
  /** Instance index of that piece, 0..qty_per_set-1. */
  instance: number;
  /** Parent node id, '' for the single root. Straps start on the parent. */
  parent: string;
  joint: Joint;
  /** Stack: face of the parent this node lies on. Hardware: face it sits on. */
  side: Side;
  /** Stack order on that face (0 = touching the parent). Overlapping siblings stack automatically. */
  layer: number;
  /** Point on the parent, as a fraction of its size (-0.5..0.5 spans the piece). */
  anchor_x: number;
  anchor_y: number;
  /** Point on this node (fraction of its rotated size) that sits on the anchor. */
  self_x: number;
  self_y: number;
  /** In-plane rotation in degrees. Seam: swing around the seam point (0 = straight out of the edge, + = counter-clockwise). */
  rotation_deg: number;
  /** Turn the piece face down. */
  flip: boolean;
  /** Extra gap along the face normal, mm. */
  offset_mm: number;
  /** Hinge/seam: edge of the parent it is attached to. Strap: direction the loop rises. Zipper: edge it runs along. */
  hinge_edge: Edge;
  /** Hinge target angle; positive rotates toward the parent's top face. 90 = standing wall, 180 = folded over. */
  hinge_angle_deg: number;
  folds: FoldSpec[];
  /** Cushion the panel (pouches): signed mm, + toward the top face. */
  bulge_mm: number;
  stitch: Stitch;
  hardware: Hardware;
  /** Strap: node id where it ends. */
  target: string;
  target_x: number;
  target_y: number;
}

export interface SceneSpec {
  category: Category;
  /** Short product label in the user's language. */
  label: string;
  /** One or two sentences describing the assembled object (text alternative). */
  description: string;
  material: { kind: MaterialKind; color: ColorName; thickness_mm: number };
  /** Optional archetype; it expands deterministically into nodes built from the real pieces. */
  macro: { type: MacroType; roles: { role: Role; piece: string }[]; closure: Closure; fold_angle_deg: number };
  nodes: SceneNode[];
  camera: { azimuth_deg: number; elevation_deg: number };
  /** Simplifications or assumptions about the assembly (shown to the person). */
  assembly_notes: string[];
}

export const SCENE_LIMITS = {
  maxNodes: 60, maxFolds: 3, maxRoles: 20, maxNotes: 4, maxCm: 120, minThicknessMm: 0.5, maxThicknessMm: 5,
  maxLabel: 60, maxDescription: 500, maxNote: 200, maxId: 40, maxInstances: 60,
};

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const int = { type: 'integer' } as const;
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

/** JSON Schema in Meta's strict subset: closed objects, every key required, no oneOf/allOf, no recursion. */
export const FOLD_SCHEMA = obj({ axis: en(FOLD_AXES), at: num, angle_deg: num, radius_mm: num, moving: en(MOVING) });
export const NODE_SCHEMA = obj({
  id: str, type: en(NODE_TYPES), piece: str, instance: int, parent: str, joint: en(JOINTS), side: en(SIDES), layer: int,
  anchor_x: num, anchor_y: num, self_x: num, self_y: num, rotation_deg: num, flip: { type: 'boolean' }, offset_mm: num,
  hinge_edge: en(EDGES), hinge_angle_deg: num, folds: { type: 'array', items: FOLD_SCHEMA }, bulge_mm: num,
  stitch: en(STITCHES), hardware: en(HARDWARE), target: str, target_x: num, target_y: num,
});
export const SCENE_SCHEMA = obj({
  category: en(CATEGORIES),
  label: str,
  description: str,
  material: obj({ kind: en(MATERIAL_KINDS), color: en(COLORS), thickness_mm: num }),
  macro: obj({ type: en(MACROS), roles: { type: 'array', items: obj({ role: en(ROLES), piece: str }) }, closure: en(CLOSURES), fold_angle_deg: num }),
  nodes: { type: 'array', items: NODE_SCHEMA },
  camera: obj({ azimuth_deg: num, elevation_deg: num }),
  assembly_notes: { type: 'array', items: str },
});
export const CRITIQUE_SCHEMA = obj({
  verdict: en(['ok', 'revise']),
  score: int,
  issues: { type: 'array', items: str },
  scene: SCENE_SCHEMA,
});
/** Verification step: the model fixes the problems the deterministic checks still report. */
export const ALIGN_SCHEMA = obj({
  changes: { type: 'array', items: str },
  scene: SCENE_SCHEMA,
});

/** Stacked pieces (they lie on a face of the parent and fly in during phase A): stack and seam joints. */
export const isLaid = (n: Pick<SceneNode, 'type' | 'joint'>) => n.type === 'panel' && (n.joint === 'stack' || n.joint === 'seam');

/** A node with every default filled; macros and the fallback build nodes with this. */
export function blankNode(id: string, patch: Partial<SceneNode> = {}): SceneNode {
  return {
    id, type: 'panel', piece: '', instance: 0, parent: '', joint: 'root', side: 'top', layer: 0,
    anchor_x: 0, anchor_y: 0, self_x: 0, self_y: 0, rotation_deg: 0, flip: false, offset_mm: 0,
    hinge_edge: 'top', hinge_angle_deg: 0, folds: [], bulge_mm: 0, stitch: 'none', hardware: 'none',
    target: '', target_x: 0, target_y: 0, ...patch,
  };
}
