import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from '../components/Markdown';
import { parseInline, parseMarkdown, plainText } from './markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('safe markdown', () => {
  it('parses bold, italic and inline code', () => {
    expect(parseInline('a **b** and *c* with `d`')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'b', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: ' and ' }, { t: 'i', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' with ' }, { t: 'code', v: 'd' },
    ]);
  });

  it('nests bold and italic and does not exceed the depth limit', () => {
    expect(html('**strong and *soft* inside**')).toBe('<div class="md"><p><strong>strong and <em>soft</em> inside</strong></p></div>');
  });

  it('bulleted and numbered lists, headings and quotes', () => {
    const b = parseMarkdown('### Pieces\n- Panel\n- Pocket\n\n1. Cut\n2. Sew\n\n> Mind the grain');
    expect(b.map((x) => x.t)).toEqual(['h', 'ul', 'ol', 'quote']);
    expect(html('1. one\n2. two')).toBe('<div class="md"><ol start="1"><li>one</li><li>two</li></ol></div>');
  });

  it('separates paragraphs with a blank line and respects single line breaks', () => {
    expect(html('one\ntwo\n\nthree')).toBe('<div class="md"><p>one<br/>two</p><p>three</p></div>');
  });

  it('only links http(s) and opens them safely', () => {
    expect(html('[Meta](https://meta.ai)')).toContain('href="https://meta.ai" target="_blank" rel="noopener noreferrer"');
    expect(html('[x](javascript:alert(1))')).not.toContain('<a');
    expect(html('[x](data:text/html;base64,AAAA)')).not.toContain('<a');
  });

  it('never produces HTML: tags and attributes come out escaped', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<strong>ok</strong>');
  });

  it('tolerates unclosed marks and odd input without breaking', () => {
    expect(html('2 * 3 = 6 and **unclosed')).toContain('2 * 3 = 6 and **unclosed');
    expect(html('snake_case_name is not italic')).not.toContain('<em>');
    expect(() => html('*'.repeat(500) + '_'.repeat(500) + '`'.repeat(100))).not.toThrow();
    expect(html('')).toBe('<div class="md"></div>');
  });

  it('plainText returns the content without marks', () => {
    expect(plainText('**Hello** [here](https://a.com)\n- one\n- two')).toBe('Hello here one; two');
  });
});
