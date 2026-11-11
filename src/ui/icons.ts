/**
 * The icon set. Every icon has a key (`imp:mine`, `res:energy`, `queue:ship` …) and a built-in SVG drawing
 * (24×24, line art in `currentColor`). To replace one with artwork, drop a file named after its key, with
 * the colon as a dash, into src/ui/assets/icons/ (for example `imp-mine.png`, `.webp` or `.svg`): the build
 * picks it up and every screen shows it instead of the drawing. Nothing else needs changing.
 */

/** Replacement artwork found in src/ui/assets/icons/, by key. */
const FILES: Record<string, string> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>('./assets/icons/*.{png,webp,svg,jpg}', { eager: true, import: 'default' }))) {
  const name = path.replace(/^.*\//, '').replace(/\.[a-z]+$/, '');
  FILES[name.replace('-', ':')] = url;
}

/** Each icon's drawing (SVG markup inside a 0 0 24 24 box) and its colour. */
interface IconDef { svg: string; color: string }

const C = {
  metals: '#d9a35b', energy: '#ffd166', science: '#6cc4ff', exotics: '#c58bff', people: '#7ce0a0',
  industry: '#ff9f5a', military: '#ff6b6b', trade: '#4fd1c5', growth: '#9be36b', neutral: '#c9d3ec',
};

export const ICONS: Record<string, IconDef> = {
  // Resources
  'res:energy': { color: C.energy, svg: '<path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2Z" fill="currentColor" fill-opacity=".25"/><path d="M13.5 2 5 13.5h6L9.5 22 19 9.5h-6.2L13.5 2Z"/>' },
  'res:metals': { color: C.metals, svg: '<path d="M3 17l3-6h12l3 6H3Z" fill="currentColor" fill-opacity=".25"/><path d="M3 17l3-6h12l3 6H3Z"/><path d="M7.5 11l2-4h5l2 4"/>' },
  'res:science': { color: C.science, svg: '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(-60 12 12)"/>' },
  'res:exotics': { color: C.exotics, svg: '<path d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4L12 2.5Z" fill="currentColor" fill-opacity=".3"/><path d="M12 2.5l2.4 7.1 7.1 2.4-7.1 2.4L12 21.5l-2.4-7.1L2.5 12l7.1-2.4L12 2.5Z"/>' },
  'res:population': { color: C.people, svg: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.6 2.8-5.5 5.5-5.5s4.9 1.9 5.5 5.5"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15.6 14.4c2.6-.3 4.4 1.4 4.9 4.6"/>' },
  'res:production': { color: C.industry, svg: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>' },
  'res:defense': { color: C.military, svg: '<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3Z"/>' },

  // Improvements
  'imp:mine': { color: C.metals, svg: '<path d="M4 20.5 14.5 10"/><path d="M8.5 4.5c4.2-.6 8.6 1.3 11 6.5" stroke-width="2.4"/><path d="M8.5 4.5c2 1.3 3.8 3 6 5.5" stroke-opacity=".6"/>' },
  'imp:deepMine': { color: C.metals, svg: '<path d="M3 6h18M3 11h18" stroke-opacity=".45"/><path d="M12 2.5v11"/><path d="M8.5 12l3.5 9.5 3.5-9.5h-7Z" fill="currentColor" fill-opacity=".3"/><path d="M8.5 12l3.5 9.5 3.5-9.5h-7Z"/><path d="M9.5 15.5h5M10.6 18.5h2.8"/>' },
  'imp:powerPlant': { color: C.energy, svg: '<rect x="3.5" y="9" width="17" height="12" rx="1.5"/><path d="M7 9V5h3v4M14 9V3h3v6"/><path d="M12.6 11.5 9.5 16h3l-1 3.5 3.5-5h-3l.6-3Z" fill="currentColor"/>' },
  'imp:fusionReactor': { color: C.energy, svg: '<circle cx="12" cy="12" r="2.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-30 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(90 12 12)"/>' },
  'imp:lab': { color: C.science, svg: '<path d="M9.5 3h5M10.5 3v6L4.8 18.6A1.6 1.6 0 0 0 6.2 21h11.6a1.6 1.6 0 0 0 1.4-2.4L13.5 9V3"/><path d="M7.5 15h9" /><path d="M7.4 15l-1.6 3.4h12.4L16.6 15Z" fill="currentColor" fill-opacity=".3"/>' },
  'imp:university': { color: C.science, svg: '<path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z" fill="currentColor" fill-opacity=".25"/><path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z"/><path d="M6.5 10.5V16c1.5 1.6 3.5 2.4 5.5 2.4s4-.8 5.5-2.4v-5.5"/><path d="M21.5 8.5v6"/>' },
  'imp:habitat': { color: C.people, svg: '<path d="M3 19.5a9 9 0 0 1 18 0H3Z" fill="currentColor" fill-opacity=".2"/><path d="M3 19.5a9 9 0 0 1 18 0"/><path d="M2 19.5h20"/><path d="M10 19.5v-3.5a2 2 0 0 1 4 0v3.5"/><path d="M7 12.5l1.5 1M17 12.5l-1.5 1" stroke-opacity=".6"/>' },
  'imp:orbitalFarm': { color: C.growth, svg: '<circle cx="12" cy="12" r="4.5"/><ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-20 12 12)" stroke-opacity=".6"/><path d="M12 15.5c0-2.4 1.2-4.4 3.5-5.4-.2 2.6-1.5 4.6-3.5 5.4Z" fill="currentColor"/>' },
  'imp:refinery': { color: C.exotics, svg: '<path d="M12 2.5 18 9l-6 12.5L6 9l6-6.5Z" fill="currentColor" fill-opacity=".25"/><path d="M12 2.5 18 9l-6 12.5L6 9l6-6.5Z"/><path d="M6 9h12M12 2.5 9.5 9 12 21.5 14.5 9 12 2.5"/>' },
  'imp:shipyard': { color: C.military, svg: '<path d="M3 21V5h3v16M3 9h3M3 13h3"/><path d="M6 5h11v3"/><path d="M9.5 16.5 15 13l6 3.5-6 3.5-5.5-3.5Z" fill="currentColor" fill-opacity=".3"/><path d="M9.5 16.5 15 13l6 3.5-6 3.5-5.5-3.5Z"/>' },
  'imp:heavyShipyard': { color: C.military, svg: '<path d="M2.5 21V4h2.5v17M19 21V4h2.5v17M2.5 8h2.5M19 8h2.5"/><path d="M5 4h14"/><path d="M6.5 15 12 10l5.5 5-5.5 5-5.5-5Z" fill="currentColor" fill-opacity=".3"/><path d="M6.5 15 12 10l5.5 5-5.5 5-5.5-5Z"/>' },
  'imp:planetShield': { color: C.trade, svg: '<circle cx="12" cy="15" r="5"/><path d="M3 15a9 9 0 0 1 18 0" stroke-dasharray="2.2 1.8"/><path d="M1.5 15a10.5 10.5 0 0 1 21 0" stroke-opacity=".4"/>' },
  'imp:garrison': { color: C.military, svg: '<path d="M4 14c0-5 3.6-9 8-9s8 4 8 9H4Z" fill="currentColor" fill-opacity=".2"/><path d="M4 14c0-5 3.6-9 8-9s8 4 8 9"/><path d="M2.5 14h19M7 14v3.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V14"/><path d="M12 5v4"/>' },
  'imp:tradePort': { color: C.trade, svg: '<path d="M3 8h14l-3-3M21 16H7l3 3"/><rect x="9" y="10" width="6" height="4" rx=".5" fill="currentColor" fill-opacity=".3"/>' },
  'imp:factory': { color: C.industry, svg: '<path d="M2.5 21V11l5 3v-3l5 3v-3l5 3V3.5h3.5V21H2.5Z" fill="currentColor" fill-opacity=".2"/><path d="M2.5 21V11l5 3v-3l5 3v-3l5 3V3.5h3.5V21H2.5Z"/><path d="M6 17.5h2M11 17.5h2"/>' },
  'imp:academy': { color: C.industry, svg: '<path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6l-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3Z" fill="currentColor" fill-opacity=".25"/><path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6l-4.9 2.6.9-5.5-4-3.9 5.5-.8L12 3Z"/><path d="M7 21.5h10" />' },

  // Things in a build queue that are not improvements
  'queue:ship': { color: C.military, svg: '<path d="M12 2.5 17 14l-5 2.5L7 14l5-11.5Z" fill="currentColor" fill-opacity=".25"/><path d="M12 2.5 17 14l-5 2.5L7 14l5-11.5Z"/><path d="M9.5 18.5 12 21.5l2.5-3"/>' },
  'queue:develop': { color: C.growth, svg: '<circle cx="12" cy="12" r="9.5"/><path d="M12 17V7.5M7.5 11.5 12 7l4.5 4.5"/>' },
  'queue:army': { color: C.military, svg: '<path d="M5 13c0-4.4 3.1-8 7-8s7 3.6 7 8H5Z" fill="currentColor" fill-opacity=".25"/><path d="M5 13c0-4.4 3.1-8 7-8s7 3.6 7 8"/><path d="M3.5 13h17M8 16l4 3 4-3"/>' },
  'queue:diplomat': { color: C.trade, svg: '<path d="M6 3.5h10.5a2 2 0 0 1 2 2V18a2.5 2.5 0 0 1-2.5 2.5H7.5"/><path d="M6 3.5A2.5 2.5 0 0 0 3.5 6v1.5H6M7.5 20.5A2.5 2.5 0 0 1 5 18V3.5"/><path d="M9 9h6.5M9 12.5h6.5M9 16h4"/>' },
  'queue:spy': { color: C.exotics, svg: '<path d="M2.5 12c2.4-4 5.6-6 9.5-6s7.1 2 9.5 6c-2.4 4-5.6 6-9.5 6s-7.1-2-9.5-6Z"/><circle cx="12" cy="12" r="3" fill="currentColor"/>' },
  'queue:wonder': { color: C.exotics, svg: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" stroke-dasharray="2 1.6"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>' },

  // Interface
  'ui:add': { color: C.neutral, svg: '<path d="M12 6v12M6 12h12"/>' },
  'ui:locked': { color: C.neutral, svg: '<rect x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>' },
};

/** The colour an icon is drawn in (also used for its tile's accent). */
export function iconColor(key: string): string {
  return ICONS[key]?.color ?? C.neutral;
}

/** Whether replacement artwork is installed for a key. */
export function hasIconFile(key: string): boolean {
  return key in FILES;
}

/** An icon, `px` square: the replacement artwork if there is one, else the built-in drawing. */
export function iconElement(key: string, px = 20, title = ''): HTMLElement {
  const el = document.createElement('span');
  el.className = 'icon';
  el.style.width = el.style.height = `${px}px`;
  if (title) el.title = title;
  const file = FILES[key];
  if (file) {
    const img = document.createElement('img');
    img.src = file;
    img.alt = title;
    img.draggable = false;
    el.append(img);
    return el;
  }
  const def = ICONS[key] ?? ICONS['ui:add'];
  el.style.color = def.color;
  el.innerHTML = `<svg viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.svg}</svg>`;
  return el;
}
