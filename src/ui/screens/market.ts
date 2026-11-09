/** Market: the galactic exchange (and, in later tabs, mercenaries and trade routes). */
import { design, DESIGNS_BY_FACTION } from '../../data/designs';
import { factionDef } from '../../data/factions';
import { CLASSES, ROLES } from '../../data/ships';
import { BASE_PRICES, exchangeFee, prices, quote } from '../../engine/market';
import { contractCost, contractTerms, offersFor } from '../../engine/mercenaries';
import { costText, factionChip } from '../format';
import type { StockpileKind } from '../../engine/types';
import { button, clear, h, modal } from '../dom';
import { ICON, num } from '../format';
import type { GameUI } from '../game-ui';

export type MarketTab = 'exchange' | 'mercenaries' | 'contracts';

const RES: StockpileKind[] = ['energy', 'metals', 'exotics'];

export function openMarket(ui: GameUI, tab: MarketTab = 'exchange'): void {
  const body = h('div');
  modal('Market', body, { wide: true });
  const render = () => {
    clear(body);
    const tabs: [MarketTab, string][] = [['exchange', 'Galactic exchange'], ['mercenaries', 'Mercenaries & services'], ['contracts', 'Shipyard contracts']];
    body.append(h('div', { class: 'tabs' }, ...tabs.map(([k, label]) => button(label, () => { tab = k; render(); }, { cls: `small ${tab === k ? 'on' : ''}` }))));
    body.append(tab === 'exchange' ? exchangeTab(ui, render) : tab === 'mercenaries' ? mercenaryTab(ui, render) : contractTab(ui, render));
  };
  render();
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
    h('div', { class: 'dim', style: 'margin-bottom:8px' }, 'Swap resources with the whole galaxy, no partner needed. Selling lowers a price and buying raises it; prices drift back each round. For a better deal, trade one-on-one with another empire (Diplomacy → Swap resources).'),
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
  const wrap = h('div', null, h('div', { class: 'dim', style: 'margin-bottom:8px' },
    'Mercenary factions sell their services to anyone at peace with them. New offers arrive every round. Ships wait at the seller’s home system; hired armies report to your home for 10 turns.'));
  if (!list.length) wrap.append(h('div', { class: 'dim' }, 'No mercenary factions are in this galaxy, or none are selling this round.'));
  for (const { offer: o, check } of list) {
    const met = g.relations[[ui.viewer, o.seller].sort().join('|')]?.contact;
    const what = o.kind === 'ship'
      ? `${design(o.design).name}: ${CLASSES[design(o.design).cls].name} ${ROLES[design(o.design).role].name}`
      : o.kind === 'army' ? `Veteran army, strength ${o.strength}, for ${o.turns} turns` : 'Star charts: everything they have explored';
    wrap.append(h('div', { class: 'card row wrap' },
      met ? factionChip(o.seller, true) : h('span', { class: 'dim' }, 'Unknown seller'),
      h('span', { class: 'grow' }, what),
      h('span', null, `${ICON.energy}${o.price}`),
      button('Buy', () => { if (ui.act({ type: 'buyOffer', offer: o.id })) rerender(); },
        { cls: 'small primary', disabled: !check.ok || !ui.myTurn, title: check.ok ? '' : (check as { reason: string }).reason })));
  }
  return wrap;
}

function contractTab(ui: GameUI, rerender: () => void): HTMLElement {
  const g = ui.game;
  const sellers = Object.keys(g.factions).filter((f) => f !== ui.viewer && contractTerms(g, ui.viewer, f).ok);
  const wrap = h('div', null, h('div', { class: 'dim', style: 'margin-bottom:8px' },
    'Have your own ship designs built at another empire’s shipyard: the Forgeborn Anvil builds for anyone at peace with them (20% cheaper), and partners in a Manufacturing Agreement build for each other (10% cheaper). Ships are delivered at their shipyard. If war breaks out, they keep the ship.'));
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
