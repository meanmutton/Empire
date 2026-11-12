/** What a faction trades, in words, for the faction guide (no DOM, so it can be tested). Built from the sales table. */
import { DESIGNS_BY_FACTION } from '../data/designs';
import { SALE_REQ_TEXT, SALES } from '../data/sales';
import { ROLES, type ShipRole } from '../data/ships';

export interface SaleLine {
  /** What is sold: "Cargo Vessel", "Spy", "Veteran army", "Star charts". */
  what: string;
  /** The faction's own ships it would be, when a ship is sold. */
  ships: string[];
  /** How many a round, when more than one. */
  perRound: number;
  /** What the buyer needs, or null when anyone at peace with them may buy. */
  needs: string | null;
}

/** Everything a minor faction offers on the mercenary market. Great powers offer nothing there. */
export function saleLines(id: string): SaleLine[] {
  return (SALES[id] ?? []).map((spec) => {
    const needs = spec.req ? SALE_REQ_TEXT[spec.req] : null;
    switch (spec.kind) {
      case 'ship': {
        const ships = DESIGNS_BY_FACTION[id].filter((d) => d.cls !== 'fighter' && spec.roles.includes(d.role)).map((d) => d.name);
        return { what: spec.roles.map((r) => ROLES[r as ShipRole].name).join(' or '), ships, perRound: Math.min(spec.count ?? 1, ships.length), needs };
      }
      case 'spy': return { what: 'Spy', ships: [], perRound: spec.count ?? 1, needs };
      case 'army': return { what: 'Veteran army (hired for 10 turns)', ships: [], perRound: spec.count ?? 1, needs };
      default: return { what: 'Star charts (everything they have explored)', ships: [], perRound: 1, needs };
    }
  });
}

/** The faction's cargo ships: the ones that open trade routes. */
export function cargoShips(id: string): string[] {
  return DESIGNS_BY_FACTION[id].filter((d) => d.role === 'cargo').map((d) => d.name);
}
