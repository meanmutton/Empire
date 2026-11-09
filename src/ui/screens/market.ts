/** Market: the galactic exchange (and, in later tabs, mercenaries and trade routes). */
import { BASE_PRICES, exchangeFee, prices, quote } from '../../engine/market';
import type { StockpileKind } from '../../engine/types';
import { button, clear, h, modal } from '../dom';
import { ICON, num } from '../format';
import type { GameUI } from '../game-ui';

export type MarketTab = 'exchange';

const RES: StockpileKind[] = ['energy', 'metals', 'exotics'];

export function openMarket(ui: GameUI, tab: MarketTab = 'exchange'): void {
  const body = h('div');
  modal('Market', body, { wide: true });
  const render = () => {
    clear(body);
    body.append(h('div', { class: 'tabs' }, button('Galactic exchange', () => { tab = 'exchange'; render(); }, { cls: `small ${tab === 'exchange' ? 'on' : ''}` })));
    body.append(exchangeTab(ui, render));
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
