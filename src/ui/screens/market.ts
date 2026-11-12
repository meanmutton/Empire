/** Market: the galactic exchange, trade routes, mercenaries and shipyard contracts (a section of Diplomacy). */
import { design, DESIGNS_BY_FACTION } from '../../data/designs';
import { factionDef } from '../../data/factions';
import { CLASSES, ROLES } from '../../data/ships';
import { BASE_PRICES, exchangeFee, prices, quote } from '../../engine/market';
import { SALE_REQ_TEXT } from '../../data/sales';
import { contractCost, contractTerms, lockedOfferCount, OFFERS_PER_ROUND, offersFor } from '../../engine/mercenaries';
import { canTradeWith, DOMESTIC_MIN_DISTANCE, routeCapacity, routeDisruptors, routeOptions, routesOf, routeValue } from '../../engine/routes';
import { getBit } from '../../engine/bitset';
import { hexDistance } from '../../engine/hex';
import { fleetSpeed, relation } from '../../engine/query';
import { costText, factionChip } from '../format';
import type { StockpileKind } from '../../engine/types';
import { button, h, toast } from '../dom';
import { infoTip } from '../tooltip';
import { collapsibleUnavailable } from '../collapse';
import { ICON, num } from '../format';
import type { GameUI } from '../game-ui';

export type MarketTab = 'exchange' | 'mercenaries' | 'contracts' | 'routes';

const RES: StockpileKind[] = ['energy', 'metals', 'exotics'];

/**
 * The market, shown inside Diplomacy: the galactic exchange, trade routes, mercenaries and shipyard
 * contracts, one tab each. `tab` is the open tab; `pick` switches tabs and `rerender` redraws after an order.
 */
export function marketPane(ui: GameUI, tab: MarketTab, pick: (t: MarketTab) => void, rerender: () => void): HTMLElement {
  const body = h('div');
  const tabs: [MarketTab, string][] = [['exchange', 'Galactic exchange'], ['routes', 'Trade routes'], ['mercenaries', 'Mercenaries & services'], ['contracts', 'Shipyard contracts']];
  body.append(h('div', { class: 'tabs' }, ...tabs.map(([k, label]) => button(label, () => pick(k), { cls: `small ${tab === k ? 'on' : ''}` }))));
  body.append(tab === 'exchange' ? exchangeTab(ui, rerender) : tab === 'routes' ? routesTab(ui, rerender) : tab === 'mercenaries' ? mercenaryTab(ui, rerender) : contractTab(ui, rerender));
  return body;
}

/** A tab's opening: one short line, with the full explanation behind an ⓘ. */
function lead(line: string, more: string): HTMLElement {
  return h('div', { class: 'row', style: 'margin-bottom:8px;gap:2px' }, h('span', { class: 'dim' }, line), infoTip(more));
}

function exchangeTab(ui: GameUI, rerender: () => void): HTMLElement {
  const g = ui.game;
  const p = prices(g);
  const fee = exchangeFee(g, ui.viewer);
  const stock = g.factions[ui.viewer].stock;
  const table = h('table', { class: 't' }, h('tr', null, h('th', null, 'Resource'), h('th', null, 'You have'), h('th', null, 'Price'), h('th', null, 'vs normal')),
    ...RES.map((r) => {
      const rel = p[r] / BASE_PRICES[r] - 1;
      return h('tr', null, h('td', null, `${ICON[r]} ${r}`), h('td', null, num(stock[r])), h('td', null, p[r].toFixed(2)),
        h('td', { class: rel > 0.02 ? 'bad' : rel < -0.02 ? 'good' : 'dim' }, rel === 0 ? '—' : `${rel > 0 ? '+' : ''}${Math.round(rel * 100)}%`));
    }));
  const sell = h('select', null, ...RES.map((r) => h('option', { value: r }, `${ICON[r]} ${r}`)));
  const buy = h('select', null, ...RES.map((r, i) => h('option', { value: r, selected: i === 1 }, `${ICON[r]} ${r}`)));
  const amount = h('input', { type: 'number', value: '50', min: '1', style: 'width:90px' });
  const preview = h('b');
  const update = () => {
    const got = quote(g, ui.viewer, sell.value as StockpileKind, buy.value as StockpileKind, Number(amount.value));
    preview.textContent = sell.value === buy.value ? 'Pick two different resources.' : `You get about ${num(got)} ${buy.value}`;
  };
  for (const el of [sell, buy, amount]) el.addEventListener('input', update);
  update();
  return h('div', null,
    lead('Swap resources with the whole galaxy.', 'No partner needed. Selling lowers a price and buying raises it; prices drift back each round. For a better deal, trade one-on-one with another empire (Diplomacy → Swap resources).'),
    table,
    h('h3', null, 'Trade'),
    h('div', { class: 'row wrap' }, 'Sell', amount, sell, 'for', buy, preview),
    h('div', { class: fee === 0 ? 'good' : 'dim', style: 'margin:6px 0' }, fee === 0 ? 'Black Market: you pay no fee.' : `Exchange fee: ${Math.round(fee * 100)}%.${fee < 0.4 ? ' (Reduced by your trade agreement with the Ophidian Syndicate.)' : ''}`),
    button('Trade', () => {
      if (ui.act({ type: 'exchange', sell: sell.value as StockpileKind, buy: buy.value as StockpileKind, amount: Number(amount.value) })) rerender();
    }, { cls: 'primary', disabled: !ui.myTurn, title: ui.myTurn ? '' : 'Trade on your turn.' }));
}

function mercenaryTab(ui: GameUI, rerender: () => void): HTMLElement {
  const g = ui.game;
  const list = offersFor(g, ui.viewer);
  const wrap = h('div', null, lead('Hire ships, spies, armies and charts from the minor powers.',
    'Every minor power sells something that suits it: traders sell cargo ships, soldiers sell warships and armies, scholars sell science ships and charts, builders sell colony ships and constructors, and the secretive sell spies. Prices are high, and move with how they feel about you: friends charge up to 35% less, and those who dislike you charge more or refuse. Some only sell to those with an embassy, a Trade Agreement, a trade route, a pact or an alliance. Ships wait at the seller’s home system; spies and hired armies report to your home. Each round you are shown at most ' + OFFERS_PER_ROUND + ' offers, picked at random from what you could take up, and each purchase uses one up. See the Faction guide for what each power sells.'));
  if (!list.length) wrap.append(h('div', { class: 'dim' }, 'Nothing on offer to you this round. Meet more minor powers (their sellers must not be at war with you), or come back next round.'));
  else wrap.append(h('div', { class: 'dim', style: 'font-size:12px;margin-bottom:6px' }, `${list.length} offer${list.length > 1 ? 's' : ''} this round.`));
  const locked = lockedOfferCount(g, ui.viewer);
  if (locked) wrap.append(h('div', { class: 'dim', style: 'font-size:12px;margin-bottom:6px' }, `${locked} more offer${locked > 1 ? 's' : ''} from powers you have met need an embassy, a Trade Agreement or similar first (see the Faction guide).`));
  const blocked: HTMLElement[] = [];
  const order = [...list].sort((a, b) => a.offer.seller.localeCompare(b.offer.seller));
  for (const { offer: o, check, price } of order) {
    const met = g.relations[[ui.viewer, o.seller].sort().join('|')]?.contact;
    const d = o.kind === 'ship' ? design(o.design) : null;
    const what = d
      ? `${d.name}: ${CLASSES[d.cls].name} ${ROLES[d.role].name}`
      : o.kind === 'army' ? `Veteran army, strength ${o.strength}, for ${o.turns} turns`
      : o.kind === 'spy' ? 'A spy, reporting to your home system' : 'Star charts: everything they have explored';
    const delta = Math.round((price / o.price - 1) * 100);
    const priceEl = h('span', { title: `List price ${o.price}. They charge ${delta === 0 ? 'the list price' : `${Math.abs(delta)}% ${delta < 0 ? 'less' : 'more'}`} because of how they feel about you.` },
      `${ICON.energy}${price}`, delta ? h('span', { class: delta < 0 ? 'good' : 'bad', style: 'font-size:11px;margin-left:4px' }, `${delta > 0 ? '+' : ''}${delta}%`) : '');
    const need = o.req ? h('div', { class: 'dim', style: 'font-size:11px;flex-basis:100%' }, `Needs ${SALE_REQ_TEXT[o.req]}`) : null;
    const card = h('div', { class: 'card row wrap' },
      met ? factionChip(o.seller, true) : h('span', { class: 'dim' }, 'Unknown seller'),
      h('span', { class: 'grow' }, what),
      priceEl,
      button('Buy', () => { if (ui.act({ type: 'buyOffer', offer: o.id })) rerender(); },
        { cls: 'small primary', disabled: !check.ok || !ui.myTurn, title: check.ok ? '' : (check as { reason: string }).reason }),
      need);
    if (check.ok) wrap.append(card);
    else { card.title = (check as { reason: string }).reason; blocked.push(card); }
  }
  // Offers you can't take up (at war with the seller, missing an embassy or agreement, can't afford, …) are tucked away.
  wrap.append(...collapsibleUnavailable(blocked, rerender, 'offers you can’t take'));
  return wrap;
}

function contractTab(ui: GameUI, rerender: () => void): HTMLElement {
  const g = ui.game;
  const sellers = Object.keys(g.factions).filter((f) => f !== ui.viewer && contractTerms(g, ui.viewer, f).ok);
  const wrap = h('div', null, lead('Have your designs built at another empire’s shipyard.',
    'The Forgeborn Anvil builds for anyone at peace with them (20% cheaper), and partners in a Manufacturing Agreement build for each other (10% cheaper). Ships are delivered at their shipyard. If war breaks out, they keep the ship.'));
  if (!sellers.length) wrap.append(h('div', { class: 'dim' }, 'No one will build for you yet. Sign a Manufacturing Agreement, or find the Forgeborn Anvil.'));
  for (const seller of sellers) {
    const designs = DESIGNS_BY_FACTION[ui.viewer].filter((d) => d.cls !== 'fighter' && (!d.tech || g.factions[ui.viewer].research.known.includes(d.tech)));
    const sel = h('select', null, ...designs.map((d) => {
      const c = contractCost(g, ui.viewer, seller, d.id)!;
      return h('option', { value: d.id }, `${d.name} (${CLASSES[d.cls].name} ${ROLES[d.role].name}): ${costText(c)}`);
    }));
    wrap.append(h('div', { class: 'card row wrap' }, factionChip(seller, true), sel,
      button('Order', () => { if (ui.act({ type: 'orderShip', seller, design: sel.value })) rerender(); }, { cls: 'small primary', disabled: !ui.myTurn })));
  }
  const mine = (g.contracts ?? []).filter((c) => c.buyer === ui.viewer);
  if (mine.length) {
    wrap.append(h('h3', null, 'Your orders'));
    for (const c of mine) wrap.append(h('div', null, `${design(c.design).name} at the ${factionDef(c.seller).short} shipyards, ${Math.ceil(c.remaining)} points to go`));
  }
  return wrap;
}

function routesTab(ui: GameUI, rerender: () => void): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const mine = (g.routes ?? []).filter((r) => r.owner === me || r.partner === me);
  const wrap = h('div', null,
    lead('Cargo ships run trade routes that pay energy every turn.', `Send a cargo ship to another empire's settled system (you need a Trade Agreement with them; the Haldane trade with anyone) and choose "Open trade route" there. The ship becomes a route back to your nearest settled system, and both of you earn energy every turn. You can also link two of your own systems at least ${DOMESTIC_MIN_DISTANCE} hexes apart. Enemy warships on the route, or a blockade at either end, cut it off that turn; war ends it.`),
    h('div', null, `You run ${routesOf(g, me).length} of ${routeCapacity(g, me)} routes (each Trade Port adds one).`));
  if (!mine.length) wrap.append(h('div', { class: 'dim', style: 'margin-top:8px' }, 'No trade routes yet.'));
  const table = h('table', { class: 't', style: 'margin-top:8px' }, h('tr', null, h('th', null, 'Route'), h('th', null, 'With'), h('th', null, 'Per turn'), h('th', null, 'Status'), h('th', null, '')));
  for (const r of mine) {
    const cut = routeDisruptors(g, r);
    const other = r.owner === me ? r.partner : r.owner;
    table.append(h('tr', null,
      h('td', null, `${g.map.hexes[r.from].system!.name} – ${g.map.hexes[r.to].system!.name}`),
      h('td', null, other === me ? 'Domestic' : factionChip(other, true)),
      h('td', null, `${ICON.energy}${num(routeValue(g, r))}`),
      h('td', { class: cut.length ? 'bad' : 'good' }, cut.length ? `Cut by ${cut.map((f) => factionDef(f).short).join(', ')}` : 'Flowing'),
      h('td', null, button('Close', () => { if (ui.act({ type: 'cancelRoute', route: r.id })) rerender(); }, { cls: 'small', disabled: !ui.myTurn }))));
  }
  if (mine.length) wrap.append(table);

  // Where a new route could go, best first, with a button that sends your nearest free cargo ship there.
  wrap.append(h('h3', null, 'Where you can open a route'));
  const full = routesOf(g, me).length >= routeCapacity(g, me);
  if (full) wrap.append(h('div', { class: 'bad', style: 'margin-bottom:6px' }, 'You are running as many routes as you can. Build a Trade Port for another.'));
  const explored = new Set<number>();
  const bits = g.factions[me].explored;
  g.map.hexes.forEach((_, i) => { if (getBit(bits, i)) explored.add(i); });
  const options = routeOptions(g, me, (i) => explored.has(i)).slice(0, 10);
  const cargo = Object.values(g.fleets).filter((f) => f.owner === me && f.ships.some((s) => design(g.ships[s].design).role === 'cargo'));
  const optionHexes = new Set(options.map((o) => o.hex));
  const speed = (f: (typeof cargo)[number]) => Math.max(1, fleetSpeed(g, f.id));
  const eta = (f: (typeof cargo)[number]) => Math.max(1, Math.ceil(f.path.length / speed(f)));
  const bound = (f: (typeof cargo)[number]) => (f.path.length ? f.path[f.path.length - 1] : null);
  // Free ships: not already on their way somewhere and not sitting where a route could open.
  const free = cargo.filter((f) => !f.path.length && !optionHexes.has(f.hex));
  const shipName = (f: (typeof cargo)[number]) => f.name || 'Cargo ship';
  const partners = new Set(options.map((o) => o.partner));
  const others = Object.keys(g.factions).filter((o) => o !== me && g.factions[o].alive && relation(g, me, o).contact && relation(g, me, o).status !== 'war' && !partners.has(o) && !canTradeWith(g, me, o));
  if (!options.length) wrap.append(h('div', { class: 'dim' }, 'Nowhere yet. You need a Trade Agreement with another power (propose one in Diplomacy), or two of your own settled systems at least ' + DOMESTIC_MIN_DISTANCE + ' hexes apart.'));
  else {
    const t = h('table', { class: 't' }, h('tr', null, h('th', null, 'System'), h('th', null, 'Owner'), h('th', null, 'Per turn'), h('th', null, 'Distance'), h('th', null, 'Cargo ship')));
    for (const o of options) {
      const hx = g.map.hexes[o.hex];
      const here = cargo.find((f) => f.hex === o.hex);
      const coming = cargo.filter((f) => bound(f) === o.hex);
      const nearest = [...free].sort((a, b) => hexDistance(g.map, a.hex, o.hex) - hexDistance(g.map, b.hex, o.hex))[0];
      let cell: HTMLElement | string;
      if (here) cell = button(`Open route (${shipName(here)})`, () => { if (ui.act({ type: 'establishRoute', fleet: here.id })) rerender(); }, { cls: 'small primary', disabled: !ui.myTurn || full });
      else if (coming.length) cell = h('span', { class: 'good', style: 'font-size:12px' }, `${shipName(coming[0])} on its way · ${eta(coming[0])} turn${eta(coming[0]) > 1 ? 's' : ''}`);
      else if (nearest) {
        const turns = Math.max(1, Math.ceil(hexDistance(g.map, nearest.hex, o.hex) / speed(nearest)));
        cell = button(`Send ${shipName(nearest)} · ~${turns}t`, () => {
          if (ui.act({ type: 'move', fleet: nearest.id, to: o.hex }, true)) { toast(`${shipName(nearest)} is on its way to ${hx.system!.name}. When it arrives, open the route here or from the ship.`); rerender(); }
        }, { cls: 'small', disabled: !ui.myTurn || full, title: `Sends your nearest free cargo ship, ${shipName(nearest)}, from ${g.map.hexes[nearest.hex].system?.name ?? 'deep space'} (${hexDistance(g.map, nearest.hex, o.hex)} hexes away)` });
      } else cell = h('span', { class: 'dim', style: 'font-size:11px' }, cargo.length ? 'no free cargo ship' : 'no cargo ship');
      t.append(h('tr', null,
        h('td', null, hx.system!.name),
        h('td', null, o.partner === me ? 'Domestic' : factionChip(o.partner, true)),
        h('td', null, `${ICON.energy}~${num(o.value)}`),
        h('td', null, `${hexDistance(g.map, o.from, o.hex)} hexes from ${g.map.hexes[o.from].system!.name}`),
        h('td', null, cell)));
    }
    wrap.append(t);
    if (!cargo.length) wrap.append(h('div', { class: 'dim', style: 'margin-top:6px' }, 'Routes are run by cargo ships: build one in a system with a shipyard (Ships tab, any Cargo design).'));
  }
  // Every cargo ship and what it is doing.
  if (cargo.length) {
    wrap.append(h('h3', null, 'Your cargo ships'));
    for (const f of cargo) {
      const to = bound(f);
      const where = g.map.hexes[f.hex].system?.name ?? 'deep space';
      const doing = to !== null ? `on its way to ${g.map.hexes[to].system?.name ?? 'a hex'}, ${eta(f)} turn${eta(f) > 1 ? 's' : ''}`
        : optionHexes.has(f.hex) ? `at ${where}: ready to open a route` : `free, at ${where}`;
      wrap.append(h('div', { class: 'row', style: 'gap:8px;font-size:12px;margin:2px 0' }, h('b', null, shipName(f)), h('span', { class: 'dim grow' }, doing),
        to !== null ? button('Stop', () => { if (ui.act({ type: 'stop', fleet: f.id }, true)) rerender(); }, { cls: 'small', disabled: !ui.myTurn, title: 'Cancel this trip: it becomes free again' }) : ''));
    }
  }
  if (others.length) wrap.append(h('div', { class: 'dim', style: 'margin-top:8px;font-size:12px' },
    'Sign a Trade Agreement (Diplomacy → Propose a deal) to trade with: ', ...others.flatMap((o, i) => [i ? ', ' : '', factionChip(o, true)])));
  return wrap;
}
