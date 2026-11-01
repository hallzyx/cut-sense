import type { AgentPiece } from '../agentSchema';
import type { Category, ColorName, MacroType, MaterialKind, SceneSpec } from './dsl';
import { guessRole } from './macros';
import { DEFAULT_THICKNESS, normName } from './pieces';

/**
 * Deterministic scene from the product name and the pieces alone. It is shown at once
 * (before the model answers) and stays as the preview whenever the model is unavailable
 * or returns something unusable.
 */
const FAMILIES: [RegExp, Category, MacroType][] = [
  // Garments first: "Chaleco con bolsillo para el celular" is a vest, not a phone sleeve.
  [/chaquet|campera|abrigo|blazer|chamarra|cazadora|casaca|gabardina|parka|chaleco|camis|blusa|sudadera|buzo|polera|chompa|jersey|sueter|cardigan|anorak|\bpolo\b|jacket|coat\b|\bvest\b|waistcoat|shirt|blouse|hoodie|sweater|prenda|garment/, 'garment', 'garment_top'],
  [/tarjetero|porta ?tarjetas|cardholder|card holder|card case/, 'cardholder', 'cardholder'],
  [/billetera|cartera|wallet|bifold/, 'wallet', 'bifold_wallet'],
  [/monedero|coin|portamonedas/, 'coin_pouch', 'flap_pouch'],
  [/gafas|lentes|anteojos|glasses|sunglass/, 'glasses_case', 'flat_sleeve'],
  [/celular|movil|telefono|phone|smartphone|tablet|laptop|portatil|funda/, 'phone_sleeve', 'flat_sleeve'],
  [/neceser|cosmetiquera|cremallera|\bzip/, 'zip_pouch', 'zip_pouch'],
  [/estuche|lapices|lapicero|pencil|plumier/, 'zip_pouch', 'zip_pouch'],
  [/bolso|bolsa|tote|mochila|bag|morral|cartera de mano/, 'bag', 'tote'],
  [/llavero|keychain|key ring|keyring/, 'keychain', 'keychain_loop'],
  [/posavaso|coaster/, 'coaster_set', 'coaster_stack'],
  [/caja|box|organizador|bandeja/, 'box', 'box_with_lid'],
  [/sobre|envelope|porta ?documentos|pasaporte/, 'sleeve', 'envelope_flap'],
  [/tubo|cilindr|tube/, 'sleeve', 'tube_sleeve'],
];

export function guessFamily(productName: string, pieces: AgentPiece[]): { category: Category; macro: MacroType } {
  const n = normName(productName);
  for (const [re, category, macro] of FAMILIES) {
    if (!re.test(n)) continue;
    // A one-piece "wallet" or "case" is an envelope fold; a one-piece pouch folds in half.
    const instances = pieces.reduce((s, p) => s + p.qty_per_set, 0);
    if (instances === 1 && ['bifold_wallet', 'flat_sleeve', 'flap_pouch', 'cardholder'].includes(macro)) {
      const p = pieces[0];
      const ratio = Math.max(p.width_cm, p.height_cm) / Math.min(p.width_cm, p.height_cm);
      return { category, macro: macro === 'bifold_wallet' && ratio < 2.4 ? 'bifold_wallet' : 'envelope_flap' };
    }
    return { category, macro };
  }
  const roles = pieces.map((p) => guessRole(p.name));
  if (roles.includes('sleeve') || (roles.includes('collar') && roles.includes('front') && roles.includes('back'))) return { category: 'garment', macro: 'garment_top' };
  if (roles.includes('card_pocket') && pieces.some((p) => p.width_cm >= 15)) return { category: 'wallet', macro: 'bifold_wallet' };
  if (roles.includes('card_pocket')) return { category: 'cardholder', macro: 'cardholder' };
  if (roles.includes('handle')) return { category: 'bag', macro: 'tote' };
  if (pieces.length === 1 && pieces[0].qty_per_set > 2) return { category: 'coaster_set', macro: 'coaster_stack' };
  return { category: 'other', macro: 'generic_stack' };
}

const MATERIALS: [RegExp, MaterialKind][] = [
  [/fieltro|felt/, 'felt'], [/carton|cardboard|carton/, 'cardboard'], [/goma eva|foam|espuma|eva\b/, 'foam'],
  [/tela|lona|algodon|denim|fabric|canvas/, 'fabric'], [/cuero|piel|leather|polipiel|ecocuero/, 'leather'],
];
const COLORS: [RegExp, ColorName][] = [
  [/negr|black/, 'black'], [/marron oscuro|chocolate|dark brown/, 'dark_brown'], [/marron|cafe|brown/, 'brown'],
  [/cognac|coñac|cognac|caramelo|miel/, 'cognac'], [/beige|crudo|natural|vaqueta/, 'natural'], [/tostado|tan|camel/, 'tan'],
  [/burdeos|vino|granate|burgundy/, 'burgundy'], [/oliva|olive/, 'olive'], [/azul marino|navy/, 'navy'], [/gris|grey|gray/, 'grey'],
  [/rojo|red/, 'red'], [/verde|green/, 'green'], [/azul|blue/, 'blue'],
];

export function guessMaterial(text: string): SceneSpec['material'] {
  const n = normName(text);
  const kind = MATERIALS.find(([re]) => re.test(n))?.[1] ?? 'leather';
  const color = COLORS.find(([re]) => re.test(n))?.[1] ?? (kind === 'felt' ? 'grey' : kind === 'cardboard' ? 'natural' : kind === 'fabric' ? 'navy' : 'cognac');
  const mm = n.match(/(\d+(?:[.,]\d+)?)\s*mm/);
  const t = mm ? Number(mm[1].replace(',', '.')) : NaN;
  return { kind, color, thickness_mm: t >= 0.5 && t <= 5 ? t : DEFAULT_THICKNESS[kind] };
}

const CAMERA: Partial<Record<MacroType, SceneSpec['camera']>> = {
  tote: { azimuth_deg: 28, elevation_deg: 22 },
  box_with_lid: { azimuth_deg: 32, elevation_deg: 30 },
  keychain_loop: { azimuth_deg: 30, elevation_deg: 40 },
  tube_sleeve: { azimuth_deg: 35, elevation_deg: 25 },
  garment_top: { azimuth_deg: 0, elevation_deg: 62 },
};

const LABELS: Record<Category, string> = {
  wallet: 'Billetera', cardholder: 'Tarjetero', coin_pouch: 'Monedero', zip_pouch: 'Estuche con cremallera', glasses_case: 'Estuche de gafas',
  phone_sleeve: 'Funda', bag: 'Bolso', keychain: 'Llavero', coaster_set: 'Set de posavasos', box: 'Caja', sleeve: 'Funda', garment: 'Prenda', other: 'Objeto',
};

export function fallbackScene(productName: string, pieces: AgentPiece[], assumptions: string[] = []): SceneSpec {
  const { category, macro } = guessFamily(productName, pieces);
  const material = guessMaterial(`${productName} ${assumptions.join(' ')} ${pieces.map((p) => p.notes).join(' ')}`);
  const wantsZip = /cremallera|\bzip|cierre de cremallera/.test(normName(productName + ' ' + assumptions.join(' ')));
  const wantsSnap = /broche|snap|boton|automatico|iman|magnet/.test(normName(productName + ' ' + assumptions.join(' ')));
  return {
    category,
    label: productName.trim().slice(0, 60) || LABELS[category],
    description: '',
    material,
    macro: { type: macro, roles: [], closure: wantsZip ? 'zipper' : wantsSnap ? 'snap' : 'none', fold_angle_deg: 0 },
    nodes: [],
    camera: CAMERA[macro] ?? { azimuth_deg: 30, elevation_deg: 35 },
    assembly_notes: [],
  };
}
