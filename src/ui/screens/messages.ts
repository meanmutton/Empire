/** Conversations: chat between human players and statements to computer powers, shown in the Diplomacy screen. */
import { factionDef } from '../../data/factions';
import { MAX_MESSAGE_LENGTH } from '../../net/protocol';
import { relation } from '../../engine/query';
import { button, h, toast } from '../dom';
import { leaderInfo, portraitElement } from '../portraits';
import type { GameUI } from '../game-ui';
import { infoTip } from '../tooltip';
import { dispatchesWith, lastRead, markRead, threadKey, type Messaging } from '../messaging';
import { STATEMENTS } from '../../engine/dispatch';
import type { Statement } from '../../engine/types';

/** Other human players the viewer may write to: those they have met. */
export function contactsFor(ui: GameUI): string[] {
  const g = ui.game;
  return g.config.seats.map((s) => s.faction)
    .filter((f) => f !== ui.viewer && g.factions[f].alive && relation(g, ui.viewer, f).contact);
}

/** Display name of a chat thread key ('all', or a comma list of factions). */
export function threadName(key: string): string {
  return key === 'all' ? 'All players' : key.split(',').map((f) => factionDef(f).short).join(', ');
}

/** Unread messages from other humans in one thread. */
export function threadUnread(ui: GameUI, messaging: Messaging, key: string): number {
  const me = ui.viewer;
  return messaging.list(me).filter((x) => threadKey(x, me) === key && x.from !== me && x.at > lastRead(ui.game.id, me, key)).length;
}

/** Unread words from a computer power. */
export function aiUnread(ui: GameUI, power: string): number {
  return dispatchesWith(ui.game, ui.viewer, power).filter((d) => d.from === power && d.n > lastRead(ui.game.id, ui.viewer, `ai:${power}`)).length;
}

/** Group threads (more than one other player) the viewer has messages in. */
export function groupThreads(ui: GameUI, messaging: Messaging): string[] {
  return [...new Set(messaging.list(ui.viewer).map((x) => threadKey(x, ui.viewer)).filter((k) => k !== 'all' && k.includes(',')))];
}

/** A chat thread with human players: the conversation and a box to write in. Marks it read. */
export function chatPanel(ui: GameUI, messaging: Messaging, thread: string, drafts: Map<string, string>): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const seatName = (f: string) => g.config.seats.find((s) => s.faction === f)?.name ?? factionDef(f).short;
  const msgs = messaging.list(me).filter((x) => threadKey(x, me) === thread);
  if (msgs.length) markRead(g.id, me, thread, msgs[msgs.length - 1].at);
  const log = h('div', { style: 'overflow:auto;max-height:42vh;display:flex;flex-direction:column;gap:6px;padding:4px' });
  if (msgs.length === 0) log.append(h('div', { class: 'dim' }, thread === 'all' ? 'Nothing said to everyone yet.' : 'No messages yet.'));
  for (const x of msgs) {
    const mine = x.from === me;
    const bubble = h('div', { style: `align-self:${mine ? 'flex-end' : 'flex-start'};max-width:80%;background:${mine ? '#26355f' : '#18203a'};border:1px solid var(--line);border-radius:10px;padding:6px 9px` },
      h('div', { class: 'dim', style: 'font-size:11px' }, mine ? 'You' : `${seatName(x.from)} (${factionDef(x.from).short})`, ` · turn ${x.turn} · ${new Date(x.at).toLocaleString()}`),
      h('div', { style: 'white-space:pre-wrap;word-break:break-word' }));
    (bubble.lastChild as HTMLElement).textContent = x.text;
    log.append(bubble);
  }
  const recipients = thread === 'all' ? ['all'] : thread.split(',');
  const canWrite = thread === 'all' ? g.config.seats.length > 1 : recipients.every((f) => contactsFor(ui).includes(f));
  const input = h('textarea', { rows: '3', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: canWrite ? `Message ${threadName(thread)}…` : 'You have not met them yet.', disabled: !canWrite,
    style: 'width:100%;resize:vertical;background:#0a1022;color:var(--text);border:1px solid #33416b;border-radius:6px;padding:6px;font:inherit' });
  const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:0' });
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    drafts.delete(thread);
    const ok = await messaging.send(me, recipients, text, g.turn).catch((e: Error) => { toast(e.message, 'error'); return false; });
    // Sending re-renders the screen with a fresh box; only an unsent message is put back.
    const box = (wrap.isConnected ? wrap : document).querySelector('.chat-box') as HTMLTextAreaElement | null;
    if (!ok) {
      drafts.set(thread, text);
      if (box) box.value = text;
    }
    if (box) { box.disabled = false; box.focus(); }
  };
  input.classList.add('chat-box');
  input.value = drafts.get(thread) ?? '';
  input.addEventListener('input', () => drafts.set(thread, input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } });
  wrap.append(log, input, h('div', { class: 'row' }, h('span', { class: 'dim', style: 'font-size:11px' }, 'Enter to send, Shift+Enter for a new line. Only the people in the conversation can read it.'), h('span', { class: 'grow' }),
    button('Send', () => void send(), { cls: 'primary small', disabled: !canWrite })));
  setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
  return wrap;
}

/** A conversation with a computer power: its words, your statements, and the statement picker. */
export function aiThread(ui: GameUI, power: string, rerender: () => void): HTMLElement {
  const g = ui.game;
  const me = ui.viewer;
  const d = factionDef(power);
  const items = dispatchesWith(g, me, power);
  if (items.length) markRead(g.id, me, `ai:${power}`, items[items.length - 1].n);
  const log = h('div', { style: 'overflow:auto;max-height:42vh;display:flex;flex-direction:column;gap:6px;padding:4px' });
  if (items.length === 0) log.append(h('div', { class: 'dim' }, `${/^the /i.test(d.name) ? d.name : `The ${d.name}`} have said nothing to you yet.`));
  // The same words said again in a row show once, with a count.
  const shown: { x: (typeof items)[number]; times: number; last: number }[] = [];
  for (const x of items) {
    const prev = shown[shown.length - 1];
    if (prev && prev.x.from === x.from && prev.x.text === x.text && !x.statement) { prev.times++; prev.last = x.turn; continue; }
    shown.push({ x, times: 1, last: x.turn });
  }
  // Their words carry their leader's face and name.
  const speaker = leaderInfo(g, power);
  for (const { x, times, last } of shown) {
    const mine = x.from === me;
    const bubble = h('div', { style: `max-width:80%;background:${mine ? '#26355f' : '#18203a'};border:1px solid ${mine ? 'var(--line)' : d.color};border-radius:10px;padding:6px 9px;min-width:0` },
      h('div', { class: 'dim', style: 'font-size:11px' }, mine ? 'You' : speaker.full, times > 1 ? ` · turns ${x.turn}–${last} · said ${times} times` : ` · turn ${x.turn}`, mine && x.statement ? (x.answered ? ' · answered' : ' · they will answer on their turn') : ''),
      h('div', { style: 'white-space:pre-wrap;word-break:break-word' }));
    (bubble.lastChild as HTMLElement).textContent = x.text;
    log.append(mine ? h('div', { style: 'align-self:flex-end;display:flex;max-width:100%' }, bubble)
      : h('div', { class: 'row', style: 'align-self:flex-start;align-items:flex-start;gap:6px;max-width:100%;flex-wrap:nowrap' }, portraitElement(power, speaker.portrait, 'avatar', speaker.full), bubble));
  }
  const kind = h('select', null, ...Object.entries(STATEMENTS).map(([k, v]) => h('option', { value: k, title: v.text }, v.name)));
  const targets = Object.keys(g.factions).filter((f) => f !== me && f !== power && g.factions[f].alive && relation(g, me, f).contact);
  const target = h('select', null, ...targets.map((t) => h('option', { value: t }, factionDef(t).name)));
  const syncTarget = () => { target.style.display = STATEMENTS[kind.value as Statement['kind']].needsTarget ? '' : 'none'; };
  kind.addEventListener('change', syncTarget);
  syncTarget();
  const send = () => {
    const k = kind.value as Statement['kind'];
    if (STATEMENTS[k].needsTarget && !target.value) { toast('Pick a faction.', 'error'); return; }
    const statement = (k === 'requestAid' || k === 'denounce' ? { kind: k, target: target.value } : { kind: k }) as Statement;
    if (ui.act({ type: 'statement', to: power, statement }, true)) rerender();
  };
  return h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:0' },
    log,
    h('div', { class: 'card' },
      h('div', { class: 'row wrap' }, kind, target, infoTip('Computer powers do not read free text. Make a statement and they will answer, and act on it, at the start of their turn.'), h('span', { class: 'grow' }),
        button('Send', send, { cls: 'primary small', disabled: !ui.myTurn, title: ui.myTurn ? '' : 'Statements are made on your turn.' }))));
}
