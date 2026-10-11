// Simple palette swaps. Each palette sets the accent color (buttons, links,
// highlights) in a light-mode and a dark-mode shade; backgrounds pick up a
// faint tint of it in styles.css.
export const PALETTES = [
  { id: 'classic', name: 'Classic Blue', light: '#2563eb', dark: '#60a5fa' },
  { id: 'teal', name: 'Teal', light: '#0f766e', dark: '#2dd4bf' },
  { id: 'forest', name: 'Forest', light: '#15803d', dark: '#4ade80' },
  { id: 'sunset', name: 'Sunset', light: '#c2410c', dark: '#fb923c' },
  { id: 'crimson', name: 'Crimson', light: '#b91c1c', dark: '#f87171' },
  { id: 'berry', name: 'Berry', light: '#be185d', dark: '#f472b6' },
  { id: 'grape', name: 'Grape', light: '#6d28d9', dark: '#a78bfa' },
  { id: 'graphite', name: 'Graphite', light: '#475569', dark: '#94a3b8' },
];

export const MODES = [
  ['auto', 'Match computer'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function paletteById(id) {
  return PALETTES.find((p) => p.id === id) || PALETTES[0];
}

/** Apply a teacher's appearance to the page (CSS variables + light/dark mode). */
export function applyAppearance({ palette, mode } = {}, root = document.documentElement) {
  const p = paletteById(palette);
  root.style.setProperty('--accent-light', p.light);
  root.style.setProperty('--accent-dark', p.dark);
  if (mode === 'light' || mode === 'dark') root.dataset.mode = mode;
  else delete root.dataset.mode;
}
