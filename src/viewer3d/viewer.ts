import {
  ACESFilmicToneMapping, BoxGeometry, BufferAttribute, BufferGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, PCFShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator, Scene,
  ShadowMaterial, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer, type Material,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { pose, type Pose, type Rig } from '../lib/assembly/kinematics';
import { buildPanelGeometry, stitchPoints, type PanelGeo } from './geometry';
import { BASE_COLORS, PIECE_COLORS, panelMaterials, threadColor } from './materials';

/**
 * three.js renderer for an assembly rig. Loaded with a dynamic import so three never lands in
 * the main bundle. Vertices are deformed on the CPU from the pure kinematics (the same code the
 * sanity checks use), so what you see is what was checked.
 */
export type ColorMode = 'material' | 'pieces';
export interface Viewer {
  setRig(rig: Rig): void;
  setProgress(t: number): void;
  setColorMode(m: ColorMode): void;
  setView(azimuthDeg: number, elevationDeg: number): void;
  orbitBy(dAzDeg: number, dElDeg: number): void;
  zoomBy(f: number): void;
  resize(w: number, h: number): void;
  /** Render the assembled object from several angles into one JPEG (for the AI critique). */
  capture(views: { az: number; el: number }[], tile?: number, t?: number): string;
  dispose(): void;
}

interface PanelItem { kind: 'panel'; node: number; geo: PanelGeo; mesh: Mesh; stitches: { inst: InstancedMesh; pts: { p: [number, number]; t: [number, number]; face: 0 | 1 }[] } | null; pieceIndex: number; tone: number }
interface LooseItem { kind: 'loose'; mesh: Mesh; geo: PanelGeo; layout: Float64Array; pieceIndex: number; tone: number }
interface StrapItem { kind: 'strap'; node: number; mesh: Mesh; samples: number; pieceIndex: number; tone: number }
interface HwItem { kind: 'hw'; node: number; obj: Object3D }
interface ZipItem { kind: 'zip'; node: number; mesh: Mesh; slider: Object3D; samples: number; len: number }
type Item = PanelItem | LooseItem | StrapItem | HwItem | ZipItem;

/** A band (strap, zipper tape) as a rectangular tube with flat-shaded sides: 8 vertices per sample. */
function bandGeometry(samples: number, uvLen: number) {
  const geo = new BufferGeometry();
  const vCount = (samples + 1) * 8;
  geo.setAttribute('position', new BufferAttribute(new Float32Array(vCount * 3), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(vCount * 3), 3));
  const uvs = new Float32Array(vCount * 2);
  for (let k = 0; k <= samples; k++) for (let j = 0; j < 8; j++) { uvs[(k * 8 + j) * 2] = ((k / samples) * uvLen) / 5; uvs[(k * 8 + j) * 2 + 1] = (j % 4) / 8; }
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  const idx: number[] = [];
  for (let k = 0; k < samples; k++) {
    for (let f = 0; f < 4; f++) {
      const a = k * 8 + f * 2, b = a + 1, c = a + 8, d = b + 8;
      idx.push(a, c, b, b, c, d);
    }
  }
  geo.setIndex(idx);
  return geo;
}
const CORNERS: [number, number, number, number][] = [[-1, -1, 0, -1], [1, -1, 0, -1], [1, -1, 1, 0], [1, 1, 1, 0], [1, 1, 0, 1], [-1, 1, 0, 1], [-1, 1, -1, 0], [-1, -1, -1, 0]];
/** Width along `radial`, thickness along `normal`. */
function writeBand(geo: BufferGeometry, pts: number[][], radial: number[][], normal: number[][], hw: number, ht: number, grow: (x: number, y: number, z: number) => void) {
  const pos = geo.attributes.position as BufferAttribute, nrm = geo.attributes.normal as BufferAttribute;
  const pa = pos.array as Float32Array, na = nrm.array as Float32Array;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], r = radial[k], nn = normal[k];
    CORNERS.forEach(([sr, sn, nr, nnn], j) => {
      const o = (k * 8 + j) * 3;
      pa[o] = p[0] + r[0] * hw * sr + nn[0] * ht * sn;
      pa[o + 1] = p[1] + r[1] * hw * sr + nn[1] * ht * sn;
      pa[o + 2] = p[2] + r[2] * hw * sr + nn[2] * ht * sn;
      na[o] = r[0] * nr + nn[0] * nnn; na[o + 1] = r[1] * nr + nn[1] * nnn; na[o + 2] = r[2] * nr + nn[2] * nnn;
      grow(pa[o], pa[o + 1], pa[o + 2]);
    });
  }
  pos.needsUpdate = true; nrm.needsUpdate = true;
  geo.computeBoundingSphere();
}

const DEG = Math.PI / 180;

export function createViewer(canvas: HTMLCanvasElement, opts: { reducedMotion?: boolean; onContextLost?: () => void } = {}): Viewer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  scene.add(new HemisphereLight(0xfffaf0, 0x6d6457, 0.5));
  const key = new DirectionalLight(0xfff4e6, 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const fill = new DirectionalLight(0xdfe8ff, 0.45);
  fill.position.set(-30, 18, -20);
  scene.add(fill);
  const ground = new Mesh(new PlaneGeometry(1, 1), new ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const content = new Group();
  scene.add(content);
  const camera = new PerspectiveCamera(32, 1, 0.1, 4000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !opts.reducedMotion;
  controls.dampingFactor = 0.12;
  controls.maxPolarAngle = 88 * DEG;
  controls.minPolarAngle = 3 * DEG;
  controls.enablePan = true;
  controls.screenSpacePanning = true;

  const metal = new MeshStandardMaterial({ color: 0xc9c2b4, metalness: 1, roughness: 0.28 });
  const brass = new MeshStandardMaterial({ color: 0xb8955a, metalness: 1, roughness: 0.32 });
  const zipTeeth = new MeshStandardMaterial({ color: 0x2b2a27, metalness: 0.2, roughness: 0.5 });

  let rig: Rig | null = null;
  let items: Item[] = [];
  let t = 1;
  let mode: ColorMode = 'material';
  let needs = true;
  let disposed = false;
  let fit = { center: new Vector3(), radius: 10 };
  let lastFitDist = 0;
  const boxLo = new Vector3(), boxHi = new Vector3();

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); opts.onContextLost?.(); });
  controls.addEventListener('change', () => { needs = true; });

  function clear() {
    for (const it of items) {
      if (it.kind === 'zip') { content.remove(it.slider); it.slider.traverse((o) => (o as Mesh).geometry?.dispose()); }
      const obj = it.kind === 'hw' ? it.obj : it.mesh;
      content.remove(obj);
      obj.traverse((o) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mats = (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as Material[];
        mats.forEach((x) => { if (x !== metal && x !== brass && x !== zipTeeth) x.dispose(); });
      });
      if (it.kind === 'panel' && it.stitches) { content.remove(it.stitches.inst); it.stitches.inst.geometry.dispose(); (it.stitches.inst.material as Material).dispose(); }
    }
    items = [];
  }

  function colorFor(pieceIndex: number) {
    if (!rig) return '#999';
    return mode === 'pieces' ? PIECE_COLORS[(pieceIndex >= 0 ? pieceIndex : 0) % PIECE_COLORS.length] : BASE_COLORS[rig.scene.material.color];
  }
  function applyMaterials() {
    if (!rig) return;
    const kind = rig.scene.material.kind;
    for (const it of items) {
      if (it.kind === 'hw' || it.kind === 'zip') continue;
      const old = it.mesh.material as Material[] | Material;
      (Array.isArray(old) ? old : [old]).forEach((m) => m.dispose());
      const mats = panelMaterials(kind, colorFor(it.pieceIndex), mode === 'pieces' ? 0 : it.tone);
      if (it.kind === 'strap') mats[0].side = DoubleSide;
      it.mesh.material = it.kind === 'strap' ? mats[0] : mats;
    }
    needs = true;
  }

  function geometryFrom(g: PanelGeo) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(g.pos.slice(), 3));
    geo.setAttribute('normal', new BufferAttribute(g.nrm.slice(), 3));
    geo.setAttribute('uv', new BufferAttribute(g.uv, 2));
    geo.addGroup(0, g.capCount, 0);
    geo.addGroup(g.capCount, g.pos.length / 3 - g.capCount, 1);
    return geo;
  }

  function hardwareObject(kindName: string, edgeLen: number): Object3D {
    const g = new Group();
    const add = (m: Mesh) => { m.castShadow = true; g.add(m); return m; };
    if (kindName === 'snap' || kindName === 'stud' || kindName === 'rivet') {
      const r = kindName === 'snap' ? 0.55 : kindName === 'stud' ? 0.4 : 0.28;
      const h = kindName === 'snap' ? 0.14 : 0.1;
      const disc = add(new Mesh(new CylinderGeometry(r, r, h, 28), kindName === 'rivet' ? brass : metal));
      disc.rotation.x = Math.PI / 2; disc.position.z = h / 2;
      const dome = add(new Mesh(new SphereGeometry(r * 0.82, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), kindName === 'rivet' ? brass : metal));
      dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.45, 1); dome.position.z = h;
    } else if (kindName === 'ring') {
      add(new Mesh(new TorusGeometry(1.25, 0.12, 14, 48), metal));
    } else if (kindName === 'zipper') {
      // Slider and pull only; the teeth are a band that follows the seam (see ZipItem).
      const slider = add(new Mesh(new BoxGeometry(0.9, 0.7, 0.36), metal));
      slider.position.set(0, 0, 0.1);
      const pull = add(new Mesh(new BoxGeometry(0.35, 1.4, 0.08), metal));
      pull.position.set(0, 0.95, 0.12);
    } else if (kindName === 'buckle') {
      for (const [w, h, x, y] of [[2.6, 0.22, 0, 0.9], [2.6, 0.22, 0, -0.9], [0.22, 2, 1.2, 0], [0.22, 2, -1.2, 0]] as const) {
        const bar = add(new Mesh(new BoxGeometry(w, h, 0.22), metal));
        bar.position.set(x, y, 0.11);
      }
    }
    return g;
  }

  function setRig(r: Rig) {
    clear();
    rig = r;
    const tones = [0, 0.035, -0.03, 0.06, -0.05, 0.02];
    for (const n of r.nodes) {
      const tone = tones[Math.max(0, n.pieceIndex) % tones.length];
      if (n.spec.type === 'panel') {
        const geo = buildPanelGeometry(n);
        const mesh = new Mesh(geometryFrom(geo));
        mesh.castShadow = mesh.receiveShadow = true;
        content.add(mesh);
        let stitches: PanelItem['stitches'] = null;
        if (n.spec.stitch !== 'none') {
          const pts = stitchPoints(n, n.spec.stitch).flatMap((s) => [{ ...s, face: 1 as const }, { ...s, face: 0 as const }]);
          if (pts.length) {
            const inst = new InstancedMesh(new BoxGeometry(0.26, 0.055, 0.04), new MeshStandardMaterial({ color: threadColor(r.scene.material.color, r.scene.material.kind), roughness: 0.7 }), pts.length);
            content.add(inst);
            stitches = { inst, pts };
          }
        }
        items.push({ kind: 'panel', node: n.i, geo, mesh, stitches, pieceIndex: n.pieceIndex, tone });
      } else if (n.spec.type === 'strap') {
        const samples = 48;
        const geo = bandGeometry(samples, n.strapLen);
        const mesh = new Mesh(geo);
        mesh.castShadow = mesh.receiveShadow = true;
        content.add(mesh);
        items.push({ kind: 'strap', node: n.i, mesh, samples, pieceIndex: n.pieceIndex, tone });
      } else if (n.parent >= 0) {
        const p = r.nodes[n.parent];
        const edgeLen = n.spec.hinge_edge === 'top' || n.spec.hinge_edge === 'bottom' ? p.W : p.H;
        const obj = hardwareObject(n.spec.hardware, edgeLen);
        obj.matrixAutoUpdate = false;
        content.add(obj);
        if (n.spec.hardware === 'zipper') {
          const samples = 40, len = Math.max(1, edgeLen - 0.8);
          const mesh = new Mesh(bandGeometry(samples, len), zipTeeth);
          mesh.castShadow = true;
          content.add(mesh);
          items.push({ kind: 'zip', node: n.i, mesh, slider: obj, samples, len });
        } else items.push({ kind: 'hw', node: n.i, obj });
      }
    }
    for (const l of r.loose) {
      const geo = buildPanelGeometry({ outline: l.outline, W: l.W, H: l.H, T: l.T, folds: [] });
      const mesh = new Mesh(geometryFrom(geo));
      mesh.castShadow = mesh.receiveShadow = true;
      content.add(mesh);
      items.push({ kind: 'loose', mesh, geo, layout: l.layout, pieceIndex: l.pieceIndex, tone: 0 });
    }
    applyMaterials();
    update(true);
  }

  const P = [0, 0, 0], D = [0, 0, 0], D2 = [0, 0, 0];
  const m4 = new Matrix4(), obj = new Object3D();
  function update(refit = false) {
    if (!rig) return;
    const ps: Pose = pose(rig, t);
    boxLo.set(Infinity, Infinity, Infinity);
    boxHi.set(-Infinity, -Infinity, -Infinity);
    const grow = (x: number, y: number, z: number) => {
      if (x < boxLo.x) boxLo.x = x; if (y < boxLo.y) boxLo.y = y; if (z < boxLo.z) boxLo.z = z;
      if (x > boxHi.x) boxHi.x = x; if (y > boxHi.y) boxHi.y = y; if (z > boxHi.z) boxHi.z = z;
    };
    for (const it of items) {
      if (it.kind === 'panel' || it.kind === 'loose') {
        const g = it.geo, pos = it.mesh.geometry.attributes.position as BufferAttribute, nrm = it.mesh.geometry.attributes.normal as BufferAttribute;
        const pa = pos.array as Float32Array, na = nrm.array as Float32Array;
        if (it.kind === 'loose') m4.fromArray(it.layout);
        for (let v = 0; v < g.pos.length; v += 3) {
          P[0] = g.pos[v]; P[1] = g.pos[v + 1]; P[2] = g.pos[v + 2];
          D[0] = g.nrm[v]; D[1] = g.nrm[v + 1]; D[2] = g.nrm[v + 2];
          if (it.kind === 'panel') ps.map(it.node, P, D);
          else {
            const e = m4.elements;
            const x = P[0], y = P[1], z = P[2];
            P[0] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[2] = e[2] * x + e[6] * y + e[10] * z + e[14];
            const a = D[0], b = D[1], c = D[2];
            D[0] = e[0] * a + e[4] * b + e[8] * c; D[1] = e[1] * a + e[5] * b + e[9] * c; D[2] = e[2] * a + e[6] * b + e[10] * c;
          }
          pa[v] = P[0]; pa[v + 1] = P[1]; pa[v + 2] = P[2];
          na[v] = D[0]; na[v + 1] = D[1]; na[v + 2] = D[2];
          grow(P[0], P[1], P[2]);
        }
        pos.needsUpdate = true; nrm.needsUpdate = true;
        it.mesh.geometry.computeBoundingSphere();
        if (it.kind === 'panel' && it.stitches) {
          const n = rig.nodes[it.node];
          it.stitches.pts.forEach((s, k) => {
            P[0] = s.p[0]; P[1] = s.p[1]; P[2] = s.face ? n.T + 0.012 : -0.012;
            D[0] = s.t[0]; D[1] = s.t[1]; D[2] = 0;
            D2[0] = 0; D2[1] = 0; D2[2] = s.face ? 1 : -1;
            ps.map(it.node, P, D, D2);
            obj.position.set(P[0], P[1], P[2]);
            const x = new Vector3(D[0], D[1], D[2]).normalize(), z = new Vector3(D2[0], D2[1], D2[2]).normalize();
            const y = new Vector3().crossVectors(z, x).normalize();
            m4.makeBasis(x, y, z).setPosition(obj.position);
            it.stitches!.inst.setMatrixAt(k, m4);
          });
          it.stitches.inst.instanceMatrix.needsUpdate = true;
          it.stitches.inst.computeBoundingSphere();
        }
      } else if (it.kind === 'strap') {
        const st = ps.strap(it.node, it.samples);
        if (!st) continue;
        const n = rig.nodes[it.node];
        writeBand(it.mesh.geometry, st.pts, st.radial, st.normal, n.strapWidth / 2, n.T / 2, grow);
      } else if (it.kind === 'zip') {
        // Teeth run along the parent's edge, centred on the seam so they show between the layers.
        const n = rig.nodes[it.node], p = rig.nodes[n.parent], e = n.spec.hinge_edge;
        const along = e === 'top' || e === 'bottom';
        const sgn = e === 'top' || e === 'right' ? 1 : -1;
        const k = Math.min(1, Math.max(0, (ps.b - 0.05) / 0.35));
        const at = (s: number, lift: number) => (along ? [s, sgn * (p.H / 2 - 0.05), p.T + lift] : [sgn * (p.W / 2 - 0.05), s, p.T + lift]);
        const pts: number[][] = [], rad: number[][] = [], nor: number[][] = [];
        for (let j = 0; j <= it.samples; j++) {
          const q = at(-it.len / 2 + (it.len * j) / it.samples, 0), r = along ? [0, 1, 0] : [1, 0, 0], nn = [0, 0, 1];
          ps.map(p.i, q, r, nn);
          pts.push(q); rad.push(r); nor.push(nn);
        }
        writeBand(it.mesh.geometry, pts, rad, nor, 0.32 * k + 0.001, 0.09 * k + 0.001, grow);
        it.mesh.visible = k > 0.01;
        // Slider near one end; its pull points outward, away from the panel.
        const q = at(it.len * 0.42, 0.05), X = along ? [1, 0, 0] : [0, 1, 0], Y = along ? [0, sgn, 0] : [sgn, 0, 0];
        ps.map(p.i, q, X, Y);
        const xv = new Vector3(X[0], X[1], X[2]).normalize(), yv = new Vector3(Y[0], Y[1], Y[2]).normalize();
        const zv = new Vector3().crossVectors(xv, yv).normalize();
        m4.makeBasis(xv, yv, zv).setPosition(q[0], q[1], q[2]).multiply(new Matrix4().makeScale(k, k, k));
        it.slider.matrix.copy(m4);
        it.slider.visible = k > 0.01;
        it.slider.matrixWorldNeedsUpdate = true;
      } else {
        m4.fromArray(ps.hardware(it.node));
        // Hardware is not a cut piece: it appears while the piece is being assembled.
        const k = Math.min(1, Math.max(0, (ps.b - 0.05) / 0.35));
        it.obj.visible = k > 0.01;
        m4.multiply(new Matrix4().makeScale(k, k, k));
        it.obj.matrix.copy(m4);
        it.obj.matrixWorldNeedsUpdate = true;
        grow(m4.elements[12], m4.elements[13], m4.elements[14]);
      }
    }
    // Rest the whole thing on the table.
    content.position.y = -boxLo.y;
    boxHi.y -= boxLo.y; boxLo.y = 0;
    const center = new Vector3().addVectors(boxLo, boxHi).multiplyScalar(0.5);
    const radius = Math.max(2, boxLo.distanceTo(boxHi) / 2);
    ground.scale.setScalar(radius * 12);
    ground.position.set(center.x, 0, center.z);
    key.position.set(center.x + radius * 1.6, radius * 3.2, center.z + radius * 1.2);
    key.target.position.copy(center);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -radius * 1.6; sc.right = sc.top = radius * 1.6; sc.near = 0.5; sc.far = radius * 8;
    sc.updateProjectionMatrix();
    fit = { center, radius };
    if (refit) frame(null);
    else {
      // Keep the user's orbit and relative zoom while the object changes size.
      const dir = new Vector3().subVectors(camera.position, controls.target);
      const zoom = lastFitDist > 0 ? dir.length() / lastFitDist : 1;
      const d = fitDistance();
      controls.target.copy(center);
      camera.position.copy(center).add(dir.normalize().multiplyScalar(d * zoom));
      lastFitDist = d;
      controls.update();
    }
    needs = true;
  }

  function fitDistance() {
    const vfov = camera.fov * DEG, hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    return (fit.radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
  }
  function frame(view: { az: number; el: number } | null) {
    const az = (view?.az ?? rig?.scene.camera.azimuth_deg ?? 30) * DEG, el = (view?.el ?? rig?.scene.camera.elevation_deg ?? 35) * DEG;
    const d = fitDistance();
    controls.target.copy(fit.center);
    camera.position.set(fit.center.x + Math.sin(az) * Math.cos(el) * d, fit.center.y + Math.sin(el) * d, fit.center.z + Math.cos(az) * Math.cos(el) * d);
    camera.near = Math.max(0.05, d / 200); camera.far = d * 20;
    camera.updateProjectionMatrix();
    lastFitDist = d;
    controls.update();
    needs = true;
  }

  let raf = 0;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const moved = controls.update();
    if (moved || needs) { renderer.render(scene, camera); needs = false; }
  };
  raf = requestAnimationFrame(loop);

  return {
    setRig,
    setProgress(v) { t = Math.min(1, Math.max(0, v)); update(); },
    setColorMode(m) { mode = m; applyMaterials(); },
    setView(az, el) { frame({ az, el }); },
    orbitBy(dAz, dEl) {
      const off = new Vector3().subVectors(camera.position, controls.target);
      const r = off.length();
      const az = Math.atan2(off.x, off.z) + dAz * DEG;
      let el = Math.asin(Math.min(1, Math.max(-1, off.y / r))) + dEl * DEG;
      el = Math.min(Math.PI / 2 - controls.minPolarAngle, Math.max(Math.PI / 2 - controls.maxPolarAngle, el));
      camera.position.set(controls.target.x + Math.sin(az) * Math.cos(el) * r, controls.target.y + Math.sin(el) * r, controls.target.z + Math.cos(az) * Math.cos(el) * r);
      controls.update();
      needs = true;
    },
    zoomBy(f) {
      const off = new Vector3().subVectors(camera.position, controls.target).multiplyScalar(f);
      camera.position.copy(controls.target).add(off);
      controls.update();
      needs = true;
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      needs = true;
    },
    capture(views, tile = 384, tCapture = 1) {
      const prevT = t, prevPos = camera.position.clone(), prevTarget = controls.target.clone(), prevAspect = camera.aspect;
      const size = renderer.getSize(new Vector2());
      const prevMode = mode;
      const out = document.createElement('canvas');
      const cols = Math.min(2, views.length), rows = Math.ceil(views.length / cols);
      out.width = tile * cols; out.height = tile * rows;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#F4EFE6';
      ctx.fillRect(0, 0, out.width, out.height);
      if (mode !== 'pieces') { mode = 'pieces'; applyMaterials(); }
      t = tCapture; update(true);
      renderer.setPixelRatio(1);
      renderer.setSize(tile, tile, false);
      camera.aspect = 1;
      views.forEach((v, i) => {
        frame(v);
        renderer.render(scene, camera);
        ctx.drawImage(canvas, (i % cols) * tile, Math.floor(i / cols) * tile, tile, tile);
        ctx.fillStyle = '#1B1F1C';
        ctx.font = '600 15px system-ui, sans-serif';
        ctx.fillText(String(i + 1), (i % cols) * tile + 10, Math.floor(i / cols) * tile + 22);
      });
      const url = out.toDataURL('image/jpeg', 0.82);
      // Restore what the person was looking at.
      if (prevMode !== mode) { mode = prevMode; applyMaterials(); }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(size.x, size.y, false);
      camera.aspect = prevAspect;
      camera.updateProjectionMatrix();
      t = prevT; update(false);
      camera.position.copy(prevPos); controls.target.copy(prevTarget); controls.update();
      needs = true;
      return url;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clear();
      controls.dispose();
      env.dispose(); pmrem.dispose();
      metal.dispose(); brass.dispose(); zipTeeth.dispose();
      renderer.dispose();
    },
  };
}
