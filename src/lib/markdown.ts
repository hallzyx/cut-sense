/**
 * Lightweight, SAFE Markdown for the agent messages. It does not generate HTML: it produces a tree that the interface
 * draws with React elements (text is always escaped) and only allows http(s) links.
 * Supports: paragraphs, line breaks, # headings, lists with - * • and 1., quotes with >, **bold**, *italic*, `code` and [links](https://…).
 */
export type Inline =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'a'; href: string; c: Inline[] };

export type Block =
  | { t: 'p'; lines: Inline[][] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][]; start: number }
  | { t: 'quote'; lines: Inline[][] };

const MAX_DEPTH = 3;
const INLINE_RE = /(`[^`\n]+`)|(\*\*(?:[^*\n]|\*(?!\*))+?\*\*|__[^_\n]+?__)|(\*[^*\s][^*\n]*?\*)|((?<![A-Za-z0-9])_[^_\s][^_\n]*?_(?![A-Za-z0-9]))|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/;

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  const push = (v: string) => { if (v) out.push({ t: 'text', v }); };
  while (rest) {
    const m = depth < MAX_DEPTH ? INLINE_RE.exec(rest) : null;
    if (!m) { push(rest); break; }
    push(rest.slice(0, m.index));
    const tok = m[0];
    if (m[1]) out.push({ t: 'code', v: tok.slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', c: parseInline(tok.slice(2, -2), depth + 1) });
    else if (m[3] || m[4]) out.push({ t: 'i', c: parseInline(tok.slice(1, -1), depth + 1) });
    else {
      const [, label, href] = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(tok)!;
      out.push({ t: 'a', href, c: parseInline(label, depth + 1) });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', lines: para.map((l) => parseInline(l.trim())) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { flush(); blocks.push({ t: 'h', level: Math.min(h[1].length, 3) as 1 | 2 | 3, c: parseInline(h[2].trim()) }); continue; }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (ul) {
      flush();
      const items = [parseInline(ul[1].trim())];
      while (i + 1 < lines.length && /^\s*[-*•]\s+/.test(lines[i + 1])) items.push(parseInline(lines[++i].replace(/^\s*[-*•]\s+/, '').trim()));
      blocks.push({ t: 'ul', items });
      continue;
    }
    const ol = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flush();
      const items = [parseInline(ol[2].trim())];
      while (i + 1 < lines.length && /^\s*\d{1,3}[.)]\s+/.test(lines[i + 1])) items.push(parseInline(lines[++i].replace(/^\s*\d{1,3}[.)]\s+/, '').trim()));
      blocks.push({ t: 'ol', items, start: Number(ol[1]) });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      const q = [parseInline(line.replace(/^\s*>\s?/, '').trim())];
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1])) q.push(parseInline(lines[++i].replace(/^\s*>\s?/, '').trim()));
      blocks.push({ t: 'quote', lines: q });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Plain text of the Markdown (for screen readers or summaries). */
export function plainText(text: string): string {
  const inl = (xs: Inline[]): string => xs.map((x) => (x.t === 'text' || x.t === 'code' ? x.v : inl(x.c))).join('');
  return parseMarkdown(text).map((b) => (b.t === 'p' || b.t === 'quote' ? b.lines.map(inl).join(' ') : b.t === 'h' ? inl(b.c) : b.items.map(inl).join('; '))).join(' ');
}
