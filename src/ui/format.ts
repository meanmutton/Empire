import { factionDef } from '../data/factions';
import type { FactionId } from '../engine/types';
import { h } from './dom';

export const ICON = { energy: '⚡', metals: '⛏', exotics: '✦', science: '🔬', population: '👥' } as const;

export function num(x: number): string {
  const r = Math.round(x * 10) / 10;
  if (Math.abs(r) >= 1000) return `${(r / 1000).toFixed(1)}k`;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function signed(x: number): string {
  return `${x >= 0 ? '+' : ''}${num(x)}`;
}

export function factionChip(id: FactionId, short = false): HTMLElement {
  const d = factionDef(id);
  return h('span', { class: 'chip', style: `--c:${d.color}` }, h('span', { class: 'dot' }), short ? d.short : d.name);
}

export function costText(c: { metals?: number; energy?: number; exotics?: number; population?: number }): string {
  const parts: string[] = [];
  if (c.metals) parts.push(`${ICON.metals}${num(c.metals)}`);
  if (c.energy) parts.push(`${ICON.energy}${num(c.energy)}`);
  if (c.exotics) parts.push(`${ICON.exotics}${num(c.exotics)}`);
  if (c.population) parts.push(`${ICON.population}${num(c.population)}`);
  return parts.join(' ');
}
