/** Messages: private and public chat between human players. */
import { factionDef } from '../../data/factions';
import { MAX_MESSAGE_LENGTH } from '../../net/protocol';
import { relation } from '../../engine/query';
import { button, clear, h, modal, toast } from '../dom';
import { factionChip } from '../format';
import type { GameUI } from '../game-ui';
import { lastRead, markRead, threadKey, type Messaging } from '../messaging';

/** Other human players the viewer may write to: those they have met. */
export function contactsFor(ui: GameUI): string[] {
  const g = ui.game;
  return g.config.seats.map((s) => s.faction)
    .filter((f) => f !== ui.viewer && g.factions[f].alive && relation(g, ui.viewer, f).contact);
}

export function openMessages(ui: GameUI, messaging: Messaging, initial?: string): void {
  const g = ui.game;
  const me = ui.viewer;
  let thread = initial ?? 'all';
  const drafts = new Map<string, string>();
  const body = h('div', { class: 'msg-grid' });
  const m = modal('Messages', body, { wide: true, onClose: () => unsub() });
  const unsub = messaging.subscribe(() => render());
  const nameOf = (key: string) => key === 'all' ? 'All players' : key.split(',').map((f) => factionDef(f).short).join(', ');
  const seatName = (f: string) => g.config.seats.find((s) => s.faction === f)?.name ?? factionDef(f).short;

  const render = () => {
    clear(body);
    const all = messaging.list(me);
    const keys = new Set(['all', ...contactsFor(ui), ...all.map((x) => threadKey(x, me))]);
    const list = h('div');
    for (const k of keys) {
      const msgs = all.filter((x) => threadKey(x, me) === k);
      const unread = msgs.filter((x) => x.from !== me && x.at > lastRead(g.id, me, k)).length;
      const label = k === 'all' ? h('span', null, '📢 All players') : h('span', null, ...k.split(',').map((f) => factionChip(f, true)));
      list.append(button(h('span', { class: 'row grow' }, label, h('span', { class: 'grow' }), unread ? h('b', { class: 'good' }, String(unread)) : ''),
        () => { thread = k; render(); }, { cls: `list-btn small ${k === thread ? 'on' : ''}` }));
    }
    list.append(h('div', { class: 'dim', style: 'margin-top:8px;font-size:12px' }, 'You can write to human players you have met. Messages are private to the people in the conversation.'));

    const msgs = all.filter((x) => threadKey(x, me) === thread);
    if (msgs.length) markRead(g.id, me, thread, msgs[msgs.length - 1].at);
    const log = h('div', { style: 'flex:1;overflow:auto;max-height:52vh;display:flex;flex-direction:column;gap:6px;padding:4px' });
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
    const canWrite = thread === 'all' ? contactsFor(ui).length > 0 || g.config.seats.length > 1 : recipients.every((f) => contactsFor(ui).includes(f));
    const input = h('textarea', { rows: '3', maxlength: String(MAX_MESSAGE_LENGTH), placeholder: canWrite ? `Message ${nameOf(thread)}…` : 'You have not met them yet.', disabled: !canWrite,
      style: 'width:100%;resize:vertical;background:#0a1022;color:var(--text);border:1px solid #33416b;border-radius:6px;padding:6px;font:inherit' });
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      const sentFrom = thread;
      input.disabled = true;
      drafts.delete(sentFrom);
      const ok = await messaging.send(me, recipients, text, g.turn).catch((e: Error) => { toast(e.message, 'error'); return false; });
      // Sending re-renders the dialog with a fresh box; only an unsent message is put back.
      const box = body.querySelector('textarea');
      if (!ok) {
        drafts.set(sentFrom, text);
        if (box) box.value = text;
      }
      if (box) { box.disabled = false; box.focus(); }
    };
    input.value = drafts.get(thread) ?? '';
    input.addEventListener('input', () => drafts.set(thread, input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } });
    const right = h('div', { style: 'display:flex;flex-direction:column;gap:8px;min-width:0' },
      h('div', { class: 'row' }, h('b', null, nameOf(thread)), h('span', { class: 'grow' }),
        thread !== 'all' && recipients.length === 1 ? h('span', { class: 'dim' }, `Relation: ${relation(g, me, recipients[0]).status}`) : ''),
      log, input, h('div', { class: 'row' }, h('span', { class: 'dim', style: 'font-size:11px' }, 'Enter to send, Shift+Enter for a new line'), h('span', { class: 'grow' }),
        button('Send', () => void send(), { cls: 'primary small', disabled: !canWrite })));
    body.append(list, right);
    log.scrollTop = log.scrollHeight;
    setTimeout(() => { if (canWrite) input.focus(); }, 0);
    void m;
  };
  render();
}
