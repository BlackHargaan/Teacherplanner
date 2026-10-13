import { describe, it, expect } from 'vitest';
import { PALETTES, TOKENS, paletteById } from '../src/data/themes.js';

// WCAG relative luminance and contrast ratio.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('color palettes', () => {
  it('every palette defines every color for light and dark as #rrggbb', () => {
    for (const p of PALETTES) for (const mode of ['light', 'dark']) for (const t of TOKENS) {
      expect(p[mode][t], `${p.id} ${mode} ${t}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('text, secondary text, links and buttons are readable (WCAG AA) in both modes', () => {
    for (const p of PALETTES) for (const mode of ['light', 'dark']) {
      const c = p[mode];
      const check = (fg, bg, min, what) => expect(contrast(c[fg], c[bg]), `${p.name} ${mode}: ${what}`).toBeGreaterThanOrEqual(min);
      for (const bg of ['bg', 'surface', 'surface2']) {
        check('text', bg, 7, `text on ${bg}`);
        check('muted', bg, 4.5, `secondary text on ${bg}`);
      }
      check('accent', 'surface', 4.5, 'links on cards');
      check('accent', 'bg', 4.5, 'links on the page');
      check('onAccent', 'accent', 4.5, 'button text');
    }
  });

  it('maps palettes saved by older versions to the nearest new one', () => {
    expect(paletteById('classic').id).toBe('slate');
    expect(paletteById('grape').id).toBe('heather');
    expect(paletteById('nope').id).toBe('sage');
  });
});
