/** Diplomacy: relations overview, inbox, prisoners and the proposal builder. */
import { factionDef } from '../../data/factions';
import { TECH_BY_ID } from '../../data/techs';
import { hasEmbassy, opinionOf } from '../../engine/agents';
import { AGREEMENTS, canPropose, proposalScore, type AgreementId } from '../../engine/diplomacy';
import { relation } from '../../engine/query';
import type { FactionId, Proposal, TradeItem } from '../../engine/types';
import { button, clear, h, modal } from '../dom';
import { factionChip, ICON, num } from '../format';
import type { GameUI } from '../game-ui';

const STATUS_LABEL: Record<string, string> = {
  war: 'At war', hostile: 'Hostile', neutral: 'Neutral', relations: 'Relations', nap: 'Non-aggression pact', alliance: 'Alliance',
};

export function describeItem(ui: GameUI, item: TradeItem): string {
  const g = ui.game;
  switch (item.kind) {
    case 'resource': return `${num(item.amount)} ${item.resource}${item.perTurn ? ` per turn for ${item.perTurn} turns` : ''}`;
    case 'tech': return `Tech: ${TECH_BY_ID[item.tech]?.name ?? item.tech}`;
    case 'fleet': return `Fleet: ${g.fleets[item.fleet]?.name ?? 'gone'} (${g.fleets[item.fleet]?.ships.length ?? 0} ships)`;
    case 'hex': return `Territory: ${g.map.hexes[item.hex].system?.name ?? `hex ${item.hex}`}`;
    case 'agreement': return AGREEMENTS[item.agreement as AgreementId]?.name ?? item.agreement;
    case 'status': return item.status === 'relations' || item.status === 'neutral' ? 'Peace' : item.status === 'nap' ? 'Non-aggression pact' : 'Alliance';
    case 'vassal': return 'Become a vassal';
    case 'returnAgent': return 'Return a captured agent';
    case 'map': return 'Star charts (map knowledge)';
  }
}

export function openDiplomacy(ui: GameUI): void {
  const body = h('div');
  modal('Diplomacy', body, { wide: true });
  const render = () => {
    clear(body);
    const g = ui.game;
    const me = ui.viewer;
    // Inbox
    const inbox = Object.values(g.proposals).filter((p) => p.to === me && !p.answer);
    if (inbox.length) {
      body.append(h('h3', null, 'Proposals for you'));
      for (const p of inbox) body.append(proposalCard(ui, p, render));
    }
    const sent = Object.values(g.proposals).filter((p) => p.from === me);
    if (sent.length) {
      body.append(h('h3', null, 'Your proposals'));
      for (const p of sent) body.append(proposalCard(ui, p, render));
    }
    const prisoners = Object.values(g.agents).filter((a) => a.capturedBy === me);
    if (prisoners.length) {
      body.append(h('h3', null, 'Prisoners'));
      for (const a of prisoners) {
        body.append(h('div', { class: 'row' }, factionChip(a.owner, true), a.kind, h('span', { class: 'grow' }),
          button('Execute', () => { if (confirm('Execute this prisoner? Everyone will think less of you.') && ui.act({ type: 'execute', agent: a.id })) render(); }, { cls: 'small danger', disabled: !ui.myTurn }),
          h('span', { class: 'dim' }, 'or offer their return in a proposal')));
      }
    }
    const guests = Object.values(g.agents).filter((a) => a.resident && a.target === me);
    // Relations table
    body.append(h('h3', null, 'Factions'));
    const table = h('table', { class: 't' }, h('tr', null, h('th', null, 'Faction'), h('th', null, 'Status'), h('th', null, 'Their view of you'),
      h('th', null, 'Embassies'), h('th', null, 'Agreements'), h('th', null, '')));
    const others = Object.keys(g.factions).filter((o) => o !== me && g.factions[o].alive);
    others.sort((a, b) => (g.factions[a].kind === 'major' ? 0 : 1) - (g.factions[b].kind === 'major' ? 0 : 1) || a.localeCompare(b));
    for (const o of others) {
      const r = relation(g, me, o);
      if (!r.contact) {
        table.append(h('tr', { class: 'dim' }, h('td', null, g.factions[o].kind === 'major' ? factionChip(o) : 'Unknown minor'), h('td', { colspan: '5' }, 'Not yet met')));
        continue;
      }
      const op = opinionOf(g, o, me);
      const actions = h('td', { class: 'row wrap' });
      if (g.factions[o].controller === 'human' && g.config.seats.length > 1) {
        actions.append(button('Message', () => ui.openMessages(o), { cls: 'small' }));
      }
      if (ui.myTurn) {
        if (canPropose(g, me, o)) actions.append(button('Propose…', () => openProposal(ui, o, render), { cls: 'small' }));
        if (r.status !== 'war') actions.append(button('Declare war', () => { if (confirm(`Declare war on the ${factionDef(o).name}?`) && ui.act({ type: 'declareWar', target: o })) render(); }, { cls: 'small danger' }));
        if (r.status === 'nap' || r.status === 'alliance') actions.append(button('Cancel treaty', () => { if (ui.act({ type: 'cancelTreaty', target: o })) render(); }, { cls: 'small' }));
        const guest = guests.find((a) => a.owner === o);
        if (guest) actions.append(button('Expel diplomat', () => { if (ui.act({ type: 'expel', agent: guest.id })) render(); }, { cls: 'small' }));
      }
      const f = g.factions[o];
      table.append(h('tr', null,
        h('td', null, factionChip(o), f.overlord ? h('div', { class: 'dim' }, `vassal of ${factionDef(f.overlord).short}`) : null,
          h('div', { class: 'dim', style: 'font-size:11px' }, factionDef(o).government)),
        h('td', { class: r.status === 'war' ? 'bad' : r.status === 'alliance' ? 'good' : '' }, STATUS_LABEL[r.status]),
        h('td', { class: op >= 0 ? 'good' : 'bad' }, num(op)),
        h('td', null, `${hasEmbassy(g, me, o) ? 'yours ✓' : 'yours ✗'} · ${hasEmbassy(g, o, me) ? 'theirs ✓' : 'theirs ✗'}`),
        h('td', null, r.agreements.map((a) => AGREEMENTS[a as AgreementId]?.name ?? a).join(', ') || h('span', { class: 'dim' }, 'none')),
        actions));
    }
    body.append(table);
    body.append(h('div', { class: 'dim', style: 'margin-top:8px' }, 'To negotiate you need an embassy: send a diplomat to their home system. Diplomats travelling through hostile space can be captured.'));
  };
  render();
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
  const m = modal(`Proposal to the ${factionDef(to).name}`, body, { wide: true });
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
      ai && (give.length || receive.length) ? h('span', { class: score > 0 ? 'good' : 'bad' }, score > 0 ? 'They will probably accept.' : 'They will probably refuse.') : h('span', { class: 'dim' }, ai ? 'Add something to trade.' : 'They will answer on their turn.'),
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
      const theirs = new Set(g.factions[taker].research.known);
      const options = g.factions[giver].research.known.filter((t) => !theirs.has(t));
      if (giver !== ui.viewer) detail.append(h('span', { class: 'dim' }, 'You can only see techs you know about; ask anyway:'));
      const sel = h('select', null, ...(giver === ui.viewer ? options : Object.keys(TECH_BY_ID).filter((t) => !theirs.has(t) && t !== 'ascension')).map((t) => h('option', { value: t }, TECH_BY_ID[t].name)));
      detail.append(sel, button('Add', () => sel.value && add({ kind: 'tech', tech: sel.value }), { cls: 'small' }));
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
