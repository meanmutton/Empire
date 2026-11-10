/** Online asynchronous play through the relay: lobby, turn download/upload, pushes and caretaker turns. */
import { aiTurn } from '../ai/ai';
import { factionDef } from '../data/factions';
import { PRESETS } from '../data/victories';
import { packState, unpackState } from '../net/codec';
import type { Lobby, LobbyConfig } from '../net/protocol';
import { RelayClient } from '../net/relay-client';
import type { ChatMessage } from '../net/protocol';
import type { Messaging } from './messaging';
import { activeFaction } from '../engine/query';
import { createGame } from '../engine/setup';
import { beginGame, endTurn, runUntilHuman } from '../engine/turn';
import type { GameState } from '../engine/types';
import { button, clear, h, modal, toast } from './dom';
import { rosterStrip } from './gallery';
import { GameUI } from './game-ui';
import { openHelp } from './screens/help';
import { openOptions } from './screens/options';
import { openBriefing } from './screens/briefing';
import { injectStyles } from './styles';

export interface OnlineEntry { code: string; token: string; name: string; faction: string | null; label: string; updated: number; }

const KEY = 'empire.online';

export function onlineGames(): OnlineEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as OnlineEntry[]).sort((a, b) => b.updated - a.updated);
  } catch {
    return [];
  }
}

function remember(e: OnlineEntry): void {
  try {
    const list = onlineGames().filter((x) => x.code !== e.code);
    list.unshift({ ...e, updated: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch { /* storage unavailable: the code still works, but this browser won't list the game */ }
}

export function newToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class OnlineSession {
  private client: RelayClient;
  private lobby: Lobby | null = null;
  private you: string | null = null;
  private game: GameState | null = null;
  private version = 0;
  private ui: GameUI | null = null;
  private busy = false;
  private connected = false;
  /** This player's notification email as the relay shows it (masked), or null. */
  private email: string | null = null;
  private chat: RelayMessaging;

  private constructor(private root: HTMLElement, url: string, private entry: OnlineEntry, private onQuit: () => void) {
    injectStyles();
    this.client = new RelayClient(url);
    this.client.onPush = (l) => void this.onLobby(l);
    this.client.onMessage = (m) => this.chat.add([m], this.you);
    this.client.onStatus = (c) => { this.connected = c; if (!c) toast('Connection lost. Reconnecting…', 'error'); };
    this.client.onReconnect = () => void this.client.hello(entry.code, entry.token).then((r) => this.onLobby(r.lobby, r.you)).then(() => this.chat.refresh()).catch(() => {});
    this.chat = new RelayMessaging(this.client, entry);
  }

  /** Hosts a new game. */
  static async host(root: HTMLElement, url: string, name: string, faction: string, config: LobbyConfig, onQuit: () => void): Promise<OnlineSession> {
    const entry: OnlineEntry = { code: '', token: newToken(), name, faction, label: '', updated: Date.now() };
    const s = new OnlineSession(root, url, entry, onQuit);
    s.status('Creating game…');
    const lobby = await s.client.create(name, faction, entry.token, config);
    entry.code = lobby.code;
    s.you = faction;
    remember({ ...entry, label: `hosting as ${factionDef(faction).short}` });
    await s.onLobby(lobby, faction);
    return s;
  }

  /** Joins by code, or resumes a game this browser is already in. */
  static async join(root: HTMLElement, url: string, code: string, name: string, onQuit: () => void): Promise<OnlineSession> {
    const known = onlineGames().find((g) => g.code === code);
    const entry: OnlineEntry = known ?? { code, token: newToken(), name, faction: null, label: '', updated: Date.now() };
    const s = new OnlineSession(root, url, entry, onQuit);
    s.status(`Connecting to game ${code}…`);
    const r = known ? await s.client.hello(code, entry.token) : await s.client.join(code, name, entry.token);
    if ('email' in r) s.email = (r as { email: string | null }).email;
    remember({ ...entry, faction: r.you, label: r.you ? factionDef(r.you).short : 'joining' });
    await s.onLobby(r.lobby, r.you);
    return s;
  }

  private status(text: string): void {
    clear(this.root).append(h('div', { class: 'screen', style: 'display:flex;align-items:center;justify-content:center' },
      h('div', { style: 'text-align:center' }, h('div', { class: 'subtitle' }, text), button('Back to title', () => this.quit()))));
  }

  private quit(): void {
    this.client.close();
    this.ui?.destroy();
    this.onQuit();
  }

  private async onLobby(lobby: Lobby, you?: string | null): Promise<void> {
    const prev = this.lobby;
    this.lobby = lobby;
    if (you !== undefined) this.you = you;
    if (this.you) remember({ ...this.entry, faction: this.you, label: `${factionDef(this.you).short}, turn ${lobby.turn}${lobby.active === this.you ? ' · your turn!' : ''}` });
    if (lobby.status === 'lobby') { this.renderLobby(); return; }
    if (!this.you) { this.status('This game has started without you.'); return; }
    if (this.busy) return;
    if (!this.game || lobby.version > this.version) {
      await this.fetchState();
      if (lobby.active === this.you && prev && prev.active !== this.you) notifyYourTurn();
    } else {
      this.ui?.refresh();
    }
  }

  private async fetchState(): Promise<void> {
    if (!this.lobby || !this.you) return;
    try {
      const { data, version } = await this.client.download(this.lobby.code, this.entry.token);
      this.game = await unpackState(data);
      this.version = version;
    } catch (e) {
      toast((e as Error).message, 'error');
      return;
    }
    const first = !this.ui;
    if (first) void this.chat.refresh();
    if (!this.ui) this.ui = new GameUI(this.root, {
      messaging: this.chat,
      gameKey: `online-${this.entry.code}`,
      canAct: () => !this.busy && !!this.lobby && this.lobby.version === this.version && this.lobby.active === this.you,
      afterEndTurn: () => void this.afterEndTurn(),
      openMenu: (ui) => this.menu(ui),
      waitingText: () => this.waitingText(),
    });
    this.ui.setGame(this.game, this.you, first);
    this.ui.refresh();
    if (this.lobby.active === this.you) {
      openBriefing(this.ui, { auto: true });
      document.title = '★ Your turn · Empire';
    } else {
      document.title = 'Empire';
    }
  }

  private waitingText(): string {
    if (!this.lobby) return '';
    if (this.busy) return 'Sending your turn…';
    if (!this.connected) return 'Offline: reconnecting…';
    const who = this.lobby.active;
    const seat = this.lobby.seats.find((s) => s.faction === who);
    const since = Math.round((Date.now() - this.lobby.lastSubmitAt) / 3_600_000);
    return seat ? `Waiting for ${seat.name} (${factionDef(who!).short}) · ${since}h` : 'Waiting…';
  }

  private async afterEndTurn(): Promise<void> {
    if (!this.game || !this.lobby) return;
    runUntilHuman(this.game, aiTurn);
    await this.send();
  }

  /** Uploads the current state as the next version. */
  private async send(forFaction?: string): Promise<void> {
    const g = this.game!, lobby = this.lobby!;
    this.busy = true;
    this.ui?.refresh();
    try {
      const packed = await packState(g);
      this.version = await this.client.submit(lobby.code, this.entry.token, packed, this.version, activeFaction(g), g.turn, !!g.winner || !!g.over, forFaction);
      lobby.version = this.version;
      lobby.active = activeFaction(g);
      lobby.turn = g.turn;
      lobby.lastSubmitAt = Date.now();
      toast('Turn sent.');
      document.title = 'Empire';
    } catch (e) {
      toast((e as Error).message, 'error');
      // The relay refused (e.g. someone else moved first): reload the authoritative state.
      this.busy = false;
      await this.fetchState();
    } finally {
      this.busy = false;
      this.ui?.refresh();
    }
  }

  private menu(ui: GameUI): void {
    const lobby = this.lobby!;
    const overdue = lobby.config.timeoutHours > 0 && Date.now() - lobby.lastSubmitAt > lobby.config.timeoutHours * 3_600_000;
    const other = lobby.active && lobby.active !== this.you ? lobby.active : null;
    const body = h('div', null,
      h('div', null, 'Game code: ', h('b', { style: 'font-size:18px;letter-spacing:.2em' }, lobby.code)),
      h('div', { class: 'dim' }, 'Players: ', lobby.seats.map((s) => `${s.name} (${factionDef(s.faction).short})`).join(', ')),
      h('div', { class: 'row wrap', style: 'margin-top:10px' },
        button('How to play', () => { m.close(); openHelp(); }),
        button('Options', () => { m.close(); openOptions(() => ui.refresh()); }),
        button('Reload from relay', async () => { m.close(); await this.fetchState(); }),
        button(this.email ? `Email notices: ${this.email}` : 'Email me when it’s my turn…', () => { m.close(); this.emailDialog(); }),
        other && overdue ? button(`Play a caretaker turn for ${factionDef(other).short}`, () => { m.close(); void this.caretaker(other); }, { title: `They have had more than ${lobby.config.timeoutHours} hours.` }) : null,
        button('Leave to title', () => { m.close(); this.quit(); })));
    const m = modal('Menu', body);
    void ui;
  }

  /** Turn notices by email (optional). The address stays on the relay and is only ever shown masked. */
  private emailDialog(): void {
    const input = h('input', { type: 'email', placeholder: 'you@example.com', value: localGet('empire.email') ?? '', style: 'width:260px' });
    const save = async (email: string | null) => {
      try {
        this.email = await this.client.setEmail(this.entry.code, this.entry.token, email);
        if (email) localSet('empire.email', email);
        toast(email ? 'You will get an email when it is your turn.' : 'Email notices are off.');
        m.close();
        if (this.lobby?.status === 'lobby') this.renderLobby();
      } catch (e) { toast((e as Error).message, 'error'); }
    };
    const body = h('div', null,
      h('div', { class: 'dim', style: 'margin-bottom:8px' },
        'Get an email when it becomes your turn and you are not in the game, and when the game ends. Your address is stored only on the game relay, never shown to other players, and deleted when you turn notices off or the game expires.'),
      this.email ? h('div', { style: 'margin-bottom:6px' }, 'Currently sending to ', h('b', null, this.email)) : null,
      h('div', { class: 'row wrap' }, input,
        button('Save', () => void save(input.value.trim()), { cls: 'primary small' }),
        this.email ? button('Turn off', () => void save(null), { cls: 'small' }) : null));
    const m = modal('Email notices', body);
  }

  /** Lets the computer play a defensive turn for an overdue player, then hands on. */
  private async caretaker(faction: string): Promise<void> {
    if (!this.game || this.busy) return;
    await this.fetchState();
    const g = this.game;
    if (activeFaction(g) !== faction) { toast('Their turn has already moved on.'); return; }
    aiTurn(g, faction, { caretaker: true });
    endTurn(g);
    runUntilHuman(g, aiTurn);
    await this.send(faction);
  }

  // -------------------------------------------------------------------------------------------------------
  // Lobby

  private renderLobby(): void {
    const lobby = this.lobby!;
    const isHost = this.you === lobby.host;
    const screen = h('div', { class: 'screen' });
    clear(this.root).append(screen);
    const link = `${location.origin}${location.pathname}?join=${lobby.code}${new URLSearchParams(location.search).get('relay') ? `&relay=${encodeURIComponent(new URLSearchParams(location.search).get('relay')!)}` : ''}`;
    screen.append(h('div', { class: 'title', style: 'font-size:30px' }, 'EMPIRE'),
      h('div', { style: 'max-width:820px;margin:0 auto' },
        h('div', { class: 'card', style: 'text-align:center' },
          h('div', { class: 'dim' }, 'Game code'),
          h('div', { style: 'font-size:40px;letter-spacing:.35em;color:var(--accent)' }, lobby.code),
          h('div', { class: 'dim' }, 'Friends enter this code on the title screen, or open this link:'),
          h('div', { class: 'row', style: 'justify-content:center' }, h('input', { value: link, readonly: 'true', style: 'width:min(520px, 80vw)' }),
            button('Copy', () => { void navigator.clipboard?.writeText(link); toast('Link copied.'); }, { cls: 'small' }))),
        h('h3', null, `Players (${lobby.seats.length}/5)`),
        ...lobby.seats.map((s) => h('div', { class: 'row' }, h('b', { style: `color:${factionDef(s.faction).color}` }, factionDef(s.faction).name), s.name,
          s.faction === lobby.host ? h('span', { class: 'dim' }, '(host)') : null, s.faction === this.you ? h('span', { class: 'good' }, '(you)') : null)),
        h('h3', null, this.you ? 'Switch empire' : 'Pick your empire'),
        h('div', { class: 'dim' }, 'Empires nobody picks are played by the computer.')));
    const free = PRESETS[lobby.config.preset ?? 'classic'].majors.filter((m) => !lobby.seats.some((s) => s.faction === m));
    const name = h('input', { value: this.entry.name, style: 'width:160px' });
    if (!(isHost)) screen.lastElementChild!.append(h('div', { class: 'row', style: 'margin:6px 0' }, 'Your name:', name));
    for (const f of free) {
      const d = factionDef(f);
      screen.lastElementChild!.append(h('div', { class: 'faction-card' },
        h('div', { class: 'row' }, h('b', { style: `color:${d.color}` }, d.name), h('span', { class: 'grow' }),
          isHost ? null : button('Take this empire', async () => {
            try {
              this.entry.name = name.value.trim() || 'Player';
              const l = await this.client.claim(lobby.code, this.entry.token, f, this.entry.name);
              this.you = f;
              remember({ ...this.entry, faction: f, label: d.short });
              await this.onLobby(l, f);
            } catch (e) { toast((e as Error).message, 'error'); }
          }, { cls: 'small primary' })),
        h('div', { class: 'dim' }, d.text), rosterStrip(f, 28)));
    }
    if (this.you) screen.lastElementChild!.append(h('div', { class: 'card row wrap', style: 'margin-top:12px' },
      h('span', { class: 'grow' }, this.email ? `Email notices go to ${this.email}.` : 'Optional: get an email when it is your turn.'),
      button(this.email ? 'Change' : 'Set up email notices', () => this.emailDialog(), { cls: 'small' })));
    const actions = h('div', { class: 'row', style: 'margin-top:16px' },
      button('Back to title', () => this.quit()), h('span', { class: 'grow' }),
      isHost ? button('Start the game', () => void this.startGame(), { cls: 'primary' }) : h('span', { class: 'dim' }, 'Waiting for the host to start…'));
    screen.lastElementChild!.append(actions);
  }

  private async startGame(): Promise<void> {
    const lobby = this.lobby!;
    this.status('Generating the galaxy…');
    const c = lobby.config;
    const game = createGame({
      seed: c.seed, seats: lobby.seats.map((s) => ({ faction: s.faction, name: s.name })),
      width: c.width, height: c.height, turnLimit: c.turnLimit, preset: c.preset ?? 'classic', combatRounds: c.combatRounds,
    });
    beginGame(game, aiTurn);
    try {
      const packed = await packState(game);
      this.version = await this.client.start(lobby.code, this.entry.token, packed, activeFaction(game), game.turn);
      this.game = game;
      lobby.status = 'playing';
      lobby.version = this.version;
      lobby.active = activeFaction(game);
      lobby.turn = game.turn;
      await this.fetchState();
    } catch (e) {
      toast((e as Error).message, 'error');
      this.renderLobby();
    }
  }
}

/** Chat kept on the relay: private per conversation, works whether or not it is your turn. */
class RelayMessaging implements Messaging {
  private items: ChatMessage[] = [];
  private subs = new Set<() => void>();
  constructor(private client: RelayClient, private entry: OnlineEntry) {}

  list(viewer: string): ChatMessage[] {
    void viewer; // the relay only sends messages this player may read
    return this.items;
  }

  async refresh(): Promise<void> {
    const since = this.items.length ? this.items[this.items.length - 1].at : 0;
    try {
      this.add(await this.client.fetchMessages(this.entry.code, this.entry.token, since), null);
    } catch { /* offline; try again on reconnect */ }
  }

  add(ms: ChatMessage[], me: string | null): void {
    const known = new Set(this.items.map((m) => m.id));
    const fresh = ms.filter((m) => !known.has(m.id));
    if (!fresh.length) return;
    this.items = [...this.items, ...fresh].sort((a, b) => a.at - b.at);
    const incoming = fresh.filter((m) => me && m.from !== me);
    if (incoming.length) toast(`New message from ${factionDef(incoming[incoming.length - 1].from).short}.`);
    for (const s of this.subs) s();
  }

  async send(from: string, to: string[], text: string, turn: number): Promise<boolean> {
    void from;
    const m = await this.client.sendMessage(this.entry.code, this.entry.token, to, text, turn);
    this.add([m], null);
    return true;
  }

  subscribe(cb: () => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
}

function notifyYourTurn(): void {
  toast("It's your turn!");
  document.title = '★ Your turn · Empire';
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Empire', { body: "It's your turn." });
  } catch { /* notifications are optional */ }
}

function localGet(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localSet(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
}
