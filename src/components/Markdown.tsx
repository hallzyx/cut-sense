import { Fragment } from 'react';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown';

function Inl({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text': return <Fragment key={i}>{n.v}</Fragment>;
          case 'code': return <code key={i}>{n.v}</code>;
          case 'b': return <strong key={i}><Inl nodes={n.c} /></strong>;
          case 'i': return <em key={i}><Inl nodes={n.c} /></em>;
          case 'a': return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer"><Inl nodes={n.c} /></a>;
        }
      })}
    </>
  );
}

function Lines({ lines }: { lines: Inline[][] }) {
  return <>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}<Inl nodes={l} /></Fragment>)}</>;
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p': return <p><Lines lines={b.lines} /></p>;
    case 'h': return <p className="md-h"><strong><Inl nodes={b.c} /></strong></p>;
    case 'ul': return <ul>{b.items.map((it, i) => <li key={i}><Inl nodes={it} /></li>)}</ul>;
    case 'ol': return <ol start={b.start}>{b.items.map((it, i) => <li key={i}><Inl nodes={it} /></li>)}</ol>;
    case 'quote': return <blockquote><Lines lines={b.lines} /></blockquote>;
  }
}

/** Renders light Markdown without raw HTML (all text is escaped; only http/https links). */
export default function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((b, i) => <BlockView key={i} b={b} />)}</div>;
}
