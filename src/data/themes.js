// Color palettes ("Quiet Desk"): calm, low-contrast backgrounds with one
// accent. Each palette is a full set of colors for light and for dark mode;
// styles.css reads them as --l-* / --d-* variables and picks one set.
//
// Token meanings: bg = page, surface = cards, sidebar and fields, surface2 =
// quiet fills (selected nav item, segmented controls), border = hairlines,
// text / muted = body and secondary text, accent = buttons, links and today,
// onAccent = text on the accent.
const palette = (id, name, light, dark) => ({ id, name, light, dark });

export const PALETTES = [
  palette('sage', 'Sage',
    { bg: '#EEF0EC', surface: '#FAFBF9', surface2: '#E2E7E1', border: '#D6DCD5', text: '#1F2A24', muted: '#56635B', accent: '#3F6F5A', onAccent: '#F6F7F4' },
    { bg: '#151A17', surface: '#1C221E', surface2: '#262E28', border: '#313B33', text: '#E3E8E4', muted: '#9DA9A2', accent: '#8CC0A5', onAccent: '#132019' }),
  palette('harbor', 'Harbor',
    { bg: '#EBEFF2', surface: '#F8FAFB', surface2: '#DEE5EA', border: '#D2DBE1', text: '#1A2630', muted: '#536270', accent: '#2C6577', onAccent: '#F5F7F9' },
    { bg: '#12181D', surface: '#182027', surface2: '#222C34', border: '#2D3943', text: '#E2E8EC', muted: '#9AA8B2', accent: '#7FBCCB', onAccent: '#0E1A1F' }),
  palette('heather', 'Heather',
    { bg: '#EFEEF3', surface: '#FAF9FC', surface2: '#E4E2EC', border: '#D9D6E2', text: '#23202D', muted: '#5D586D', accent: '#5B4C8A', onAccent: '#F8F7FA' },
    { bg: '#17151D', surface: '#1E1B26', surface2: '#292532', border: '#352F40', text: '#E7E4EE', muted: '#A7A1B6', accent: '#B5A8E8', onAccent: '#1A1626' }),
  palette('sand', 'Sand & Teal',
    { bg: '#F0EDE8', surface: '#FAF8F5', surface2: '#E7E1D8', border: '#DCD5CA', text: '#28241E', muted: '#635B4F', accent: '#1F6168', onAccent: '#F8F6F3' },
    { bg: '#1A1714', surface: '#221E1A', surface2: '#2D2823', border: '#3A332C', text: '#EDE7DF', muted: '#AFA597', accent: '#7CC2C8', onAccent: '#10201F' }),
  palette('slate', 'Slate',
    { bg: '#EDF0F4', surface: '#FAFBFD', surface2: '#E1E6EE', border: '#D5DCE6', text: '#182230', muted: '#566376', accent: '#2F5BB0', onAccent: '#F7F9FC' },
    { bg: '#12161D', surface: '#181E27', surface2: '#222936', border: '#2D3646', text: '#E3E8F0', muted: '#9BA6B8', accent: '#93B3F2', onAccent: '#0F1626' }),
  palette('rosewood', 'Rosewood',
    { bg: '#F2EDEE', surface: '#FBF8F9', surface2: '#EAE1E4', border: '#DFD3D7', text: '#2B2023', muted: '#695960', accent: '#8C3B57', onAccent: '#FBF7F8' },
    { bg: '#1B1517', surface: '#231C1F', surface2: '#2E2529', border: '#3B3035', text: '#EFE6E9', muted: '#B3A2A9', accent: '#E6A5BC', onAccent: '#2A1219' }),
  palette('marigold', 'Marigold',
    { bg: '#F1EFE8', surface: '#FBFAF6', surface2: '#E8E4D8', border: '#DDD7C8', text: '#29261C', muted: '#625C4A', accent: '#7D5A00', onAccent: '#FFFBEF' },
    { bg: '#1A1813', surface: '#221F18', surface2: '#2D2920', border: '#3B3629', text: '#EFEADC', muted: '#B0A891', accent: '#E8BE55', onAccent: '#241C05' }),
  palette('graphite', 'Graphite',
    { bg: '#EDEDED', surface: '#FAFAFA', surface2: '#E2E2E2', border: '#D3D3D3', text: '#1A1A1A', muted: '#575757', accent: '#2E2E2E', onAccent: '#FAFAFA' },
    { bg: '#141414', surface: '#1C1C1C', surface2: '#272727', border: '#353535', text: '#EDEDED', muted: '#A6A6A6', accent: '#DADADA', onAccent: '#141414' }),
];

// Palettes from before Quiet Desk map to their nearest new one.
const RENAMED = { classic: 'slate', teal: 'harbor', forest: 'sage', sunset: 'marigold', crimson: 'rosewood', berry: 'rosewood', grape: 'heather' };

export const TOKENS = ['bg', 'surface', 'surface2', 'border', 'text', 'muted', 'accent', 'onAccent'];

export const MODES = [
  ['auto', 'Match computer'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function paletteById(id) {
  return PALETTES.find((p) => p.id === (RENAMED[id] || id)) || PALETTES[0];
}

const cssName = (token) => token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Apply a teacher's appearance to the page (CSS variables + light/dark mode). */
export function applyAppearance({ palette: id, mode } = {}, root = document.documentElement) {
  const p = paletteById(id);
  for (const token of TOKENS) {
    root.style.setProperty(`--l-${cssName(token)}`, p.light[token]);
    root.style.setProperty(`--d-${cssName(token)}`, p.dark[token]);
  }
  if (mode === 'light' || mode === 'dark') root.dataset.mode = mode;
  else delete root.dataset.mode;
}
