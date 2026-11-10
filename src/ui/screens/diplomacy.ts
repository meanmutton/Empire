/** Diplomacy: relations, embassies and diplomats, proposals, conversations and the market, all in one screen. */
import { factionDef } from '../../data/factions';
import { TECH_BY_ID } from '../../data/techs';
import { hasEmbassy, opinionOf } from '../../engine/agents';
import { AGREEMENTS, canPropose, proposalScore, type AgreementId } from '../../engine/diplomacy';
import { relation } from '../../engine/query';
import { getBit } from '../../engine/bitset';
import { itemValue } from '../../engine/diplomacy';
import type { FactionId, Proposal, TradeItem } from '../../engine/types';
import { button, clear, h, modal } from '../dom';
import { costText, factionChip, ICON, num } from '../format';
import { checkBuild } from '../../engine/economy';
import { hexDistance } from '../../engine/hex';
import { intelLevel } from '../../engine/intel';
import { marketPane, type MarketTab } from './market';
import { leaderInfo, portraitElement } from '../portraits';
import { crestElement } from '../crests';
import { openGuide } from './guide';
import { aiThread, aiUnread, chatPanel, groupThreads, threadName, threadUnread } from './messages';
import type { GameUI } from '../game-ui';

const STATUS_LABEL: Record<string, string> = {
  war: 'At war', hostile: 'Hostile', neutral: 'Neutral', relations: 'Relations', nap: 'Non-aggression pact', alliance: 'Alliance',
};

export function describeItem(ui: GameUI, item: TradeItem): string {
  const g = ui.game;
  switch (item.kind) {
    case 'resource': return `${num(item.amount)} ${item.resource}${item.perTurn ? ` per turn for ${item.perTurn} turns` : ''}`;
    case 'tech': return `Tech: ${TECH_BY_ID[item.tech]?.name ?? item.tech}`;
    case 'anyTech': return 'A technology of the giver’s choice (the cheapest one the other side lacks)';
    case 'fleet': return `Fleet: ${g.fleets[item.fleet]?.name ?? 'gone'} (${g.fleets[item.fleet]?.ships.length ?? 0} ships)`;
    case 'hex': return `Territory: ${g.map.hexes[item.hex].system?.name ?? `hex ${item.hex}`}`;
    case 'army': return `Army (strength ${g.armies[item.army]?.strength ?? '?'})`;
    case 'agreement': return AGREEMENTS[item.agreement as AgreementId]?.name ?? item.agreement;
    case 'status': return item.status === 'relations' || item.status === 'neutral' ? 'Peace' : item.status === 'nap' ? 'Non-aggression pact' : 'Alliance';
    case 'vassal': return 'Become a vassal';
    case 'returnAgent': return 'Return a captured agent';
    case 'map': return 'Star charts (map knowledge)';
  }
}

/** Can the viewer see which technologies `other` knows? With an embassy there, or a spy at its capital. */
export function seesTechOf(ui: GameUI, other: FactionId): boolean {
  return hasEmbassy(ui.game, ui.viewer, other) || intelLevel(ui.game, ui.viewer, other) >= 1;
}

/**
 * Diplomacy: everything about dealing with other powers in one place. The left column lists an overview,
 * group chats and every power you have met (with unread and pending counts); the right shows the picked
 * one: relations, embassy and diplomats, proposals, and the conversation (chat with human players,
 * statements to computer powers).
 *
 * `focus` picks what opens first: a faction id, 'overview', 'market', 'all' (chat with everyone), or a group thread
 * (comma-separated factions). 'ai:<faction>' (older callers) means that faction.
 */
export function openDiplomacy(ui: GameUI, focus: string = 'overview'): void {
  let current = focus.startsWith('ai:') ? focus.slice(3) : focus;
  let marketTab: MarketTab = 'exchange';
  const drafts = new Map<string, string>();
  const body = h('div', { class: 'msg-grid' });
  const messaging = ui.messaging;
  const m = modal('Diplomacy', body, { wide: true, onClose: () => unsub?.() });
  const render = () => {
    clear(body);
    const g = ui.game;
    const me = ui.viewer;
    const humanGame = g.config.seats.length > 1 && !!messaging;
    const met = Object.keys(g.factions).filter((o) => o !== me && g.factions[o].alive && relation(g, me, o).contact)
      .sort((a, b) => (g.factions[a].kind === 'major' ? 0 : 1) - (g.factions[b].kind === 'major' ? 0 : 1) || factionDef(a).name.localeCompare(factionDef(b).name));
    const unmet = Object.keys(g.factions).filter((o) => o !== me && g.factions[o].alive && !relation(g, me, o).contact).length;
    const inbox = Object.values(g.proposals).filter((p) => p.to === me && !p.answer);
    const groups = humanGame ? groupThreads(ui, messaging!) : [];
    const valid = new Set(['overview', 'market', ...(humanGame ? ['all', ...groups] : []), ...met]);
    if (!valid.has(current)) current = 'overview';

    const list = h('div', { class: 'dip-list' });
    const badge = (n: number, flavour = 0) => (n ? h('span', { class: 'badge' }, String(n)) : flavour ? h('span', { class: 'notice-dot', title: 'New words from them' }) : '');
    const entry = (key: string, label: HTMLElement | string, n: number, sub = '', flavour = 0) =>
      list.append(button(h('span', { class: 'row grow' }, label, sub ? h('span', { class: 'dim', style: 'font-size:11px' }, sub) : '', h('span', { class: 'grow' }), badge(n, flavour)),
        () => { current = key; render(); }, { cls: `list-btn small ${key === current ? 'on' : ''}` }));
    entry('overview', h('b', null, 'Overview'), inbox.length);
    entry('market', h('span', null, '💱 Market'), 0, 'exchange, routes, hire');
    if (humanGame) {
      entry('all', h('span', null, '📢 All players'), threadUnread(ui, messaging!, 'all'));
      for (const k of groups) entry(k, h('span', null, ...k.split(',').map((f) => factionChip(f, true))), threadUnread(ui, messaging!, k));
    }
    for (const o of met) {
      const chat = humanSeat(ui, o) && messaging ? threadUnread(ui, messaging, o) : 0;
      const ai = !humanSeat(ui, o) && g.factions[o].kind === 'major' ? aiUnread(ui, o) : 0;
      const pending = inbox.filter((p) => p.from === o).length;
      const st = relation(g, me, o).status;
      entry(o, factionChip(o, true), chat + pending, st === 'war' ? 'war' : st === 'alliance' ? 'ally' : g.factions[o].kind === 'minor' ? 'minor' : '', ai);
    }
    if (unmet) list.append(h('div', { class: 'dim', style: 'font-size:12px;margin-top:6px' }, `${unmet} power${unmet > 1 ? 's' : ''} not yet met.`));
    if (!met.length) list.append(h('div', { class: 'dim', style: 'font-size:12px;margin-top:6px' }, 'You have not met anyone yet. Explore with scouts.'));

    let right: HTMLElement;
    if (current === 'market') right = h('div', null, h('h3', null, 'Market'), marketPane(ui, marketTab, (t) => { marketTab = t; render(); }, render));
    else if (current === 'overview') right = overviewPane(ui, met, (k) => { current = k; render(); }, render);
    else if (current === 'all' || current.includes(',')) right = h('div', null, h('h3', null, threadName(current)), chatPanel(ui, messaging!, current, drafts));
    else right = factionPane(ui, current, drafts, render);
    body.append(list, right);
    ui.updateTopBar();
  };
  const unsub = messaging?.subscribe(() => { if (m.root.isConnected) render(); });
  render();
}

/** "the Terran Concord", "The Lattice" (names that already start with The keep it). */
function theName(f: FactionId): string {
  const n = factionDef(f).name;
  return /^the /i.test(n) ? n : `the ${n}`;
}

function humanSeat(ui: GameUI, f: FactionId): boolean {
  return ui.game.factions[f].controller === 'human' && ui.game.config.seats.length > 1;
}

/** Proposals waiting for you, your recent proposals, prisoners, and every power at a glance. */
function overviewPane(ui: GameUI, met: FactionId[], open: (key: string) => void, rerender: () => void): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const pane = h('div');
  const inbox = Object.values(g.proposals).filter((p) => p.to === me && !p.answer);
  pane.append(h('h3', null, 'Proposals for you'));
  if (!inbox.length) pane.append(h('div', { class: 'dim' }, 'None waiting.'));
  for (const p of inbox) pane.append(proposalCard(ui, p, rerender));
  const sent = Object.values(g.proposals).filter((p) => p.from === me).slice(-6);
  if (sent.length) {
    pane.append(h('h3', null, 'Your recent proposals'));
    for (const p of sent) pane.append(proposalCard(ui, p, rerender));
  }
  const prisoners = Object.values(g.agents).filter((a) => a.capturedBy === me);
  if (prisoners.length) {
    pane.append(h('h3', null, 'Prisoners'));
    for (const a of prisoners) {
      pane.append(h('div', { class: 'row' }, factionChip(a.owner, true), a.kind, h('span', { class: 'grow' }),
        button('Execute', () => { if (confirm('Execute this prisoner? Everyone will think less of you.') && ui.act({ type: 'execute', agent: a.id })) rerender(); }, { cls: 'small danger', disabled: !ui.myTurn }),
        h('span', { class: 'dim' }, 'or offer their return in a proposal')));
    }
  }
  pane.append(h('h3', null, 'Powers you have met'));
  const table = h('table', { class: 't manage' }, h('tr', null, h('th', null, 'Power'), h('th', null, 'Status'), h('th', null, 'Their view of you'), h('th', null, 'Embassies'), h('th', null, 'Agreements')));
  for (const o of met) {
    const r = relation(g, me, o);
    const op = opinionOf(g, o, me);
    table.append(h('tr', { style: 'cursor:pointer', onclick: () => open(o) },
      h('td', null, factionChip(o)),
      h('td', { class: r.status === 'war' ? 'bad' : r.status === 'alliance' ? 'good' : '' }, STATUS_LABEL[r.status]),
      h('td', { class: op >= 0 ? 'good' : 'bad' }, num(op)),
      h('td', null, `${hasEmbassy(g, me, o) ? 'yours ✓' : 'yours ✗'} · ${hasEmbassy(g, o, me) ? 'theirs ✓' : 'theirs ✗'}`),
      h('td', null, r.agreements.map((a) => AGREEMENTS[a as AgreementId]?.name ?? a).join(', ') || h('span', { class: 'dim' }, 'none'))));
  }
  if (met.length) pane.append(h('div', { style: 'overflow-x:auto;max-width:100%' }, table));
  return pane;
}

/** Everything about one power: relations, embassy and diplomats, actions, proposals, conversation. */
function factionPane(ui: GameUI, o: FactionId, drafts: Map<string, string>, rerender: () => void): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const def = factionDef(o);
  const f = g.factions[o];
  const r = relation(g, me, o);
  const op = opinionOf(g, o, me);
  const pane = h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:0' });
  // Header: their leader's (or envoy's) portrait beside who they are and where you stand.
  const leader = leaderInfo(g, o);
  const head = h('div', { class: 'dip-head' });
  head.append(portraitElement(o, leader.portrait, 104, leader.full), h('div', { class: 'grow', style: 'min-width:0' },
    h('div', { class: 'row' }, crestElement(o, 28, `${def.kind === 'major' ? 'Crest' : 'Seal'} of the ${def.short}`), h('b', { style: `font-size:16px;color:${def.color}` }, def.name), h('span', { class: 'grow' }),
      h('span', { class: r.status === 'war' ? 'bad' : r.status === 'alliance' ? 'good' : 'dim' }, STATUS_LABEL[r.status])),
    h('div', { style: 'margin:2px 0 4px' }, leader.full),
    h('div', { class: 'dim' }, `${def.government}${f.kind === 'minor' ? ' · minor power' : ''}${f.overlord ? ` · vassal of the ${factionDef(f.overlord).short}` : ''}${f.player ? ` · played by ${f.player}` : f.kind === 'major' ? ' · computer' : ''}`),
    h('div', { class: 'row', style: 'margin-top:4px;align-items:flex-start' }, h('span', { class: 'dim grow', style: 'font-size:12px' }, def.text),
      button('Guide ›', () => openGuide(o, g), { cls: 'small ghost', title: `The story of the ${def.short}${def.kind === 'major' ? ', their leaders and how they see the others' : ''}` }))));
  pane.append(head);
  pane.append(h('div', { class: 'kv' },
    h('span', { class: 'k' }, 'Their view of you'), h('span', { class: op >= 0 ? 'good' : 'bad' }, num(op)),
    h('span', { class: 'k' }, 'Agreements'), h('span', null, r.agreements.map((a) => AGREEMENTS[a as AgreementId]?.name ?? a).join(', ') || 'none'),
    h('span', { class: 'k' }, 'Their embassy with you'), h('span', null, hasEmbassy(g, o, me) ? 'yes' : 'no')));

  pane.append(embassyCard(ui, o, rerender));

  if (ui.myTurn) {
    const acts = h('div', { class: 'row wrap' });
    if (canPropose(g, me, o)) {
      acts.append(button('Propose a deal…', () => openProposal(ui, o, rerender), { cls: 'small primary' }));
      acts.append(button('Swap resources…', () => openSwap(ui, o, rerender), { cls: 'small' }));
    }
    if (r.status !== 'war') acts.append(button('Declare war', () => { if (confirm(`Declare war on ${theName(o)}?`) && ui.act({ type: 'declareWar', target: o })) rerender(); }, { cls: 'small danger' }));
    if (r.status === 'nap' || r.status === 'alliance') acts.append(button('Cancel treaty', () => { if (ui.act({ type: 'cancelTreaty', target: o })) rerender(); }, { cls: 'small' }));
    const guest = Object.values(g.agents).find((a) => a.resident && a.target === me && a.owner === o);
    if (guest) acts.append(button('Expel their diplomat', () => { if (ui.act({ type: 'expel', agent: guest.id })) rerender(); }, { cls: 'small' }));
    if (acts.childNodes.length) pane.append(acts);
  }

  const theirs = Object.values(g.proposals).filter((p) => (p.from === o && p.to === me) || (p.from === me && p.to === o)).filter((p) => !p.answer || p.turn >= g.turn - 3);
  if (theirs.length) {
    pane.append(h('h3', null, 'Proposals'));
    for (const p of theirs) pane.append(proposalCard(ui, p, rerender));
  }

  pane.append(h('h3', null, 'Conversation'));
  if (humanSeat(ui, o) && ui.messaging) pane.append(chatPanel(ui, ui.messaging, o, drafts));
  else if (f.kind === 'major') pane.append(aiThread(ui, o, rerender));
  else pane.append(h('div', { class: 'dim' }, 'Minor powers do not send messages. Deal with them through proposals: trade, treaties, or vassalage.'));
  return pane;
}

/** Your embassy with a power: the ambassador posted there, a diplomat on the way, or one to send. */
function embassyCard(ui: GameUI, o: FactionId, rerender: () => void): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const card = h('div', { class: 'card' });
  const mine = Object.values(g.agents).filter((a) => a.owner === me && a.kind === 'diplomat' && !a.capturedBy);
  const home = g.factions[o].home;
  if (hasEmbassy(g, me, o)) {
    const amb = mine.find((a) => a.resident && a.target === o);
    card.append(h('div', { class: 'row' }, h('b', null, '⚑ Embassy'), h('span', { class: 'grow' }, ' Your ambassador is posted at their capital: you can negotiate.'),
      amb && ui.myTurn ? button('Recall', () => { if (ui.act({ type: 'recall', agent: amb.id })) rerender(); }, { cls: 'small' }) : null));
    return card;
  }
  const enRoute = mine.find((a) => a.target === o && !a.resident && (a.path.length > 0 || a.ship));
  if (enRoute) {
    card.append(h('div', null, h('b', null, '⚑ No embassy yet. '), enRoute.ship ? 'A diplomat is on the way aboard a ship.' : `A diplomat is on the way: ${enRoute.path.length} hexes to go.`));
    return card;
  }
  card.append(h('div', null, h('b', null, '⚑ No embassy. '), 'You need one to trade or sign treaties. Send a diplomat to their home system; through hostile space it may be captured.'));
  const free = mine.filter((a) => !a.resident && !a.ship && a.path.length === 0)
    .map((a) => ({ a, d: hexDistance(g.map, a.hex, home) })).sort((x, y) => x.d - y.d);
  if (!ui.myTurn) return card;
  if (free.length) {
    const row = h('div', { class: 'row wrap', style: 'margin-top:6px' });
    const sel = h('select', null, ...free.map(({ a, d }) => h('option', { value: a.id }, `Diplomat at ${g.map.hexes[a.hex].system?.name ?? 'deep space'} (${d} hexes away)`)));
    row.append(sel, button('Send diplomat', () => { if (ui.act({ type: 'sendDiplomat', agent: sel.value, target: o })) rerender(); }, { cls: 'small primary' }));
    card.append(row);
  } else {
    const myHome = g.factions[me].home;
    const can = checkBuild(g, me, myHome, 'diplomat', '');
    card.append(h('div', { class: 'row wrap', style: 'margin-top:6px' }, h('span', { class: 'dim' }, 'No free diplomat.'),
      can.ok ? button(`Train one at ${g.map.hexes[myHome].system!.name} (${costText(can.cost)})`, () => { if (ui.act({ type: 'build', hex: myHome, kind: 'diplomat', item: '' })) rerender(); }, { cls: 'small' })
        : h('span', { class: 'dim' }, 'Any colony of level 2 or more can train one (Build → Other).')));
  }
  return card;
}

function proposalCard(ui: GameUI, p: Proposal, rerender: () => void): HTMLElement {
  const incoming = p.to === ui.viewer;
  const other = incoming ? p.from : p.to;
  const theyGive = incoming ? p.give : p.receive;
  const youGive = incoming ? p.receive : p.give;
  const card = h('div', { class: 'card' },
    h('div', { class: 'row' }, incoming ? 'From ' : 'To ', factionChip(other), h('span', { class: 'grow' }),
      p.answer ? h('b', { class: p.answer === 'accepted' ? 'good' : 'bad' }, p.answer) : h('span', { class: 'dim' }, `turn ${p.turn}`)),
    h('div', { class: 'row', style: 'align-items:flex-start' },
      h('div', { class: 'grow' }, h('div', { class: 'dim' }, 'You receive'), ...theyGive.map((i) => h('div', null, describeItem(ui, i))), theyGive.length ? null : h('div', { class: 'dim' }, 'nothing')),
      h('div', { class: 'grow' }, h('div', { class: 'dim' }, 'You give'), ...youGive.map((i) => h('div', null, describeItem(ui, i))), youGive.length ? null : h('div', { class: 'dim' }, 'nothing'))));
  if (incoming && !p.answer && ui.myTurn) {
    card.append(h('div', { class: 'row' }, h('span', { class: 'grow' }),
      button('Reject', () => { if (ui.act({ type: 'reject', proposal: p.id }, true)) rerender(); }, { cls: 'small' }),
      button('Accept', () => { if (ui.act({ type: 'accept', proposal: p.id })) rerender(); }, { cls: 'small primary' })));
  }
  return card;
}

/** The proposal builder. */
function openProposal(ui: GameUI, to: FactionId, done: () => void): void {
  const g = ui.game;
  const me = ui.viewer;
  const give: TradeItem[] = [];
  const receive: TradeItem[] = [];
  const body = h('div');
  const m = modal(`Proposal to ${theName(to)}`, body, { wide: true });
  const render = () => {
    clear(body);
    const side = (label: string, items: TradeItem[], giver: FactionId, taker: FactionId) => {
      const col = h('div', { class: 'grow card' }, h('b', null, label));
      items.forEach((it, i) => col.append(h('div', { class: 'row' }, h('span', { class: 'grow' }, describeItem(ui, it)), button('✕', () => { items.splice(i, 1); render(); }, { cls: 'small ghost' }))));
      col.append(itemAdder(ui, giver, taker, (it) => { items.push(it); render(); }));
      return col;
    };
    body.append(h('div', { class: 'row', style: 'align-items:flex-start' },
      side('You give', give, me, to),
      side('You ask for', receive, to, me)));
    const preview: Proposal = { id: 'preview', from: me, to, turn: g.turn, give, receive, answer: null };
    const ai = g.factions[to].controller === 'ai';
    const score = give.length + receive.length ? proposalScore(g, preview) : 0;
    body.append(h('div', { class: 'row' },
      ai && (give.length || receive.length)
        ? h('span', { class: score > 0 ? 'good' : 'bad' }, score > 0 ? 'They will probably accept' : 'They will probably refuse',
          receive.some((i) => i.kind === 'anyTech') && score > 0 ? ', if they know a technology you lack.' : '.')
        : h('span', { class: 'dim' }, ai ? 'Add something to trade.' : 'They will answer on their turn.'),
      h('span', { class: 'grow' }),
      button('Send proposal', () => { if (ui.act({ type: 'propose', to, give, receive })) { m.close(); done(); } }, { cls: 'primary', disabled: give.length + receive.length === 0 })));
  };
  render();
}

function itemAdder(ui: GameUI, giver: FactionId, taker: FactionId, add: (i: TradeItem) => void): HTMLElement {
  const g = ui.game;
  const wrap = h('div', { style: 'margin-top:6px' });
  const kind = h('select', null,
    h('option', { value: 'resource' }, 'Resources'), h('option', { value: 'perTurn' }, 'Resources per turn'), h('option', { value: 'tech' }, 'Technology'),
    h('option', { value: 'agreement' }, 'Agreement'), h('option', { value: 'status' }, 'Treaty / peace'), h('option', { value: 'map' }, 'Star charts'),
    giver !== ui.viewer && g.factions[giver].kind === 'minor' ? h('option', { value: 'vassal' }, 'Vassalage') : null,
    giver === ui.viewer ? h('option', { value: 'fleet' }, 'A fleet') : null,
    h('option', { value: 'hex' }, 'Territory (a system)'),
    h('option', { value: 'army' }, 'An army'),
    h('option', { value: 'returnAgent' }, 'Return a prisoner'));
  const detail = h('span', { class: 'row' });
  const renderDetail = () => {
    clear(detail);
    const k = kind.value;
    if (k === 'resource' || k === 'perTurn') {
      const res = h('select', null, ...['energy', 'metals', 'exotics'].map((r) => h('option', { value: r }, `${ICON[r as 'energy']} ${r}`)));
      const amt = h('input', { type: 'number', value: '50', min: '1', style: 'width:70px' });
      const turns = h('input', { type: 'number', value: '5', min: '1', style: 'width:50px' });
      detail.append(res, amt, k === 'perTurn' ? h('span', null, '× turns', turns) : '',
        button('Add', () => add({ kind: 'resource', resource: res.value as 'energy', amount: Math.max(1, Number(amt.value)), ...(k === 'perTurn' ? { perTurn: Math.max(1, Number(turns.value)) } : {}) }), { cls: 'small' }));
    } else if (k === 'tech') {
      // What you can see: your own techs always; the other side's only with an embassy or a spy there.
      const other = giver === ui.viewer ? taker : giver;
      const sees = seesTechOf(ui, other);
      const takerKnows = new Set(giver === ui.viewer && !sees ? [] : g.factions[taker].research.known);
      const options = g.factions[giver].research.known.filter((t) => !takerKnows.has(t) && t !== 'ascension' && TECH_BY_ID[t]);
      const ANY = '*';
      const offering = giver === ui.viewer;
      const sel = h('select', null,
        h('option', { value: ANY }, offering ? 'One of my choice (my cheapest that they lack)' : 'One of their choice (their cheapest that you lack)'),
        ...(offering || sees ? options : []).map((t) => h('option', { value: t }, `${TECH_BY_ID[t].name} (tier ${TECH_BY_ID[t].tier})`)));
      detail.append(sel, button('Add', () => add(sel.value === ANY ? { kind: 'anyTech' } : { kind: 'tech', tech: sel.value }), { cls: 'small' }));
      detail.append(h('div', { class: 'dim', style: 'font-size:11px;flex-basis:100%' }, sees
        ? (offering ? 'Showing only techs they lack (your embassy or spies tell you what they know).' : 'Showing the techs they know and you lack (your embassy or spies report them).')
        : offering
          ? 'You can’t see what they already know, so some of these may be worth nothing to them. An embassy or a spy at their capital would tell you.'
          : 'You can’t see what they know. Ask for one of their choice, or get an embassy or a spy at their capital to see their research.'));
    } else if (k === 'agreement') {
      const sel = h('select', null, ...Object.entries(AGREEMENTS).map(([id, a]) => h('option', { value: id, title: a.text }, a.name)));
      detail.append(sel, button('Add', () => add({ kind: 'agreement', agreement: sel.value }), { cls: 'small' }));
    } else if (k === 'status') {
      const war = relation(g, giver, taker).status === 'war';
      const sel = h('select', null, ...(war ? [['relations', 'Peace']] : [['nap', 'Non-aggression pact'], ['alliance', 'Alliance']]).map(([v, l]) => h('option', { value: v }, l)));
      detail.append(sel, button('Add', () => add({ kind: 'status', status: sel.value as 'nap' }), { cls: 'small' }));
    } else if (k === 'map') {
      detail.append(button('Add', () => add({ kind: 'map' }), { cls: 'small' }));
    } else if (k === 'vassal') {
      detail.append(button('Add', () => add({ kind: 'vassal' }), { cls: 'small' }));
    } else if (k === 'fleet') {
      const fleets = Object.values(g.fleets).filter((f) => f.owner === ui.viewer);
      const sel = h('select', null, ...fleets.map((f) => h('option', { value: f.id }, `${f.name} (${f.ships.length})`)));
      detail.append(sel, button('Add', () => sel.value && add({ kind: 'fleet', fleet: sel.value }), { cls: 'small' }));
    } else if (k === 'hex') {
      const explored = g.factions[ui.viewer].explored;
      const systems = g.map.hexes.map((x, i) => ({ x, i })).filter(({ x, i }) => x.owner === giver && x.system && x.system.homeOf !== giver && getBit(explored, i));
      if (!systems.length) detail.append(h('span', { class: 'dim' }, 'No tradeable systems you know of (home systems cannot be traded).'));
      else {
        const sel = h('select', null, ...systems.map(({ x, i }) => h('option', { value: String(i) }, `${x.system!.name} (level ${x.system!.development})`)));
        detail.append(sel, button('Add', () => add({ kind: 'hex', hex: Number(sel.value) }), { cls: 'small' }));
      }
    } else if (k === 'army') {
      const armies = Object.values(g.armies).filter((a) => a.owner === giver && a.hex !== null);
      if (!armies.length) detail.append(h('span', { class: 'dim' }, 'No armies on the ground.'));
      else {
        const sel = h('select', null, ...armies.map((a) => h('option', { value: a.id }, `Strength ${a.strength}${a.xp ? `, ${['', 'regular', 'veteran', 'elite'][a.xp]}` : ''} at ${g.map.hexes[a.hex!].system?.name ?? 'a hex'}`)));
        detail.append(sel, button('Add', () => add({ kind: 'army', army: sel.value }), { cls: 'small' }));
      }
    } else if (k === 'returnAgent') {
      const prisoners = Object.values(g.agents).filter((a) => a.capturedBy === giver && a.owner === taker);
      if (!prisoners.length) detail.append(h('span', { class: 'dim' }, 'No prisoners.'));
      else detail.append(button('Add', () => add({ kind: 'returnAgent', agent: prisoners[0].id }), { cls: 'small' }));
    }
  };
  kind.addEventListener('change', renderDetail);
  renderDetail();
  wrap.append(h('div', { class: 'row wrap' }, kind, detail));
  return wrap;
}

/** A one-on-one resource swap: one resource for another, sent as a proposal. */
function openSwap(ui: GameUI, to: FactionId, done: () => void): void {
  const g = ui.game;
  const res = ['energy', 'metals', 'exotics'] as const;
  const giveRes = h('select', null, ...res.map((r) => h('option', { value: r }, `${ICON[r]} ${r}`)));
  const getRes = h('select', null, ...res.map((r, i) => h('option', { value: r, selected: i === 1 }, `${ICON[r]} ${r}`)));
  const giveAmt = h('input', { type: 'number', value: '100', min: '1', style: 'width:80px' });
  const getAmt = h('input', { type: 'number', value: '50', min: '1', style: 'width:80px' });
  const hint = h('div', { class: 'dim' });
  const items = () => ({
    give: [{ kind: 'resource', resource: giveRes.value, amount: Math.max(1, Number(giveAmt.value)) }] as TradeItem[],
    receive: [{ kind: 'resource', resource: getRes.value, amount: Math.max(1, Number(getAmt.value)) }] as TradeItem[],
  });
  const update = () => {
    const { give, receive } = items();
    const ai = g.factions[to].controller === 'ai';
    if (giveRes.value === getRes.value) { hint.textContent = 'Pick two different resources.'; return; }
    if (!ai) { hint.textContent = 'They will answer on their turn.'; return; }
    const p: Proposal = { id: 'preview', from: ui.viewer, to, turn: g.turn, give, receive, answer: null };
    hint.textContent = proposalScore(g, p) > 0 ? 'They will probably accept.' : 'They will probably refuse.';
  };
  const fair = () => {
    const give = items().give[0];
    const per = itemValue(g, to, ui.viewer, { kind: 'resource', resource: getRes.value as 'energy', amount: 1 });
    getAmt.value = String(Math.max(1, Math.floor(itemValue(g, ui.viewer, to, give) / per)));
    update();
  };
  for (const el of [giveRes, getRes, giveAmt, getAmt]) el.addEventListener('input', update);
  const body = h('div', null,
    h('div', { class: 'row wrap' }, 'You give', giveAmt, giveRes),
    h('div', { class: 'row wrap', style: 'margin-top:6px' }, 'You get', getAmt, getRes, button('Fair amount', fair, { cls: 'small' })),
    h('div', { style: 'margin:8px 0' }, hint),
    h('div', { class: 'dim', style: 'font-size:12px' }, 'One-on-one swaps carry no fee, unlike the galactic exchange.'),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('span', { class: 'grow' }),
      button('Send offer', () => {
        if (giveRes.value === getRes.value) return;
        const { give, receive } = items();
        if (ui.act({ type: 'propose', to, give, receive })) { m.close(); done(); }
      }, { cls: 'primary' })));
  const m = modal(`Swap resources with ${theName(to)}`, body);
  update();
}
