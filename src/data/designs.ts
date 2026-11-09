/** Ship designs: every faction's roster expanded into concrete stats with static faction modifiers applied. */
import { CLASSES, deriveStats, ROLES, type ShipClass, type ShipRole, type ShipStats } from './ships';
import { FACTIONS, hasAbility, modifiersOf, parseRosterEntry } from './factions';

export interface ShipDesign {
  id: string;
  faction: string;
  name: string;
  cls: ShipClass;
  role: ShipRole;
  stats: ShipStats;
  cost: { metals: number; energy: number; exotics: number; population: number };
  buildPoints: number;
  upkeep: number;
  tech: string | null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildDesign(faction: string, entry: string): ShipDesign {
  const { cls, role, name } = parseRosterEntry(entry);
  const c = CLASSES[cls];
  const r = ROLES[role];
  const m = modifiersOf(faction);
  const base = deriveStats(cls, role);
  const stats: ShipStats = { ...base };
  stats.hull = Math.round(base.hull * (1 + m.hull));
  stats.shields = Math.round(base.shields * (1 + m.shields));
  const energyMult = 1 + m.attack + (hasAbility(faction, 'photonicWeapons') ? 0.25 : 0);
  stats.energy = Math.round(base.energy * energyMult);
  stats.missile = Math.round(base.missile * (1 + m.attack));
  stats.sensors = Math.max(1, base.sensors + m.sensors);
  if (cls !== 'fighter') stats.speed = Math.max(1, base.speed + m.movement);
  if (hasAbility(faction, 'pathfinders') && (role === 'scout' || role === 'explore')) {
    stats.speed += 1;
    stats.sensors += 2;
  }
  if (hasAbility(faction, 'cloakingFields')) stats.stealth = 3;
  let costMult = r.costMult * (1 + m.shipCost);
  if (hasAbility(faction, 'swarmTactics') && (cls === 'fighter' || cls === 'corvette')) costMult *= 0.7;
  return {
    id: `${faction}:${slug(name)}`,
    faction,
    name,
    cls,
    role,
    stats,
    cost: {
      metals: Math.round(c.cost.metals * costMult),
      energy: Math.round(c.cost.energy * costMult),
      exotics: c.cost.exotics,
      population: c.crew,
    },
    buildPoints: c.buildPoints,
    upkeep: c.upkeep,
    tech: c.tech,
  };
}

export const DESIGNS: Record<string, ShipDesign> = {};
export const DESIGNS_BY_FACTION: Record<string, ShipDesign[]> = {};
for (const f of FACTIONS) {
  DESIGNS_BY_FACTION[f.id] = [];
  for (const entry of f.roster) {
    const d = buildDesign(f.id, entry);
    if (DESIGNS[d.id]) throw new Error(`Duplicate design id ${d.id}`);
    DESIGNS[d.id] = d;
    DESIGNS_BY_FACTION[f.id].push(d);
  }
}

export function design(id: string): ShipDesign {
  const d = DESIGNS[id];
  if (!d) throw new Error(`Unknown ship design ${id}`);
  return d;
}

/** The faction's fighter design, if it has carriers. */
export function fighterDesign(faction: string): ShipDesign | undefined {
  return DESIGNS_BY_FACTION[faction].find((d) => d.cls === 'fighter');
}

/** Rough combat value of a design, used by AI and balance tests. */
export function combatValue(d: ShipDesign): number {
  const s = d.stats;
  return (s.energy + s.missile + s.hangar * 4 + s.pd * 0.5) * Math.sqrt(s.hull + s.shields * 3);
}
