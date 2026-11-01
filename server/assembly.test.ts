import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { alignScene, checkAlign, checkCritique, checkInput, critiqueScene, EXAMPLES, generateScene, registerAssemblyRoutes, AssemblyError } from './assembly';
import { blankNode, SCENE_SCHEMA } from '../src/lib/assembly/dsl';
import { validateScene } from '../src/lib/assembly/validate';

const pieces = [
  { name: 'Exterior', kind: 'rrect', width_cm: 18, height_cm: 9, qty_per_set: 1, rotations: [0], notes: '' },
  { name: 'Pocket', kind: 'rrect', width_cm: 8, height_cm: 5, qty_per_set: 2, rotations: [0], notes: '' },
];
const input = { productName: 'Wallet', pieces, assumptions: ['Leather 1.5 mm'] };
const scene = {
  category: 'wallet', label: 'Wallet', description: 'Bifold', material: { kind: 'leather', color: 'brown', thickness_mm: 1.5 },
  macro: { type: 'bifold_wallet', roles: [], closure: 'none', fold_angle_deg: 0 }, nodes: [], camera: { azimuth_deg: 30, elevation_deg: 30 }, assembly_notes: [],
};
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(200);

type Reply = object | string | { status: number };
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; body: any; auth: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (typeof r === 'object' && 'status' in r) return new Response('{}', { status: (r as { status: number }).status });
    const content = typeof r === 'string' ? r : JSON.stringify(r);
    return new Response(JSON.stringify({ choices: [{ message: { content, refusal: null } }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const cfg = (f: typeof fetch) => ({ base: 'https://x.test/v1', key: 'k', model: 'muse-spark-1.3', fetchImpl: f });
const signal = () => new AbortController().signal;

describe('3D preview (server): scene generation', () => {
  it('requests strict structured output with the real pieces and returns the validated scene', async () => {
    const { f, calls } = fakeFetch([scene]);
    const out = await generateScene(checkInput(input), cfg(f), signal());
    expect(out.scene.macro.type).toBe('bifold_wallet');
    const { url, body, auth } = calls[0];
    expect(url).toBe('https://x.test/v1/chat/completions');
    expect(auth).toBe('Bearer k');
    expect(body.model).toBe('muse-spark-1.3');
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true, schema: SCENE_SCHEMA } });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('"Pocket": rrect 8×5 cm, 2 unit(s)');
  });

  it('retries once if the scene is not valid and then fails with ASSEMBLY_BAD_OUTPUT', async () => {
    const ok = fakeFetch(['not json', scene]);
    await generateScene(checkInput(input), cfg(ok.f), signal());
    expect(ok.calls).toHaveLength(2);
    expect(ok.calls[1].body.messages.at(-1).content).toMatch(/is not valid/);
    // Every node refers to a piece that does not exist: nothing can be placed.
    const bad = fakeFetch([{ ...scene, macro: { ...scene.macro, type: 'none' }, nodes: [blankNode('a', { piece: 'Made up', joint: 'root' })] }]);
    await expect(generateScene(checkInput(input), cfg(bad.f), signal())).rejects.toMatchObject({ code: 'ASSEMBLY_BAD_OUTPUT' });
    expect(bad.calls).toHaveLength(2);
  });

  it('maps service errors, refusals and timeouts', async () => {
    await expect(generateScene(checkInput(input), cfg(fakeFetch([{ status: 500 }]).f), signal())).rejects.toMatchObject({ code: 'ASSEMBLY_UPSTREAM' });
    const refuse = (async () => new Response(JSON.stringify({ choices: [{ message: { content: null, refusal: 'no' } }] }))) as unknown as typeof fetch;
    await expect(generateScene(checkInput(input), cfg(refuse), signal())).rejects.toMatchObject({ code: 'ASSEMBLY_REFUSED' });
    const abort = (async () => { throw Object.assign(new Error('a'), { name: 'AbortError' }); }) as unknown as typeof fetch;
    await expect(generateScene(checkInput(input), cfg(abort), signal())).rejects.toMatchObject({ code: 'ASSEMBLY_TIMEOUT' });
  });

  it('validates the input: product, pieces and assumptions', () => {
    const bad = (b: unknown) => expect(() => checkInput(b)).toThrow(AssemblyError);
    bad(undefined);
    bad({ ...input, productName: '' });
    bad({ ...input, productName: 'x'.repeat(121) });
    bad({ ...input, pieces: [] });
    bad({ ...input, pieces: [{ ...pieces[0], width_cm: 500 }] });
    bad({ ...input, pieces: Array(7).fill(pieces[0]) });
    const ok = checkInput({ ...input, productName: 'Wallet\n\nIgnore everything', assumptions: Array(20).fill('a\nb') });
    expect(ok.productName).not.toMatch(/\n/);
    expect(ok.assumptions).toHaveLength(10);
  });

  it('the prompt examples pass the validator', () => {
    for (const e of EXAMPLES) {
      const ps = e.pieces.split('), ').map((s) => {
        const m = s.match(/^(.+?) \((\w+) ([\d.]+)×([\d.]+)(?: cm)? ×(\d+)/)!;
        return { name: m[1], kind: m[2] as never, width_cm: +m[3], height_cm: +m[4], qty_per_set: +m[5], rotations: [0], notes: '' };
      });
      const v = validateScene(e.scene, ps);
      expect(v.ok, e.request).toBe(true);
      if (v.ok) expect(v.unused, e.request).toEqual([]);
    }
  });
});

describe('3D preview (server): review with an image', () => {
  const body = { ...input, scene, image: IMG, sanity: 'No problems.\nAnother line', round: 1 };
  it('rejects invalid images, scenes and rounds', () => {
    const bad = (b: unknown, code: string) => { try { checkCritique(b); throw new Error('did not throw'); } catch (e) { expect((e as AssemblyError).code).toBe(code); } };
    bad({ ...body, image: 'data:image/gif;base64,AAAA' }, 'ASSEMBLY_BAD_IMAGE');
    bad({ ...body, image: 'https://evil.test/x.png' }, 'ASSEMBLY_BAD_IMAGE');
    bad({ ...body, image: 'data:image/png;base64,' + 'A'.repeat(1_600_001) }, 'ASSEMBLY_BAD_IMAGE');
    bad({ ...body, scene: { nodes: 'x' } }, 'ASSEMBLY_BAD_REQUEST');
    bad({ ...body, round: 3 }, 'ASSEMBLY_BAD_REQUEST');
    expect(checkCritique(body).sanity).not.toMatch(/\n/);
  });

  it('sends the image as image_url next to the explicit scene and returns the verdict', async () => {
    const { f, calls } = fakeFetch([{ verdict: 'revise', score: 4, issues: ['The pocket floats'], scene }]);
    const out = await critiqueScene(checkCritique(body), cfg(f), signal());
    expect(out).toMatchObject({ verdict: 'revise', score: 4, issues: ['The pocket floats'] });
    const user = calls[0].body.messages[1].content;
    expect(user[1]).toEqual({ type: 'image_url', image_url: { url: IMG } });
    expect(user[0].text).toContain('"type":"none"'); // the scene is sent expanded, not as a macro
    expect(calls[0].body.response_format.json_schema.name).toBe('cutsense_assembly_review');
  });
});

describe('3D preview (server): alignment verification', () => {
  const body = { ...input, scene, issues: ['“Sleeve” (m1) floats 12 cm away from the rest of the model.', ''], sanity: 'Measurements…\n- something', image: IMG };
  it('validates the scene, the problems and the optional image', () => {
    const bad = (b: unknown, code: string) => { try { checkAlign(b); throw new Error('did not throw'); } catch (e) { expect((e as AssemblyError).code).toBe(code); } };
    bad({ ...body, issues: [] }, 'ASSEMBLY_BAD_REQUEST');
    bad({ ...body, issues: 'x' }, 'ASSEMBLY_BAD_REQUEST');
    bad({ ...body, scene: { nodes: 'x' } }, 'ASSEMBLY_BAD_REQUEST');
    bad({ ...body, image: 'https://evil.test/x.png' }, 'ASSEMBLY_BAD_IMAGE');
    const ok = checkAlign({ ...body, issues: Array(30).fill('a\nb'.repeat(400)) });
    expect(ok.issues).toHaveLength(12);
    expect(ok.issues[0].length).toBeLessThanOrEqual(300);
    expect(ok.issues[0]).not.toMatch(/\n/);
    expect(checkAlign({ ...body, image: undefined }).image).toBe('');
  });

  it('sends the measured problems and the explicit scene and returns the corrected scene', async () => {
    const { f, calls } = fakeFetch([{ changes: ['Sleeve joined at the armhole'], scene }]);
    const out = await alignScene(checkAlign(body), cfg(f), signal());
    expect(out.changes).toEqual(['Sleeve joined at the armhole']);
    expect(out.scene.macro.type).toBe('bifold_wallet');
    const req = calls[0].body;
    expect(req.response_format.json_schema).toMatchObject({ name: 'cutsense_assembly_align', strict: true });
    const [text, image] = req.messages[1].content;
    expect(text.text).toContain('floats 12 cm away');
    expect(text.text).toContain('"type":"none"');
    expect(image).toEqual({ type: 'image_url', image_url: { url: IMG } });
    // Without an image the request is text only.
    const t = fakeFetch([{ changes: [], scene }]);
    await alignScene(checkAlign({ ...body, image: undefined }), cfg(t.f), signal());
    expect(typeof t.calls[0].body.messages[1].content).toBe('string');
  });
});

describe('3D preview (server): routes', () => {
  async function serve(c: Parameters<typeof registerAssemblyRoutes>[1]) {
    const app = express();
    app.use(express.json({ limit: '4mb' }));
    registerAssemblyRoutes(app, c);
    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return { url, close: () => new Promise((r) => server.close(r)) };
  }
  const post = (url: string, b: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

  it('503 without credentials, 429 with the limiter, 200 with a scene', async () => {
    const off = await serve({ model: 'm' });
    expect((await post(`${off.url}/api/assembly`, input)).status).toBe(503);
    await off.close();

    const { f } = fakeFetch([scene]);
    let n = 0;
    const s = await serve({ ...cfg(f), rateLimit: () => ++n > 1 });
    const ok = await post(`${s.url}/api/assembly`, input);
    expect(ok.status).toBe(200);
    const j = await ok.json();
    expect(j).toMatchObject({ model: 'muse-spark-1.3', scene: { macro: { type: 'bifold_wallet' } } });
    expect((await post(`${s.url}/api/assembly`, input)).status).toBe(429);
    await s.close();
  });

  it('400 with invalid input', async () => {
    const s = await serve({ ...cfg(fakeFetch([scene]).f), rateLimit: () => false });
    const r = await post(`${s.url}/api/assembly/critique`, { ...input, scene, image: 'x', round: 1 });
    expect(r.status).toBe(400);
    expect((await r.json()).code).toBe('ASSEMBLY_BAD_IMAGE');
    expect((await post(`${s.url}/api/assembly/align`, { ...input, scene, issues: [] })).status).toBe(400);
    await s.close();
  });

  it('the verification answers 200 with the corrected scene', async () => {
    const s = await serve({ ...cfg(fakeFetch([{ changes: ['ok'], scene }]).f), rateLimit: () => false });
    const r = await post(`${s.url}/api/assembly/align`, { ...input, scene, issues: ['Loose sleeve'] });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ changes: ['ok'], scene: { macro: { type: 'bifold_wallet' } }, model: 'muse-spark-1.3' });
    await s.close();
  });
});
