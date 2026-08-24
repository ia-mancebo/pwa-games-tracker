import { describe, expect, it } from 'vitest';
import { esc, html, raw } from './dom.js';

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc(`<img src=x onerror="alert('pwn')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;pwn&#39;)&quot;&gt;&amp;',
    );
  });

  it('stringifies numbers', () => {
    expect(esc(42)).toBe('42');
  });
});

describe('html', () => {
  it('auto-escapes interpolated strings in text and attributes', () => {
    const evil = '<script>alert(1)</script>';
    const out = html`<p title="${evil}">${evil}</p>`;
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toBe('<p title="&lt;script&gt;alert(1)&lt;/script&gt;">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('interpolates numbers escaped', () => {
    expect(html`<span class="num">${5 < 10}</span>`).toBe('<span class="num"></span>');
    expect(html`<b>${99}</b>`).toBe('<b>99</b>');
  });

  it('joins arrays of values', () => {
    const items = ['<li>a', '<li>b'];
    expect(html`<ul>${items}</ul>`).toBe('<ul>&lt;li&gt;a&lt;li&gt;b</ul>');
  });

  it('renders null, undefined and booleans as empty', () => {
    expect(html`<i>${null}${undefined}${false}${true}</i>`).toBe('<i></i>');
  });

  it('injects raw trusted markup untouched', () => {
    expect(html`<div>${raw('<b>bold</b> & co')}</div>`).toBe('<div><b>bold</b> & co</div>');
  });
});
