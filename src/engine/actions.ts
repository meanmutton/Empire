/**
 * Every order a player can give, as plain data. The UI, the computer players and online replays all go
 * through `applyAction`, which checks that the acting faction is the active one and owns what it orders.
 */
import { hasAbility } from '../data/factions';
import {
  boardShip, disembark, executeAgent, expelDiplomat, moveAgent, recallDiplomat, sendDiplomat,
} from './agents';
import { retreatFleet } from './combat';
import { acceptProposal, cancelTreaty, declareWar, propose, rejectProposal } from './diplomacy';
import { cancelBuild, queueBuild, rushBuild } from './economy';
import { startMission, type MissionId } from './espionage';
import { invade, loadArmy, unloadArmy } from './ground';
import { buildOutpost, buildStarbase, colonize, mergeFleets, moveFleet, splitFleet } from './movement';
import { activeFaction } from './query';
import { setResearch } from './research';
import { endTurn } from './turn';
import type { BuildOrder, FactionId, Fleet, GameState, RelationStatus, Statement, StockpileKind, TradeItem } from './types';
import { exchange } from './market';
import { buyOffer, orderShip } from './mercenaries';
import { cancelRoute, establishRoute } from './routes';
import { makeStatement } from './dispatch';
import { isGameOver } from './victory';
import { RESOURCE_KINDS } from './types';

export type Action =
  | { type: 'move'; fleet: string; to: number }
  | { type: 'stop'; fleet: string }
  | { type: 'merge'; into: string; from: string }
  | { type: 'split'; fleet: string; ships: string[] }
  | { type: 'rename'; fleet: string; name: string }
  | { type: 'stance'; fleet: string; stance: Fleet['stance'] }
  | { type: 'retreat'; fleet: string }
  | { type: 'colonize'; fleet: string }
  | { type: 'outpost'; fleet: string }
  | { type: 'starbase'; fleet: string }
  | { type: 'build'; hex: number; kind: BuildOrder['kind']; item: string }
  | { type: 'cancelBuild'; hex: number; index: number }
  | { type: 'rush'; hex: number }
  | { type: 'research'; tech: string | null }
  | { type: 'loadArmy'; army: string; ship: string }
  | { type: 'unloadArmy'; army: string }
  | { type: 'invade'; fleet: string }
  | { type: 'moveAgent'; agent: string; to: number }
  | { type: 'sendDiplomat'; agent: string; target: FactionId }
  | { type: 'board'; agent: string; ship: string }
  | { type: 'disembark'; agent: string }
  | { type: 'recall'; agent: string }
  | { type: 'expel'; agent: string }
  | { type: 'execute'; agent: string }
  | { type: 'mission'; agent: string; mission: MissionId }
  | { type: 'declareWar'; target: FactionId }
  | { type: 'cancelTreaty'; target: FactionId }
  | { type: 'propose'; to: FactionId; give: TradeItem[]; receive: TradeItem[] }
  | { type: 'accept'; proposal: string }
  | { type: 'reject'; proposal: string }
  | { type: 'fiveYearPlan'; resource: (typeof RESOURCE_KINDS)[number] }
  | { type: 'mobilize'; on: boolean }
  | { type: 'statement'; to: FactionId; statement: Statement }
  | { type: 'exchange'; sell: StockpileKind; buy: StockpileKind; amount: number }
  | { type: 'buyOffer'; offer: string }
  | { type: 'orderShip'; seller: FactionId; design: string }
  | { type: 'establishRoute'; fleet: string }
  | { type: 'cancelRoute'; route: string }
  | { type: 'endTurn' };

export type ActionResult = { ok: true; text?: string; id?: string } | { ok: false; reason: string };

const no = (reason: string): ActionResult => ({ ok: false, reason });

export function applyAction(state: GameState, faction: FactionId, action: Action): ActionResult {
  if (isGameOver(state)) return no('The game is over.');
  if (activeFaction(state) !== faction) return no('It is not your turn.');
  const ownFleet = (id: string) => state.fleets[id]?.owner === faction;
  const ownAgent = (id: string) => state.agents[id]?.owner === faction;
  const ownShip = (id: string) => state.ships[id]?.owner === faction;
  switch (action.type) {
    case 'move':
      return ownFleet(action.fleet) ? moveFleet(state, action.fleet, action.to) : no('Not your fleet.');
    case 'stop':
      if (!ownFleet(action.fleet)) return no('Not your fleet.');
      state.fleets[action.fleet].path = [];
      return { ok: true };
    case 'merge':
      return ownFleet(action.into) && ownFleet(action.from) ? mergeFleets(state, action.into, action.from) : no('Not your fleets.');
    case 'split': {
      if (!ownFleet(action.fleet)) return no('Not your fleet.');
      const id = splitFleet(state, action.fleet, action.ships);
      return id ? { ok: true, id } : no('Cannot split like that.');
    }
    case 'rename':
      if (!ownFleet(action.fleet)) return no('Not your fleet.');
      state.fleets[action.fleet].name = action.name.slice(0, 40);
      return { ok: true };
    case 'stance':
      if (!ownFleet(action.fleet)) return no('Not your fleet.');
      state.fleets[action.fleet].stance = action.stance;
      return { ok: true };
    case 'retreat':
      return ownFleet(action.fleet) ? asResult(retreatFleet(state, action.fleet)) : no('Not your fleet.');
    case 'colonize':
      return ownFleet(action.fleet) ? colonize(state, action.fleet) : no('Not your fleet.');
    case 'outpost':
      return ownFleet(action.fleet) ? buildOutpost(state, action.fleet) : no('Not your fleet.');
    case 'starbase':
      return ownFleet(action.fleet) ? buildStarbase(state, action.fleet) : no('Not your fleet.');
    case 'build':
      return asCheck(queueBuild(state, faction, action.hex, action.kind, action.item));
    case 'cancelBuild':
      return cancelBuild(state, faction, action.hex, action.index) ? { ok: true } : no('Nothing to cancel.');
    case 'rush':
      return rushBuild(state, faction, action.hex) ? { ok: true } : no('Cannot rush that.');
    case 'research':
      return setResearch(state, faction, action.tech) ? { ok: true } : no('You cannot research that yet.');
    case 'loadArmy':
      return state.armies[action.army]?.owner === faction && ownShip(action.ship) ? loadArmy(state, action.army, action.ship) : no('Not yours.');
    case 'unloadArmy':
      return state.armies[action.army]?.owner === faction ? unloadArmy(state, action.army) : no('Not your army.');
    case 'invade':
      return ownFleet(action.fleet) ? invade(state, action.fleet) : no('Not your fleet.');
    case 'moveAgent':
      return ownAgent(action.agent) ? moveAgent(state, action.agent, action.to) : no('Not your agent.');
    case 'sendDiplomat':
      return ownAgent(action.agent) ? sendDiplomat(state, action.agent, action.target) : no('Not your agent.');
    case 'board':
      return ownAgent(action.agent) && ownShip(action.ship) ? boardShip(state, action.agent, action.ship) : no('Not yours.');
    case 'disembark':
      return ownAgent(action.agent) ? disembark(state, action.agent) : no('Not your agent.');
    case 'recall':
      return ownAgent(action.agent) ? recallDiplomat(state, action.agent) : no('Not your agent.');
    case 'expel':
      return expelDiplomat(state, faction, action.agent);
    case 'execute':
      return executeAgent(state, faction, action.agent);
    case 'mission':
      return ownAgent(action.agent) ? startMission(state, action.agent, action.mission) : no('Not your agent.');
    case 'declareWar':
      return declareWar(state, faction, action.target);
    case 'cancelTreaty':
      return cancelTreaty(state, faction, action.target);
    case 'propose':
      return propose(state, faction, action.to, action.give, action.receive);
    case 'accept':
      return state.proposals[action.proposal]?.to === faction ? acceptProposal(state, action.proposal) : no('Not addressed to you.');
    case 'reject':
      return state.proposals[action.proposal]?.to === faction ? rejectProposal(state, action.proposal) : no('Not addressed to you.');
    case 'fiveYearPlan':
      return fiveYearPlan(state, faction, action.resource);
    case 'mobilize':
      return mobilize(state, faction, action.on);
    case 'statement':
      return makeStatement(state, faction, action.to, action.statement);
    case 'exchange':
      return exchange(state, faction, action.sell, action.buy, action.amount);
    case 'buyOffer':
      return buyOffer(state, faction, action.offer);
    case 'orderShip':
      return orderShip(state, faction, action.seller, action.design);
    case 'establishRoute':
      return ownFleet(action.fleet) ? establishRoute(state, action.fleet) : no('Not your fleet.');
    case 'cancelRoute':
      return cancelRoute(state, faction, action.route);
    case 'endTurn':
      endTurn(state);
      return { ok: true };
    default:
      return no('Unknown order.');
  }
}

function asResult(r: { ok: boolean; reason?: string }): ActionResult {
  return r.ok ? { ok: true } : no(r.reason ?? 'Not possible.');
}

function asCheck(r: { ok: boolean; reason?: string } & object): ActionResult {
  return r.ok ? { ok: true } : no((r as { reason: string }).reason);
}

/** Krasnyr Five-Year Plan: +50% of one resource for 5 turns, then −10% for 5; once every 10 turns. */
export function fiveYearPlan(state: GameState, faction: FactionId, resource: (typeof RESOURCE_KINDS)[number]): ActionResult {
  if (!hasAbility(faction, 'fiveYearPlan')) return no('Only the Krasnyr run Five-Year Plans.');
  const f = state.factions[faction];
  if ((f.flags.planReadyAt ?? 0) > state.turn) return no(`The next plan can start on turn ${f.flags.planReadyAt}.`);
  const idx = RESOURCE_KINDS.indexOf(resource);
  if (idx < 0 || resource === 'population') return no('Pick energy, metals, science or exotics.');
  f.flags.planResource = idx;
  f.flags.planBoostUntil = state.turn + 5;
  f.flags.planSlumpUntil = state.turn + 10;
  f.flags.planReadyAt = state.turn + 10;
  return { ok: true };
}

/** Varrhen Total Mobilization: double production and halve science; standing down takes 3 turns. */
export function mobilize(state: GameState, faction: FactionId, on: boolean): ActionResult {
  if (!hasAbility(faction, 'totalMobilization')) return no('Only the Varrhen can mobilize.');
  const f = state.factions[faction];
  if (on) {
    f.flags.mobilized = 1;
    delete f.flags.demobilizeAt;
  } else if (f.flags.mobilized) {
    f.flags.demobilizeAt = state.turn + 3;
  }
  return { ok: true };
}

export type { RelationStatus };
