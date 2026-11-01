import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown from '../components/Markdown';
import { parseInline, parseMarkdown, plainText } from './markdown';

const html = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }));

describe('markdown seguro', () => {
  it('interpreta negrita, cursiva y código en línea', () => {
    expect(parseInline('a **b** y *c* con `d`')).toEqual([
      { t: 'text', v: 'a ' }, { t: 'b', c: [{ t: 'text', v: 'b' }] }, { t: 'text', v: ' y ' }, { t: 'i', c: [{ t: 'text', v: 'c' }] },
      { t: 'text', v: ' con ' }, { t: 'code', v: 'd' },
    ]);
  });

  it('anida negrita y cursiva y no se pasa de profundidad', () => {
    expect(html('**fuerte y *suave* dentro**')).toBe('<div class="md"><p><strong>fuerte y <em>suave</em> dentro</strong></p></div>');
  });

  it('listas con viñetas y numeradas, títulos y citas', () => {
    const b = parseMarkdown('### Piezas\n- Panel\n- Bolsillo\n\n1. Corta\n2. Cose\n\n> Ojo con la veta');
    expect(b.map((x) => x.t)).toEqual(['h', 'ul', 'ol', 'quote']);
    expect(html('1. uno\n2. dos')).toBe('<div class="md"><ol start="1"><li>uno</li><li>dos</li></ol></div>');
  });

  it('separa párrafos con línea en blanco y respeta los saltos simples', () => {
    expect(html('uno\ndos\n\ntres')).toBe('<div class="md"><p>uno<br/>dos</p><p>tres</p></div>');
  });

  it('solo enlaza http(s) y los abre de forma segura', () => {
    expect(html('[Meta](https://meta.ai)')).toContain('href="https://meta.ai" target="_blank" rel="noopener noreferrer"');
    expect(html('[x](javascript:alert(1))')).not.toContain('<a');
    expect(html('[x](data:text/html;base64,AAAA)')).not.toContain('<a');
  });

  it('nunca produce HTML: etiquetas y atributos salen escapados', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<strong>ok</strong>');
  });

  it('tolera marcas sin cerrar y entradas raras sin romperse', () => {
    expect(html('2 * 3 = 6 y **sin cerrar')).toContain('2 * 3 = 6 y **sin cerrar');
    expect(html('snake_case_nombre no es cursiva')).not.toContain('<em>');
    expect(() => html('*'.repeat(500) + '_'.repeat(500) + '`'.repeat(100))).not.toThrow();
    expect(html('')).toBe('<div class="md"></div>');
  });

  it('plainText devuelve el contenido sin marcas', () => {
    expect(plainText('**Hola** [aquí](https://a.com)\n- uno\n- dos')).toBe('Hola aquí uno; dos');
  });
});
