/**
 * The complete game state. Everything here is plain JSON (no classes, maps or functions) so it can be
 * serialized, hashed, uploaded to the relay and replayed. Locations are hex indices (row * width + col).
 */
import type { RngState } from './rng';
import type { DoctrineId, RangeBand } from '../data/doctrines';
import type { PresetId } from '../data/victories';
import type { SaleReq } from '../data/sales';

export const STATE_SCHEMA_VERSION = 1;

export type FactionId = string;
export type Id = string;

export const STOCKPILED = ['energy', 'metals', 'exotics'] as const;
export type StockpileKind = (typeof STOCKPILED)[number];
export const RESOURCE_KINDS = ['energy', 'metals', 'population', 'science', 'exotics'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type Resources = Record<ResourceKind, number>;
export type Stockpile = Record<StockpileKind, number>;

export type Terrain =
  | 'space' | 'asteroids' | 'nebula' | 'neutronStar' | 'pulsar' | 'blackHole' | 'ionStorm' | 'wormhole';

export type StarKind = 'yellow' | 'orange' | 'red' | 'blue' | 'white' | 'neutron' | 'pulsar';

export type PlanetKind =
  | 'terran' | 'ocean' | 'jungle' | 'desert' | 'arctic' | 'barren' | 'volcanic' | 'gasGiant' | 'asteroidBelt';

export interface StarSystem {
  name: string;
  star: StarKind;
  planet: PlanetKind;
  /** Improvement slots available at full development (1–5). */
  size: number;
  /** 0 unclaimed .. 5 core world. */
  development: number;
  improvements: string[];
  /** Population in millions-ish units; grows toward popCap. */
  population: number;
  /** Faction whose home this is, if any. */
  homeOf: FactionId | null;
  /** Planetary defense points (absorbs damage and shoots back in battles). */
  defense: number;
  /** Ground garrison strength. */
  garrison: number;
  /** 0–100; high unrest cuts output and can cause revolt or defection. */
  unrest: number;
  /** One-time survey reward still present. */
  ruins: boolean;
  /** Turns remaining on the build queue item at the head, etc. */
  queue: BuildOrder[];
}

export interface BuildOrder {
  kind: 'ship' | 'army' | 'improvement' | 'starbase' | 'spy' | 'diplomat' | 'develop' | 'wonder';
  /** Ship design id, improvement id, etc. */
  item: string;
  /** Production points still needed. */
  remaining: number;
  /** Production points when queued: work has begun once `remaining` drops below it. */
  total?: number;
  /** What was paid when it was queued (refunded in full if cancelled before work begins, half after). */
  paid?: { metals: number; energy: number; exotics: number; population: number };
}

export interface Hex {
  terrain: Terrain;
  system: StarSystem | null;
  owner: FactionId | null;
  /** Faction that will claim this hex at the start of its next turn (§5.3). */
  pendingClaim: FactionId | null;
  /** Turn since which this hex's owner has had no planet, outpost or starbase connected to it (§5.3). */
  orphanSince?: number;
  /** A monitoring outpost here (built by a constructor; it belongs to the hex's owner): holds the hex and watches
   *  around it as far as the owner's scouts see (§5.3). */
  outpost?: boolean;
  /** Wormhole twin hex index. */
  wormhole: number | null;
}

export interface MapState {
  width: number;
  height: number;
  hexes: Hex[];
}

export interface Ship {
  id: Id;
  owner: FactionId;
  design: string;
  hull: number;
  fleet: Id;
  xp: number;
  /** Fighters currently aboard (carriers). */
  fighters: number;
  /** Armies, agents or colonists aboard. */
  cargo: Id[];
}

/** A battle group: up to 6 ships moving and fighting together. A lone ship is a fleet of one. */
export interface Fleet {
  id: Id;
  owner: FactionId;
  name: string;
  hex: number;
  ships: Id[];
  movesLeft: number;
  /** Queued destination path (excluding current hex). */
  path: number[];
  /** Standing combat orders (§7.2). */
  doctrine: DoctrineId;
  /** Holding position on purpose: not counted as idle. Cleared when the fleet is given a destination. */
  hold?: boolean;
  /** A shipyard's reserve: new warships built there join it until it has 6 or is sent somewhere. */
  reserve?: boolean;
}

export interface Army {
  id: Id;
  owner: FactionId;
  strength: number;
  xp: number;
  /** Hex of the system it is garrisoned at, or null when aboard a ship. */
  hex: number | null;
  ship: Id | null;
  /** Hired from a mercenary faction: returns to it after `until`. */
  rentedFrom?: FactionId;
  until?: number;
}

export type AgentKind = 'spy' | 'diplomat';

export interface Agent {
  id: Id;
  owner: FactionId;
  kind: AgentKind;
  hex: number;
  /** Ship carrying it, if any. */
  ship: Id | null;
  path: number[];
  /** Diplomat: faction it is heading to / resident with. Spy: target faction. */
  target: FactionId | null;
  mission: string | null;
  progress: number;
  /** Diplomat: has founded an embassy and is resident. */
  resident: boolean;
  /** Captured by this faction (held prisoner). */
  capturedBy: FactionId | null;
  /** Hexes already moved this turn. */
  moved?: number;
}

export interface Starbase {
  id: Id;
  owner: FactionId;
  hex: number;
  tier: number;
  hull: number;
}

export type RelationStatus = 'war' | 'hostile' | 'neutral' | 'relations' | 'nap' | 'alliance';

export interface Relation {
  /** The two factions, sorted. */
  a: FactionId;
  b: FactionId;
  contact: boolean;
  status: RelationStatus;
  /** Turn the status last changed. */
  since: number;
  /** a has an embassy with b, b has an embassy with a. */
  embassyA: boolean;
  embassyB: boolean;
  agreements: string[];
  /** Who declared the current war, if at war. */
  aggressor: FactionId | null;
  /** Opinion of a toward b and b toward a, −100..100. */
  opinionAB: number;
  opinionBA: number;
}

export interface Research {
  known: string[];
  current: string | null;
  progress: number;
}

export interface FactionState {
  id: FactionId;
  kind: 'major' | 'minor';
  controller: 'human' | 'ai';
  /** Display name of the human player, if any. */
  player: string | null;
  alive: boolean;
  stock: Stockpile;
  research: Research;
  /** Hex index of the home system. */
  home: number;
  /** Major that holds this minor as a vassal. */
  overlord: FactionId | null;
  /** Bitset of explored hexes (hex string, 4 hexes per char). */
  explored: string;
  /** Faction-specific counters for abilities (cooldowns, mobilization, etc.). */
  flags: Record<string, number>;
  /** Great powers: who leads them, as a leader id from src/data/leaders.ts, or 'self' (the human player). */
  leader?: string;
}

export interface Proposal {
  id: Id;
  from: FactionId;
  to: FactionId;
  turn: number;
  /** What the proposer gives. */
  give: TradeItem[];
  /** What the proposer asks for. */
  receive: TradeItem[];
  /** Set once answered. */
  answer: 'accepted' | 'rejected' | null;
}

export interface Payment {
  from: FactionId;
  to: FactionId;
  resource: StockpileKind;
  amount: number;
  /** Last turn (inclusive) on which it is paid. */
  until: number;
}

export type TradeItem =
  | { kind: 'resource'; resource: StockpileKind; amount: number; perTurn?: number }
  | { kind: 'tech'; tech: string }
  /** A technology of the giver's choice: on acceptance, the cheapest one it knows and the taker lacks. */
  | { kind: 'anyTech' }
  | { kind: 'fleet'; fleet: Id }
  | { kind: 'hex'; hex: number }
  | { kind: 'army'; army: Id }
  | { kind: 'agreement'; agreement: string }
  | { kind: 'status'; status: RelationStatus }
  | { kind: 'vassal' }
  | { kind: 'returnAgent'; agent: Id }
  | { kind: 'map' };

export interface GameEvent {
  turn: number;
  /** Factions that should see this in their turn report; empty = everyone. */
  to: FactionId[];
  kind: string;
  text: string;
  hex?: number;
  /** Structured details for computer players (e.g. ships lost per faction in a battle). */
  data?: Record<string, number>;
  /** state.seq when it happened (orders events within a round). */
  seq?: number;
  /** Id of a detailed record (e.g. a BattleRecord). */
  ref?: string;
}

/** One side of a recorded battle. */
export interface BattleSide {
  faction: FactionId;
  /** Attack after shields, point defense and modifiers. */
  attack: number;
  /** Total effective hit points (hull + shields, × toughness). */
  durability: number;
  /** Damage (in effective hit points) this side dealt and took. */
  dealt: number;
  taken: number;
  ships: { design: string; before: number; destroyed: number; captured: number; damaged: number; crippled?: number; hullBefore: number; hullAfter: number }[];
  fighters: { before: number; after: number };
  starbase?: { tier: number; hullBefore: number; hullAfter: number };
  planet?: { system: string; defenseBefore: number; defenseAfter: number };
  /** Why this side hit as hard as it did (bonuses, penalties, enemy shields and point defense). */
  notes: string[];
  /** Fleets of this side that withdrew from the battle, and those that were cut off trying. */
  withdrew?: number;
  /** Build value this side lost (ships destroyed or damaged, starbase and planetary defense). */
  valueLost?: number;
  /** Critical hits this side scored. */
  crits?: number;
}

/** One combat round inside a battle. */
export interface BattleRoundLog {
  n: number;
  range: RangeBand;
  /** What happened: events, notable critical hits, withdrawals. */
  lines: string[];
  sides: { faction: FactionId; dealt: number; taken: number; lost: number }[];
}

export interface BattleRecord {
  id: Id;
  turn: number;
  seq: number;
  hex: number;
  place: string;
  terrain: Terrain;
  firstRound: boolean;
  sides: BattleSide[];
  /** Combat rounds fought, and the most the game allows per battle. */
  fought?: number;
  maxRounds?: number;
  rounds?: BattleRoundLog[];
  /** The side that came out ahead (its enemies lost more value than it did), or null for a draw. */
  winner?: FactionId | null;
}

/**
 * A mercenary market offer. `price` is the list price in energy; what a buyer pays moves with the seller's opinion
 * of them (offerPrice). `req` is the relationship a buyer needs with the seller, if any.
 */
export type Offer =
  | { id: Id; seller: FactionId; kind: 'ship'; design: string; price: number; req?: SaleReq }
  | { id: Id; seller: FactionId; kind: 'army'; strength: number; xp: number; turns: number; price: number; req?: SaleReq }
  | { id: Id; seller: FactionId; kind: 'spy'; price: number; req?: SaleReq }
  | { id: Id; seller: FactionId; kind: 'charts'; price: number; req?: SaleReq };

export interface TradeRoute {
  id: Id;
  /** The faction that established it (its cargo ship became the route). */
  owner: FactionId;
  /** The partner (the owner itself for a domestic route). */
  partner: FactionId;
  /** The owner's system and the partner's system. */
  from: number;
  to: number;
  /** Hexes between them, endpoints included. */
  path: number[];
  since: number;
}

export interface Contract {
  id: Id;
  buyer: FactionId;
  seller: FactionId;
  /** The seller's shipyard where the ship is built and delivered. */
  hex: number;
  design: string;
  remaining: number;
}

/** A diplomatic statement a human makes to a computer power (§9.8). */
export type Statement =
  | { kind: 'withdraw' }
  | { kind: 'requestAid'; target: FactionId }
  | { kind: 'threaten' }
  | { kind: 'reassure' }
  | { kind: 'askIntentions' }
  | { kind: 'denounce'; target: FactionId };

/** A message between a human and a computer power, kept in the game state so every client agrees. */
export interface Dispatch {
  /** Increasing number (from state.nextId), used for ordering and unread tracking. */
  n: number;
  turn: number;
  from: FactionId;
  to: FactionId;
  text: string;
  /** Set when a human makes a statement; the computer answers at the start of its next turn. */
  statement?: Statement;
  answered?: boolean;
}

export interface HumanSeat {
  faction: FactionId;
  name: string;
  /** A leader id from src/data/leaders.ts, or 'self' to lead as `name`. Omitted: the seed picks one. */
  leader?: string;
}

export interface GameConfig {
  width: number;
  height: number;
  seats: HumanSeat[];
  /** Minor factions in this game (chosen at setup). */
  minors: FactionId[];
  /** Victory preset (§10); decides the great powers in the galaxy and which victories count. */
  preset: PresetId;
  /** Great powers in this galaxy. */
  majors: FactionId[];
  turnLimit: number | null;
  /** Combat rounds per battle (3–10; default 5). More rounds make battles bloodier. */
  combatRounds?: number;
}

export interface GameState {
  schema: number;
  id: string;
  seed: string;
  rng: RngState;
  config: GameConfig;
  /** Round number, starting at 1. */
  turn: number;
  turnOrder: FactionId[];
  /** Index into turnOrder of the faction whose turn it is. */
  active: number;
  map: MapState;
  factions: Record<FactionId, FactionState>;
  fleets: Record<Id, Fleet>;
  ships: Record<Id, Ship>;
  armies: Record<Id, Army>;
  agents: Record<Id, Agent>;
  starbases: Record<Id, Starbase>;
  relations: Record<string, Relation>;
  proposals: Record<Id, Proposal>;
  /** Recurring resource transfers agreed in trades. */
  payments: Payment[];
  log: GameEvent[];
  /** Hex index → combat sequence number of the last round fought there (to detect a battle's first round). */
  battles: Record<number, number>;
  /** Increments every faction turn; used for battle round tracking. */
  seq: number;
  nextId: number;
  winner: FactionId | null;
  /** Mercenary market offers, refreshed every round. */
  offers?: Offer[];
  /** Trade routes run by cargo ships (§5.6). */
  routes?: TradeRoute[];
  /** Ships being built to order at another faction's shipyard. */
  contracts?: Contract[];
  /** Detailed records of recent battles (kept as long as the event log). */
  battleLog?: BattleRecord[];
  /** Galactic Council results: the last election's vote shares and consecutive wins per candidate. */
  council?: { turn: number; shares: Record<FactionId, number>; streak: Record<FactionId, number> };
  /** Galactic exchange prices (energy-equivalent value per unit). */
  market?: { prices: Record<StockpileKind, number> };
  /** Set when the game has ended, with or without a winner. */
  over?: { reason: string; turn: number };
  /**
   * Hot seat chat between humans (online games keep chat on the relay instead). Written only by the UI;
   * game rules never read it.
   */
  messages?: { id: string; from: FactionId; to: string[]; text: string; at: number; turn: number }[];
  /** Conversations with computer powers. */
  dispatches?: Dispatch[];
}
