/**
 * The galactic exchange (§5.5): any faction can swap one stockpiled resource for another at public prices.
 * Selling pushes a resource's price down and buying pushes it up; prices drift back toward normal every
 * round. Ordinary traders pay a 40% fee; the Ophidian Syndicate (Black Market) pays none, and anyone with
 * a trade agreement with them pays 20%.
 */
import { hasAbility } from '../data/factions';
import { log } from './events';
import { relation } from './query';
import type { FactionId, GameState, StockpileKind } from './types';

export const BASE_PRICES: Record<StockpileKind, number> = { energy: 1, metals: 1.2, exotics: 4 };
export const EXCHANGE_FEE = 0.4;
const RECOVERY = 0.15;

export function prices(state: GameState): Record<StockpileKind, number> {
  return state.market?.prices ?? { ...BASE_PRICES };
}

/** Money that has to move to shift a price by 100% (grows as economies grow). */
function liquidity(state: GameState): number {
  return 1500 + 40 * state.turn;
}

/** Fraction of value lost to fees for this faction. */
export function exchangeFee(state: GameState, faction: FactionId): number {
  if (hasAbility(faction, 'blackMarket')) return 0;
  for (const f of Object.keys(state.factions)) {
    if (f === faction || !hasAbility(f, 'blackMarket') || !state.factions[f].alive) continue;
    const r = relation(state, faction, f);
    if (r.status !== 'war' && r.agreements.includes('trade')) return 0.2;
  }
  return EXCHANGE_FEE;
}

/** How much of `buy` you would get for `amount` of `sell` right now. */
export function quote(state: GameState, faction: FactionId, sell: StockpileKind, buy: StockpileKind, amount: number): number {
  if (sell === buy || amount <= 0) return 0;
  const p = prices(state);
  return Math.floor((amount * p[sell] / p[buy]) * (1 - exchangeFee(state, faction)) * 10) / 10;
}

export type Result = { ok: true; text?: string } | { ok: false; reason: string };

export function exchange(state: GameState, faction: FactionId, sell: StockpileKind, buy: StockpileKind, amount: number): Result {
  if (!(sell in BASE_PRICES) || !(buy in BASE_PRICES) || sell === buy) return { ok: false, reason: 'Pick two different resources.' };
  amount = Math.floor(amount);
  if (!(amount >= 1)) return { ok: false, reason: 'Trade at least 1.' };
  const stock = state.factions[faction].stock;
  if (stock[sell] < amount) return { ok: false, reason: `You only have ${Math.floor(stock[sell])} ${sell}.` };
  const got = quote(state, faction, sell, buy, amount);
  if (got <= 0) return { ok: false, reason: 'Too small to trade.' };
  stock[sell] = Math.round((stock[sell] - amount) * 10) / 10;
  stock[buy] = Math.round((stock[buy] + got) * 10) / 10;
  state.market ??= { prices: { ...BASE_PRICES } };
  const p = state.market.prices;
  const value = amount * p[sell];
  const clamp = (k: StockpileKind, v: number) => Math.min(BASE_PRICES[k] * 2, Math.max(BASE_PRICES[k] * 0.5, v));
  p[sell] = round3(clamp(sell, p[sell] * (1 - value / liquidity(state))));
  p[buy] = round3(clamp(buy, p[buy] * (1 + value / liquidity(state))));
  log(state, [faction], 'exchange', `Sold ${amount} ${sell} on the galactic exchange for ${got} ${buy}.`);
  return { ok: true, text: `Received ${got} ${buy}.` };
}

/** Prices drift back toward normal once per round. */
export function relaxMarket(state: GameState): void {
  if (!state.market) return;
  for (const k of Object.keys(BASE_PRICES) as StockpileKind[]) {
    const p = state.market.prices[k];
    state.market.prices[k] = round3(p + (BASE_PRICES[k] - p) * RECOVERY);
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
