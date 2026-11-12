/**
 * What each minor faction sells on the mercenary market (§9.6), and on what terms. Every minor sells something:
 * ships of the roles that suit it (cargo ships from traders, warships from soldiers, science ships from
 * scholars, colony ships and constructors from builders), spies, hired armies and star charts. Some offers
 * come only with a relationship: an embassy, a Trade Agreement, a running trade route, a pact or an alliance.
 * Prices are set in src/engine/mercenaries.ts and move with the seller's opinion of the buyer.
 */
export type SaleReq = 'embassy' | 'trade' | 'route' | 'pact' | 'alliance';

/** What a buyer has to have with the seller, in words (shown where an offer is out of reach). */
export const SALE_REQ_TEXT: Record<SaleReq, string> = {
  embassy: 'an embassy with them',
  trade: 'a Trade Agreement with them',
  route: 'a trade route running between you',
  pact: 'a non-aggression pact or alliance with them',
  alliance: 'an alliance with them',
};

export type SaleSpec =
  /** Ships of the given roles from the seller's own designs, delivered at its home system. */
  | { kind: 'ship'; roles: string[]; count?: number; req?: SaleReq }
  /** A spy, delivered to the buyer's home system. */
  | { kind: 'spy'; count?: number; req?: SaleReq }
  /** A veteran army hired for 10 turns. */
  | { kind: 'army'; count?: number; req?: SaleReq }
  /** A copy of everything the seller has explored. */
  | { kind: 'charts'; req?: SaleReq };

const warships = ['line', 'escort', 'carrier'];

export const SALES: Record<string, SaleSpec[]> = {
  myrr: [{ kind: 'ship', roles: ['science'], req: 'embassy' }, { kind: 'ship', roles: ['cargo'] }],
  quorr: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'ship', roles: ['line'], count: 2 }],
  thessic: [{ kind: 'ship', roles: ['line', 'escort'], count: 2 }, { kind: 'ship', roles: ['cargo'] }],
  ghaltar: [{ kind: 'ship', roles: ['raider'], count: 2 }, { kind: 'ship', roles: ['cargo'] }],
  ixxi: [{ kind: 'ship', roles: ['line', 'carrier'], count: 2, req: 'alliance' }],
  celestine: [{ kind: 'army', count: 2, req: 'pact' }, { kind: 'ship', roles: ['transport'], req: 'pact' }, { kind: 'ship', roles: ['escort'] }],
  voidborn: [{ kind: 'ship', roles: ['explore'] }, { kind: 'ship', roles: ['cargo'] }],
  aurelian: [{ kind: 'ship', roles: ['science'], req: 'embassy' }, { kind: 'charts', req: 'trade' }],
  korrigan: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'ship', roles: ['constructor'], req: 'trade' }],
  sylph: [{ kind: 'ship', roles: ['colony'], req: 'trade' }, { kind: 'ship', roles: ['cargo'] }],
  nhar: [{ kind: 'spy', count: 2, req: 'embassy' }, { kind: 'ship', roles: ['scout', 'raider'], req: 'embassy' }],
  brakk: [{ kind: 'army', count: 2 }, { kind: 'ship', roles: ['transport'] }],
  ophidian: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'spy', req: 'trade' }, { kind: 'ship', roles: ['raider'] }],
  lumen: [{ kind: 'ship', roles: ['line'], count: 2, req: 'embassy' }],
  cryx: [{ kind: 'ship', roles: ['line'], req: 'alliance' }],
  taurine: [{ kind: 'ship', roles: ['escort', 'line'], count: 2, req: 'pact' }, { kind: 'ship', roles: ['cargo'] }],
  echo: [{ kind: 'ship', roles: ['science'], req: 'embassy' }, { kind: 'spy', req: 'embassy' }, { kind: 'ship', roles: ['scout'] }],
  vesh: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'spy', count: 2, req: 'embassy' }],
  haldane: [{ kind: 'ship', roles: ['cargo'], count: 2 }, { kind: 'ship', roles: ['escort'] }],
  grendis: [{ kind: 'army', count: 2 }, { kind: 'ship', roles: ['transport'], req: 'trade' }],
  pelagic: [{ kind: 'ship', roles: ['colony'], req: 'trade' }, { kind: 'ship', roles: ['escort', 'line'] }],
  zenith: [{ kind: 'charts' }, { kind: 'ship', roles: ['science'], req: 'embassy' }, { kind: 'ship', roles: ['scout'] }],
  morrow: [{ kind: 'ship', roles: ['line', 'carrier'], count: 2, req: 'alliance' }],
  kethran: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'ship', roles: ['line'], req: 'route' }],
  skarn: [{ kind: 'ship', roles: ['raider'] }, { kind: 'army', req: 'pact' }],
  ilyrian: [{ kind: 'ship', roles: ['cargo'] }, { kind: 'spy', req: 'embassy' }, { kind: 'ship', roles: ['escort'], req: 'pact' }],
  forgeborn: [{ kind: 'ship', roles: warships, count: 2, req: 'embassy' }, { kind: 'ship', roles: ['constructor'] }, { kind: 'ship', roles: ['cargo'] }],
  tal: [{ kind: 'ship', roles: ['explore'] }, { kind: 'ship', roles: ['science'], req: 'embassy' }, { kind: 'charts', req: 'route' }],
  hollowsun: [{ kind: 'ship', roles: ['line'], count: 2, req: 'pact' }],
  mechanist: [{ kind: 'ship', roles: ['line', 'escort'], count: 2 }, { kind: 'ship', roles: ['constructor'], req: 'trade' }],
};
