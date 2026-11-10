/**
 * Leader and envoy portraits (art/portraits → src/ui/assets/portraits via scripts/portraits.py). A great power
 * shows its leader; a minor faction shows its envoy. Anyone without a picture yet (or a human leading as
 * themselves) shows the faction emblem in the same frame.
 */
import { factionDef } from '../data/factions';
import { defaultLeader, LEADER_TITLES, LEADERS, SELF_LEADER } from '../data/leaders';
import type { FactionId, GameState } from '../engine/types';
import { h } from './dom';
import { glyphElement } from './glyphs';

const IMAGES: Record<string, string> = {};
for (const [path, url] of Object.entries(import.meta.glob<string>('./assets/portraits/*.webp', { eager: true, import: 'default' }))) {
  IMAGES[path.replace(/^.*\//, '').replace(/\.webp$/, '')] = url;
}

export interface LeaderInfo {
  /** "Sean Sutton", or the player's name. */
  name: string;
  /** "First Speaker Sean Sutton". Minor factions: "Myrr envoy". */
  full: string;
  /** Picture key (file name without extension), if this one should have a picture. */
  portrait?: string;
}

/** Who speaks for a faction in this game. */
export function leaderInfo(g: GameState, faction: FactionId): LeaderInfo {
  const def = factionDef(faction);
  const f = g.factions[faction];
  if (def.kind === 'minor') return { name: `${def.short} envoy`, full: `${def.short} envoy`, portrait: `minor-${faction}` };
  return leaderById(faction, f?.leader ?? defaultLeader(g.seed, faction), f?.player ?? undefined);
}

/** A great power's leader by id ('self' leads under the player's own name). */
export function leaderById(faction: FactionId, id: string | undefined, playerName?: string): LeaderInfo {
  const title = LEADER_TITLES[faction] ?? '';
  const l = LEADERS[faction]?.find((x) => x.id === id);
  if (id === SELF_LEADER || !l) {
    const name = playerName || factionDef(faction).short;
    return { name, full: title ? `${title} ${name}` : name };
  }
  return { name: l.name, full: title ? `${title} ${l.name}` : l.name, portrait: `${faction}-${l.id}` };
}

/** Whether a picture exists yet for this key. */
export function hasPortrait(key: string | undefined): boolean {
  return !!key && key in IMAGES;
}

/**
 * A portrait frame: `size` is the width in pixels (height is 5/4 of it), or 'avatar' for a small round face.
 * Falls back to the faction emblem.
 */
export function portraitElement(faction: FactionId, key: string | undefined, size: number | 'avatar', title = ''): HTMLElement {
  const def = factionDef(faction);
  const avatar = size === 'avatar';
  const w = avatar ? 34 : size;
  const frame = h('div', {
    class: `portrait ${avatar ? 'avatar' : ''}`, title,
    style: `width:${w}px;height:${avatar ? w : Math.round(w * 1.25)}px;border-color:${def.color}`,
  });
  const url = key ? IMAGES[key] : undefined;
  if (url) frame.append(h('img', { src: url, alt: title, draggable: false }));
  else frame.append(glyphElement(faction, def.color, Math.round(w * (avatar ? 0.55 : 0.5))));
  return frame;
}
