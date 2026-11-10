/** A roster gallery: every faction's ship tokens, used by the faction picker and for checking the art. */
import { DESIGNS_BY_FACTION } from '../data/designs';
import { FACTIONS } from '../data/factions';
import { CLASSES, ROLES } from '../data/ships';
import { tokenElement } from './tokens';

export function rosterStrip(factionId: string, px = 48): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'roster';
  const designs = [...DESIGNS_BY_FACTION[factionId]].sort((a, b) => CLASSES[a.cls].size - CLASSES[b.cls].size);
  for (const d of designs) {
    const cell = document.createElement('div');
    cell.className = 'roster-cell';
    cell.title = `${d.name}: ${CLASSES[d.cls].name}, ${ROLES[d.role].name}`;
    const img = tokenElement(d.id, px * 2);
    img.style.width = img.style.height = `${px}px`;
    cell.appendChild(img);
    const label = document.createElement('div');
    label.className = 'roster-label';
    label.textContent = d.name;
    cell.appendChild(label);
    wrap.appendChild(cell);
  }
  return wrap;
}

export function showGallery(root: HTMLElement): void {
  root.innerHTML = '';
  root.style.overflow = 'auto';
  for (const f of FACTIONS) {
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 16px;border-bottom:1px solid #1c2440';
    row.innerHTML = `<div style="color:${f.color};font-weight:600">${f.name} <span style="opacity:.6;font-weight:400">(${f.style})</span></div>`;
    row.appendChild(rosterStrip(f.id, 40));
    root.appendChild(row);
  }
}
