/** The in-game client: map, top bar, context side panel and the screens opened from it. */
import { openAgents, openColonies, openFleets } from './screens/manage';
import { buildStarted, refundFor } from '../engine/economy';
import { DOCTRINE_IDS, DOCTRINES, type DoctrineId } from '../data/doctrines';
import { isCrippled } from '../engine/combat';
import { battleForecast, FORECAST_NAMES } from '../engine/forecast';
import { BALANCE } from '../data/balance';
import { design, DESIGNS_BY_FACTION } from '../data/designs';
import { factionDef, hasAbility } from '../data/factions';
import { IMPROVEMENTS, PLANET_YIELDS, STAR_YIELDS, TERRAIN_INFO } from '../data/improvements';
import { CLASSES, ROLES } from '../data/ships';
import { TECH_BY_ID } from '../data/techs';
import { applyAction, type Action } from '../engine/actions';
import { getBit } from '../engine/bitset';
import { cargoFree } from '../engine/ground';
import { blockadersAt } from '../engine/blockade';
import { checkBuild, factionIncome, popCapOf, productionOf, REPEAT_FALLOFF, rushCost, slotsOf, systemYield } from '../engine/economy';
import { MISSIONS, type MissionId } from '../engine/espionage';
import { planPath, reachableThisTurn } from '../engine/movement';
import { activeFaction, relation } from '../engine/query';
import { availableTechs, techCost } from '../engine/research';
import type { Fleet, GameState } from '../engine/types';
import { canSeeFleet } from '../engine/visibility';
import { bar, button, clear, h, modal, toast } from './dom';
import { costText, factionChip, ICON, num, signed } from './format';
import { MapView, Minimap } from './mapview';
import { openDiplomacy } from './screens/diplomacy';
import { openReport } from './screens/report';
import { openResearch } from './screens/research';
import { injectStyles } from './styles';
import { isGameOver } from '../engine/victory';
import { unreadCount, type Messaging } from './messaging';
import { openMessages } from './screens/messages';
import { openMarket } from './screens/market';
import { openVictory } from './screens/victory';
import { routeCapacity, routeIncome, routesOf } from '../engine/routes';
import { tokenImage } from './tokens';

export interface GameHost {
  /** The viewer pressed End Turn (after the engine processed it). */
  afterEndTurn(ui: GameUI): void;
  /** Opens the game menu. */
  openMenu(ui: GameUI): void;
  /** Whether the viewer may act now. */
  canAct(ui: GameUI): boolean;
  /** Status text when the viewer can't act (e.g. waiting for another player). */
  waitingText?(ui: GameUI): string;
  /** Chat between human players, when the game has more than one. */
  messaging?: Messaging;
}

export const DEV_NAMES = ['Unsettled', 'Outpost', 'Colony', 'Settlement', 'Industrial World', 'Core World'];

export class GameUI {
  readonly root: HTMLElement;
  game!: GameState;
  viewer!: string;
  readonly view: MapView;
  private mini: Minimap;
  private top: HTMLElement;
  private side: HTMLElement;
  private hint: HTMLElement;
  selHex: number | null = null;
  selFleet: string | null = null;
  selAgent: string | null = null;
  private splitSet = new Set<string>();
  private pendingDest: number | null = null;
  private buildTab: 'ships' | 'improvements' | 'other' = 'ships';

  constructor(root: HTMLElement, private host: GameHost) {
    injectStyles();
    this.root = root;
    clear(root);
    const canvas = h('canvas', { id: 'map' });
    this.top = h('div', { id: 'topbar' });
    this.side = h('div', { id: 'side' });
    this.hint = h('div', { id: 'hint' });
    const miniCanvas = h('canvas', { id: 'mini' });
    root.append(canvas, this.top, this.side, this.hint, miniCanvas);
    this.view = new MapView(canvas);
    this.mini = new Minimap(miniCanvas, this.view);
    this.view.onCamera = () => this.mini.draw();
    this.view.onHexClick = (hex, ev) => this.clickHex(hex, ev);
    this.unsubscribe = host.messaging?.subscribe(() => { if (this.game) this.renderTop(); }) ?? null;
    const signal = this.listeners.signal;
    window.addEventListener('resize', () => { this.view.resize(); this.mini.draw(); }, { signal });
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === 'Escape') { if (this.moveMode) this.toggleMove(false); else this.select(null); }
      if (e.key === 'n' && !typing) this.nextIdle();
      if (e.key === 'm' && !typing) this.toggleMove();
    }, { signal });
  }

  private listeners = new AbortController();

  /** Detaches window listeners and stops the map's render loop. */
  private unsubscribe: (() => void) | null = null;

  destroy(): void {
    this.unsubscribe?.();
    this.listeners.abort();
    this.view.destroy();
  }

  setGame(game: GameState, viewer: string, center = true): void {
    this.game = game;
    this.viewer = viewer;
    this.view.resize();
    this.view.rightInset = window.innerWidth > 760 ? 360 : 0;
    this.view.setState(game, viewer);
    if (center) this.view.centerOn(game.factions[viewer].home);
    this.select(null);
    this.mini.draw();
  }

  get myTurn(): boolean {
    return this.host.canAct(this) && activeFaction(this.game) === this.viewer && !isGameOver(this.game);
  }

  /** Applies an order for the viewer, refreshing the UI. */
  act(action: Action, quiet = false): boolean {
    if (!this.myTurn) { toast('It is not your turn.', 'error'); return false; }
    const r = applyAction(this.game, this.viewer, action);
    if (!r.ok) toast(r.reason, 'error');
    else if (!quiet && r.text) toast(r.text);
    if (this.selFleet && !this.game.fleets[this.selFleet]) this.selFleet = null;
    if (this.selAgent && !this.game.agents[this.selAgent]) this.selAgent = null;
    this.refresh();
    return r.ok;
  }

  private refreshHooks = new Set<() => void>();

  /** Calls `fn` whenever the game view refreshes (after an order, a move, etc.). Returns an unsubscribe. */
  onRefresh(fn: () => void): () => void {
    this.refreshHooks.add(fn);
    return () => this.refreshHooks.delete(fn);
  }

  private runHooks(): void {
    for (const fn of [...this.refreshHooks]) fn();
  }

  /** Redraws the side panel and anything else showing the same controls (the management screens). */
  private rerender(): void {
    this.renderSide();
    this.runHooks();
  }

  /** True while the viewer is choosing a destination for the selected fleet or agent. */
  get moving(): boolean {
    return this.moveMode;
  }

  refresh(): void {
    this.view.refresh();
    this.updateOverlay();
    this.renderTop();
    this.renderSide();
    this.mini.draw();
    this.runHooks();
  }

  /** Ends the turn; with nothing being researched (and something to research), opens Research first. */
  endTurn(skipResearchCheck = false): void {
    if (!this.myTurn) return;
    const research = this.game.factions[this.viewer].research;
    if (!skipResearchCheck && !research.current && availableTechs(this.game, this.viewer).length > 0) {
      openResearch(this, { beforeEndTurn: true });
      return;
    }
    const r = applyAction(this.game, this.viewer, { type: 'endTurn' });
    if (!r.ok) { toast(r.reason, 'error'); return; }
    this.select(null);
    this.host.afterEndTurn(this);
  }

  // -------------------------------------------------------------------------------------------------------
  // Selection and map clicks

  select(hex: number | null, fleet: string | null = null, agent: string | null = null): void {
    this.selHex = hex;
    this.selFleet = fleet;
    this.selAgent = agent;
    this.splitSet.clear();
    this.pendingDest = null;
    this.moveMode = false;
    this.view.selectedHex = hex;
    this.view.selectedFleet = fleet;
    this.updateOverlay();
    this.renderTop();
    this.renderSide();
    this.view.invalidate();
    this.runHooks();
  }

  /** Whether taps on the map give the selected fleet or agent a destination (otherwise taps select). */
  private moveMode = false;

  /** Enters or leaves move mode for the selected fleet or agent. */
  toggleMove(on = !this.moveMode): void {
    const canMove = this.myTurn && ((this.selFleet && this.game.fleets[this.selFleet]?.owner === this.viewer && this.game.fleets[this.selFleet].movesLeft > 0)
      || (this.selAgent && this.game.agents[this.selAgent]?.owner === this.viewer && !this.game.agents[this.selAgent].ship && !this.game.agents[this.selAgent].resident));
    this.moveMode = on && !!canMove;
    this.pendingDest = null;
    this.updateOverlay();
    this.renderSide();
    this.view.invalidate();
    this.runHooks();
  }

  /**
   * A tap or left click always selects. Moving takes an explicit order: the Move button (or M) and then a
   * destination, or a right-click on the destination. Either way the first tap shows the route and the battle
   * forecast, and a second tap on the same hex confirms.
   */
  private clickHex(hex: number, ev?: PointerEvent): void {
    const order = this.moveMode || ev?.button === 2;
    const mover = this.selFleet ? this.game.fleets[this.selFleet] : null;
    const agent = this.selAgent ? this.game.agents[this.selAgent] : null;
    if (order && mover && mover.owner === this.viewer && this.myTurn && mover.movesLeft > 0) {
      if (hex === mover.hex) { this.toggleMove(false); return; }
      if (this.pendingDest === hex) {
        const fid = mover.id;
        if (this.act({ type: 'move', fleet: fid, to: hex }, true)) {
          const f = this.game.fleets[fid];
          this.select(f ? f.hex : hex, f ? fid : null);
        }
        return;
      }
      const path = planPath(this.game, mover.id, hex);
      if (!path) { toast('No route there.', 'error'); return; }
      this.pendingDest = hex;
      this.view.overlay.path = [mover.hex, ...path];
      const fc = battleForecast(this.game, this.viewer, hex, [mover.id]);
      this.hint.textContent = fc
        ? `Battle forecast: ${FORECAST_NAMES[fc.label]} (${fc.intel} intelligence). Tap again to attack.`
        : 'Tap the same hex again to confirm the move (Esc cancels)';
      this.view.invalidate();
      return;
    }
    if (order && agent && agent.owner === this.viewer && !agent.ship && this.myTurn && !agent.resident) {
      if (hex === agent.hex) { this.toggleMove(false); return; }
      if (this.pendingDest === hex) {
        const id = agent.id;
        if (this.act({ type: 'moveAgent', agent: id, to: hex }, true)) this.select(this.game.agents[id]?.hex ?? hex, null, id);
        return;
      }
      this.pendingDest = hex;
      this.view.overlay.path = [agent.hex, hex];
      this.hint.textContent = 'Tap the same hex again to send the agent there (Esc cancels)';
      this.view.invalidate();
      return;
    }
    // Select: cycle through own fleets in the hex on repeated taps.
    const mine = this.fleetsAt(hex).filter((f) => f.owner === this.viewer);
    if (this.selHex === hex && mine.length > 0) {
      const idx = mine.findIndex((f) => f.id === this.selFleet);
      this.select(hex, mine[(idx + 1) % mine.length].id);
      return;
    }
    this.select(hex, mine[0]?.id ?? null);
  }

  private updateOverlay(): void {
    this.view.overlay = {};
    this.hint.textContent = '';
    const f = this.selFleet ? this.game.fleets[this.selFleet] : null;
    if (f && f.owner === this.viewer) {
      if (f.movesLeft > 0 && this.myTurn && this.moveMode) this.view.overlay.reachable = reachableThisTurn(this.game, f.id);
      if (f.path.length) this.view.overlay.path = [f.hex, ...f.path];
      if (this.myTurn) {
        this.hint.textContent = f.movesLeft <= 0 ? 'No movement left this turn'
          : this.moveMode ? 'Moving: tap a destination (Esc or tap the fleet to cancel)'
          : 'Press Move (M), or right-click a hex, to send this fleet';
      }
    }
    const a = this.selAgent ? this.game.agents[this.selAgent] : null;
    if (a && a.path.length) this.view.overlay.path = [a.hex, ...a.path];
    if (a && a.owner === this.viewer && this.myTurn && this.moveMode) this.hint.textContent = 'Moving: tap where to send the agent (Esc cancels)';
  }

  private fleetsAt(hex: number): Fleet[] {
    return Object.values(this.game.fleets).filter((f) => f.hex === hex && canSeeFleet(this.game, this.viewer, f));
  }

  private idleFleets(): Fleet[] {
    return Object.values(this.game.fleets).filter((f) => f.owner === this.viewer && f.movesLeft > 0 && f.path.length === 0);
  }

  nextIdle(): void {
    const idle = this.idleFleets();
    if (idle.length === 0) { toast('Every fleet has orders.'); return; }
    const idx = idle.findIndex((f) => f.id === this.selFleet);
    const f = idle[(idx + 1) % idle.length];
    this.view.centerOn(f.hex);
    this.select(f.hex, f.id);
  }

  // -------------------------------------------------------------------------------------------------------
  // Top bar

  private renderTop(): void {
    const g = this.game;
    const f = g.factions[this.viewer];
    const inc = factionIncome(g, this.viewer);
    const r = f.research;
    const pending = Object.values(g.proposals).filter((p) => p.to === this.viewer && !p.answer).length;
    const res = (icon: string, val: number, net?: number, title?: string) =>
      h('span', { class: 'res', title }, icon, h('b', null, num(val)), net !== undefined ? h('span', { class: net >= 0 ? 'good' : 'bad' }, `(${signed(net)})`) : null);
    const researchText = r.current ? `${TECH_BY_ID[r.current].name} ${Math.min(100, Math.floor((r.progress / techCost(r.current)) * 100))}%` : 'choose research';
    const endTurnButton = button('End Turn', () => this.endTurn(), { cls: 'primary', disabled: !this.myTurn });
    endTurnButton.id = 'endturn';
    const waiting = !this.myTurn ? (this.host.waitingText?.(this) ?? `Waiting: ${factionDef(activeFaction(g)).short}`) : '';
    // Two zones: everything else scrolls sideways when space runs out; Menu and End Turn sit in their own
    // fixed zone, so nothing can ever slide underneath them.
    const scroll = h('div', { class: 'top-scroll' });
    const fixed = h('div', { class: 'top-fixed' });
    clear(this.top).append(scroll, fixed);
    scroll.append(...[
      factionChip(this.viewer, true),
      h('span', { class: 'dim' }, `Turn ${g.turn}`),
      res(ICON.energy, f.stock.energy, inc.net.energy, 'Energy (net per turn)'),
      res(ICON.metals, f.stock.metals, inc.net.metals, 'Metals'),
      res(ICON.exotics, f.stock.exotics, inc.net.exotics, 'Exotics'),
      h('span', { class: 'res', title: 'Science per turn' }, ICON.science, h('b', null, `+${num(inc.net.science)}`), h('span', { class: r.current ? 'dim' : 'bad' }, researchText)),
      button('Colonies', () => openColonies(this), { title: 'Every system you run, in one list' }),
      button('Fleets', () => openFleets(this), { title: 'Every fleet, its orders and condition' }),
      button('Agents', () => openAgents(this), { title: 'Diplomats, spies and embassies' }),
      button('Research', () => openResearch(this)),
      button(pending ? `Diplomacy (${pending})` : 'Diplomacy', () => openDiplomacy(this), { cls: pending ? 'primary' : '' }),
      button('Victory', () => openVictory(this)),
      button('Market', () => openMarket(this)),
      button('Report', () => openReport(this)),
      this.host.messaging ? (() => {
        const unread = unreadCount(this.host.messaging, this.game, this.viewer);
        return button(unread ? `Messages (${unread})` : 'Messages', () => this.openMessages(), { cls: unread ? 'primary' : '' });
      })() : null,
      button('Next fleet', () => this.nextIdle(), { title: 'Shortcut: N' }),
    ].filter((x): x is HTMLElement => x !== null));
    fixed.append(...[
      g.winner ? h('b', { class: 'good' }, `${factionDef(g.winner).name} won`) : g.over ? h('b', { class: 'bad' }, 'Game over: no winner') : null,
      waiting ? h('span', { class: 'dim' }, waiting) : null,
      button('Menu', () => this.host.openMenu(this)),
      button('Empire', () => this.openEmpire(), { cls: 'mobile-only' }),
      endTurnButton,
    ].filter((x): x is HTMLElement => x !== null));
  }

  // -------------------------------------------------------------------------------------------------------
  // Side panel

  /** Opens chat, optionally at a conversation with one faction. */
  openMessages(thread?: string): void {
    if (this.host.messaging) openMessages(this, this.host.messaging, thread);
  }

  /** Empire overview in a dialog (used on phones, where the side panel only shows selections). */
  openEmpire(): void {
    modal('Empire', this.empirePanel());
  }

  private renderSide(): void {
    const s = clear(this.side);
    this.side.classList.toggle('empty', this.selHex === null);
    if (this.selHex === null) {
      s.append(this.empirePanel());
      return;
    }
    const g = this.game;
    const hex = this.selHex;
    const hx = g.map.hexes[hex];
    const explored = getBit(g.factions[this.viewer].explored, hex);
    if (!explored) {
      s.append(h('div', { class: 'card' }, h('b', null, 'Unexplored space'), h('div', { class: 'dim' }, 'Send a scout to see what is here.')));
      return;
    }
    const title = hx.system ? hx.system.name : TERRAIN_INFO[hx.terrain].name;
    s.append(h('div', { class: 'row' }, h('b', { style: 'font-size:16px' }, title), h('span', { class: 'grow' }),
      hx.owner ? factionChip(hx.owner, true) : h('span', { class: 'dim' }, 'Unclaimed'),
      button('✕', () => this.select(null), { cls: 'ghost small' })));
    if (hx.terrain !== 'space') s.append(h('div', { class: 'dim' }, `${TERRAIN_INFO[hx.terrain].name}. ${TERRAIN_INFO[hx.terrain].text}`));
    if (hx.pendingClaim) s.append(h('div', null, factionChip(hx.pendingClaim, true), ' will claim this hex at the start of its next turn.'));
    if (hx.system) s.append(this.systemPanel(hex));
    const base = Object.values(g.starbases).find((b) => b.hex === hex);
    if (base) {
      const spec = BALANCE.starbase[base.tier as 1 | 2 | 3]!;
      s.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('b', null, spec.name), h('span', { class: 'grow' }), factionChip(base.owner, true)),
        h('div', { class: 'row' }, 'Hull', bar(base.hull / spec.hull, '#7cfc9a'), `${base.hull}/${spec.hull}`)));
    }
    const fleets = this.fleetsAt(hex);
    const forecast = this.forecastCard(hex);
    if (forecast) s.append(forecast);
    if (fleets.length) s.append(h('h3', null, 'Fleets'));
    for (const f of fleets) s.append(this.fleetCard(f));
    const agents = Object.values(g.agents).filter((a) => a.hex === hex && a.owner === this.viewer && !a.ship && !a.capturedBy);
    if (agents.length) s.append(h('h3', null, 'Agents'));
    for (const a of agents) s.append(this.agentCard(a.id));
  }

  /** The battle forecast for the viewer's forces in a hex where enemies are present. */
  private forecastCard(hex: number): HTMLElement | null {
    const g = this.game;
    const hx = g.map.hexes[hex];
    const present = Object.values(g.fleets).some((f) => f.hex === hex && f.owner === this.viewer)
      || Object.values(g.starbases).some((b) => b.hex === hex && b.owner === this.viewer)
      || (hx.owner === this.viewer && (hx.system?.defense ?? 0) > 0);
    if (!present) return null;
    const fc = battleForecast(g, this.viewer, hex);
    if (!fc) return null;
    const color = { overwhelming: '#7cfc9a', likely: '#b8f28a', even: '#ffd166', unlikely: '#ff9f5a', hopeless: '#ff6b6b' }[fc.label];
    return h('div', { class: 'card' },
      h('div', { class: 'row' }, h('b', null, 'Battle forecast'), h('span', { class: 'grow' }), h('b', { style: `color:${color}` }, FORECAST_NAMES[fc.label])),
      h('div', { class: 'dim', style: 'font-size:12px' }, `Your forces here against what you can see, with ${fc.intel} intelligence.`),
      ...fc.notes.map((n) => h('div', { class: 'dim', style: 'font-size:11px' }, `• ${n}`)));
  }

  private empirePanel(): HTMLElement {
    const g = this.game;
    const f = g.factions[this.viewer];
    const def = factionDef(this.viewer);
    const inc = factionIncome(g, this.viewer);
    const systems = g.map.hexes.map((x, i) => ({ x, i })).filter(({ x }) => x.owner === this.viewer && x.system);
    const idleSystems = systems.filter(({ x }) => x.system!.development > 0 && x.system!.queue.length === 0);
    const wrap = h('div', null,
      h('div', { class: 'row' }, h('b', { style: `font-size:16px;color:${def.color}` }, def.name)),
      h('div', { class: 'dim' }, `${def.government}. ${f.player ? `Led by ${f.player}.` : ''}`),
      h('h3', null, 'Economy'),
      h('div', { class: 'kv' },
        h('span', { class: 'k' }, 'Energy'), h('span', null, `${num(inc.gross.energy)} − ${num(inc.upkeep)} upkeep = ${signed(inc.net.energy)}`),
        h('span', { class: 'k' }, 'Metals'), h('span', null, signed(inc.net.metals)),
        h('span', { class: 'k' }, 'Science'), h('span', null, signed(inc.net.science)),
        h('span', { class: 'k' }, 'Exotics'), h('span', null, signed(inc.net.exotics)),
        h('span', { class: 'k' }, 'Trade routes'), h('span', null, `${routesOf(g, this.viewer).length}/${routeCapacity(g, this.viewer)} run, ${ICON.energy}${signed(routeIncome(g, this.viewer))} per turn`),
        h('span', { class: 'k' }, 'Population'), h('span', null, num(inc.gross.population)),
        h('span', { class: 'k' }, 'Territory'), h('span', null, `${g.map.hexes.filter((x) => x.owner === this.viewer).length} hexes, ${systems.length} systems`)),
      h('h3', null, 'Abilities'),
      ...def.abilities.map((a) => h('div', { class: 'card' }, h('b', null, abilityName(a)), h('div', { class: 'dim' }, abilityText(a)))),
    );
    if (hasAbility(this.viewer, 'fiveYearPlan')) {
      const ready = (f.flags.planReadyAt ?? 0) <= g.turn;
      wrap.append(h('div', { class: 'row wrap' }, 'Five-Year Plan:',
        ...(['energy', 'metals', 'science', 'exotics'] as const).map((r) => button(r, () => this.act({ type: 'fiveYearPlan', resource: r }), { cls: 'small', disabled: !ready || !this.myTurn }))));
    }
    if (hasAbility(this.viewer, 'totalMobilization')) {
      wrap.append(h('div', { class: 'row' }, `Mobilization: ${f.flags.mobilized ? (f.flags.demobilizeAt ? `standing down (turn ${f.flags.demobilizeAt})` : 'ON') : 'off'}`,
        button(f.flags.mobilized ? 'Stand down' : 'Mobilize', () => this.act({ type: 'mobilize', on: !f.flags.mobilized }), { cls: 'small', disabled: !this.myTurn })));
    }
    if (idleSystems.length) {
      wrap.append(h('h3', null, `Idle systems (${idleSystems.length})`));
      for (const { x, i } of idleSystems) wrap.append(button(x.system!.name, () => { this.view.centerOn(i); this.select(i); }, { cls: 'list-btn small' }));
    }
    wrap.append(h('h3', null, 'Tips'), h('div', { class: 'dim' },
      'Tap a hex or fleet to select it. To move, press Move (M, or right-click), then tap the destination twice. Ships that end a turn alone in a hex claim it at the start of your next turn. Press N for the next idle fleet. Colonies, Fleets and Agents (top bar) list everything you run.'));
    return wrap;
  }

  systemPanel(hex: number): HTMLElement {
    const g = this.game;
    const hx = g.map.hexes[hex];
    const sys = hx.system!;
    const mine = hx.owner === this.viewer;
    const p = PLANET_YIELDS[sys.planet], st = STAR_YIELDS[sys.star];
    const card = h('div', { class: 'card' });
    card.append(h('div', { class: 'dim' }, `${st.name}, ${p.name} world, size ${sys.size}${sys.homeOf ? `. Home of the ${factionDef(sys.homeOf).name}` : ''}${sys.ruins ? '. Ancient ruins!' : ''}`));
    const kv = h('div', { class: 'kv' },
      h('span', { class: 'k' }, 'Development'), h('span', null, `${sys.development} – ${DEV_NAMES[sys.development]}`),
      h('span', { class: 'k' }, 'Population'), h('span', null, `${num(sys.population)} / ${num(popCapOf(g, sys, hx.owner))}`),
      h('span', { class: 'k' }, 'Defense'), h('span', null, `${num(sys.defense)} planetary, ${num(sys.garrison)} garrison`),
    );
    if (sys.unrest > 0) kv.append(h('span', { class: 'k' }, 'Unrest'), h('span', { class: 'bad' }, `${num(sys.unrest)}`));
    const blockers = blockadersAt(g, hex);
    if (blockers.length) kv.append(h('span', { class: 'k' }, 'Blockaded'), h('span', { class: 'bad' }, `by ${blockers.map((b) => factionDef(b).short).join(', ')}: output halved, shipyard idle`));
    if (hx.owner && sys.development > 0) {
      const y = systemYield(g, hex);
      kv.append(h('span', { class: 'k' }, 'Yields'), h('span', null, `${ICON.energy}${num(y.energy)} ${ICON.metals}${num(y.metals)} ${ICON.science}${num(y.science)} ${ICON.exotics}${num(y.exotics)}`));
      kv.append(h('span', { class: 'k' }, 'Production'), h('span', null, `${num(productionOf(g, hex))} per turn`));
    } else if (sys.development === 0) {
      kv.append(h('span', { class: 'k' }, 'Potential'), h('span', null, `${ICON.energy}${p.energy + st.energy} ${ICON.metals}${p.metals} ${ICON.science}${p.science + st.science} ${ICON.exotics}${p.exotics + st.exotics} · pop ${p.popCap}`));
    }
    card.append(kv);
    if (sys.improvements.length || sys.development > 0) {
      card.append(h('div', { class: 'dim', style: 'margin-top:4px' }, `Improvements (${sys.improvements.length}/${slotsOf(sys)}): `,
        [...new Set(sys.improvements)].map((i) => { const n = sys.improvements.filter((x) => x === i).length; return `${IMPROVEMENTS[i]?.name ?? i}${n > 1 ? ` ×${n}` : ''}`; }).join(', ') || 'none'));
    }
    if (mine && sys.development > 0) card.append(this.buildPanel(hex));
    return card;
  }

  private buildPanel(hex: number): HTMLElement {
    const g = this.game;
    const sys = g.map.hexes[hex].system!;
    const wrap = h('div');
    wrap.append(h('h3', null, 'Build queue'));
    if (sys.queue.length === 0) wrap.append(h('div', { class: 'dim' }, 'Nothing queued.'));
    sys.queue.forEach((q, i) => {
      const label = q.kind === 'ship' ? design(q.item).name + ` (${CLASSES[design(q.item).cls].name})` : q.kind === 'improvement' ? IMPROVEMENTS[q.item]?.name : q.kind === 'develop' ? 'Develop' : q.kind === 'wonder' ? 'Ascension Gate' : q.kind[0].toUpperCase() + q.kind.slice(1);
      const turns = Math.ceil(q.remaining / Math.max(0.1, productionOf(g, hex)));
      wrap.append(h('div', { class: 'queue-item' }, h('span', { class: 'grow' }, label), h('span', { class: 'dim' }, i === 0 ? `${turns} turns` : `${num(q.remaining)} pts`),
        i === 0 ? button(`Rush ${ICON.energy}${rushCost(g, hex)}`, () => this.act({ type: 'rush', hex }), { cls: 'small', disabled: !this.myTurn }) : null,
        button('✕', () => this.act({ type: 'cancelBuild', hex, index: i }), {
          cls: 'small ghost', disabled: !this.myTurn,
          title: buildStarted(q) ? `Cancel: under way, so half back (${refundText(refundFor(q))})` : `Cancel: not started, so everything back (${refundText(refundFor(q))})`,
        })));
    });
    const tabs = h('div', { class: 'tabs' },
      ...(['ships', 'improvements', 'other'] as const).map((t) => button(t[0].toUpperCase() + t.slice(1), () => { this.buildTab = t; this.rerender(); }, { cls: `small ${this.buildTab === t ? 'on' : ''}` })));
    wrap.append(tabs);
    const opt = (label: string, cost: string, check: { ok: boolean; reason?: string }, action: Action, title?: string) =>
      button(h('span', { class: 'row grow' }, h('span', { class: 'grow' }, label), h('span', { class: 'dim' }, cost)), () => this.act(action),
        { cls: 'list-btn small', disabled: !check.ok || !this.myTurn, title: check.ok ? title : (check as { reason: string }).reason });
    if (this.buildTab === 'ships') {
      const designs = [...DESIGNS_BY_FACTION[this.viewer]].filter((d) => d.cls !== 'fighter').sort((a, b) => CLASSES[a.cls].size - CLASSES[b.cls].size);
      for (const d of designs) {
        const c = checkBuild(g, this.viewer, hex, 'ship', d.id);
        const s = d.stats;
        const title = `${CLASSES[d.cls].name} · ${ROLES[d.role].name}\nHull ${s.hull}, shields ${s.shields}, beams ${s.energy}, missiles ${s.missile}, PD ${s.pd}, hangar ${s.hangar}, cargo ${s.cargo}, speed ${s.speed}, sensors ${s.sensors}\nUpkeep ${d.upkeep}/turn`;
        wrap.append(opt(`${d.name} · ${CLASSES[d.cls].name} ${ROLES[d.role].name}`, costText(c.ok ? c.cost : d.cost), c, { type: 'build', hex, kind: 'ship', item: d.id }, title));
      }
    } else if (this.buildTab === 'improvements') {
      for (const [id, imp] of Object.entries(IMPROVEMENTS)) {
        const c = checkBuild(g, this.viewer, hex, 'improvement', id);
        const copies = sys.improvements.filter((x) => x === id).length + sys.queue.filter((q) => q.kind === 'improvement' && q.item === id).length;
        const repeat = copies && (imp.yields || imp.production) ? ` Another one here yields ${Math.round(Math.pow(REPEAT_FALLOFF, copies) * 100)}% (each repeat on the same world yields 20% less).` : '';
        wrap.append(opt(copies ? `${imp.name} (${copies + 1}${copies === 1 ? 'nd' : copies === 2 ? 'rd' : 'th'})` : imp.name, costText(imp.cost), c, { type: 'build', hex, kind: 'improvement', item: id }, imp.text + repeat));
      }
    } else {
      const items: [string, Parameters<typeof checkBuild>[3], string][] = [
        ['Develop to next level', 'develop', ''], ['Army', 'army', ''], ['Diplomat', 'diplomat', ''], ['Spy', 'spy', ''], ['Ascension Gate', 'wonder', 'ascensionGate'],
      ];
      for (const [label, kind, item] of items) {
        const c = checkBuild(g, this.viewer, hex, kind, item);
        wrap.append(opt(label, c.ok ? costText(c.cost) : '', c, { type: 'build', hex, kind, item }));
      }
    }
    return wrap;
  }

  fleetCard(f: Fleet): HTMLElement {
    const g = this.game;
    const mine = f.owner === this.viewer;
    const sel = f.id === this.selFleet;
    const card = h('div', { class: `card ${sel ? 'sel' : ''}`, onclick: () => { if (!sel) this.select(f.hex, f.id); } });
    card.append(h('div', { class: 'row' }, factionChip(f.owner, true), h('b', null, f.name || 'Fleet'), h('span', { class: 'grow' }),
      mine ? h('span', { class: 'dim' }, `moves ${f.movesLeft}${f.path.length ? ` · ${f.path.length} to go` : ''}`) : h('span', { class: 'dim' }, `${f.ships.length} ships`)));
    if (!mine) {
      const classes = f.ships.map((s) => CLASSES[design(g.ships[s].design).cls].name);
      card.append(h('div', { class: 'dim' }, [...new Set(classes)].join(', ')));
      const r = relation(g, this.viewer, f.owner);
      card.append(h('div', { class: r.status === 'war' ? 'bad' : 'dim' }, `Relation: ${r.status}`));
      return card;
    }
    for (const sid of f.ships) {
      const s = g.ships[sid];
      const d = design(s.design);
      const img = tokenImage(d.id, 56);
      const row = h('div', { class: `ship-row ${this.splitSet.has(sid) ? 'sel' : ''}`, onclick: (e: Event) => {
        if (!sel) return;
        e.stopPropagation();
        if (this.splitSet.has(sid)) this.splitSet.delete(sid); else this.splitSet.add(sid);
        this.rerender();
      } }, img, h('div', { class: 'grow' }, h('div', null, `${d.name} `, h('span', { class: 'dim' }, `${CLASSES[d.cls].name} ${ROLES[d.role].name}`)),
        h('div', { class: 'row' }, bar(s.hull / d.stats.hull, s.hull / d.stats.hull > 0.5 ? '#7cfc9a' : '#ff6b6b'),
          h('span', { class: 'dim', style: 'font-size:11px' }, `${s.hull}/${d.stats.hull}${isCrippled(s.hull, d.stats.hull) ? ' · crippled' : s.hull < d.stats.hull * BALANCE.combat.damagedAt ? ' · damaged' : ''}${s.xp ? ` · ${['', 'regular', 'veteran', 'elite'][s.xp]}` : ''}${d.stats.hangar ? ` · ${s.fighters} fighters` : ''}${s.cargo.length ? ` · ${s.cargo.length} aboard` : ''}`))));
      card.append(row);
    }
    if (!sel || !this.myTurn) return card;
    const hx = g.map.hexes[f.hex];
    const roles = f.ships.map((s) => design(g.ships[s].design).role);
    const acts = h('div', { class: 'row wrap', style: 'margin-top:6px' });
    const A = (label: string, action: Action, title?: string) => acts.append(button(label, () => this.act(action), { cls: 'small', title }));
    if (f.movesLeft > 0) acts.append(button(this.moveMode ? 'Cancel move' : 'Move', () => this.toggleMove(), { cls: `small ${this.moveMode ? 'on' : 'primary'}`, title: 'Then tap a destination. Shortcut: M, or right-click a hex.' }));
    if (f.path.length) A('Stop', { type: 'stop', fleet: f.id });
    if (roles.includes('colony') && hx.system && hx.system.development === 0) A('Colonize', { type: 'colonize', fleet: f.id });
    if (roles.includes('constructor') && hx.system && hx.system.development === 0) A('Found outpost', { type: 'outpost', fleet: f.id }, '30 metals, 10 energy');
    if (roles.includes('constructor') && hx.owner === this.viewer) A('Build starbase', { type: 'starbase', fleet: f.id });
    if (roles.includes('cargo') && hx.system && hx.owner && hx.system.development >= 2) A('Open trade route', { type: 'establishRoute', fleet: f.id }, 'The cargo ship becomes a trade route back to your nearest settled system.');
    const armiesAboard = f.ships.flatMap((s) => g.ships[s].cargo).filter((c) => g.armies[c]);
    if (armiesAboard.length && hx.system && hx.owner !== this.viewer && hx.system.development > 0) A('Invade', { type: 'invade', fleet: f.id }, 'Planetary defense must be 0');
    const garrison = Object.values(g.armies).filter((a) => a.owner === this.viewer && a.hex === f.hex);
    const hold = f.ships.find((s) => cargoFree(g, s) > 0);
    if (garrison.length && hold) A(`Load army (${garrison.length})`, { type: 'loadArmy', army: garrison[0].id, ship: hold });
    if (armiesAboard.length && hx.owner === this.viewer) A('Unload army', { type: 'unloadArmy', army: armiesAboard[0] });
    if (this.splitSet.size > 0 && this.splitSet.size < f.ships.length) {
      acts.append(button(`Split ${this.splitSet.size}`, () => {
        const ships = [...this.splitSet];
        if (this.act({ type: 'split', fleet: f.id, ships })) this.splitSet.clear();
      }, { cls: 'small' }));
    }
    for (const other of this.fleetsAt(f.hex).filter((x) => x.owner === this.viewer && x.id !== f.id)) {
      A(`Merge ${other.name}`, { type: 'merge', into: f.id, from: other.id });
    }
    card.append(acts);
    const rynkai = hasAbility(f.owner, 'wayOfTheBlade');
    const doctrine = h('select', {
      title: DOCTRINES[f.doctrine].text,
      onchange: (e: Event) => this.act({ type: 'doctrine', fleet: f.id, doctrine: (e.target as HTMLSelectElement).value as DoctrineId }),
    }, ...DOCTRINE_IDS.filter((d) => !(rynkai && DOCTRINES[d].withdrawAt === 0)).map((d) => h('option', { value: d, selected: f.doctrine === d }, DOCTRINES[d].name)));
    card.append(h('div', { class: 'row', style: 'margin-top:6px' }, h('span', { class: 'dim' }, 'Battle orders'), doctrine),
      h('div', { class: 'dim', style: 'font-size:11px' }, DOCTRINES[f.doctrine].text, rynkai ? " The Ryn'kai never withdraw, whatever the orders." : ''));
    // Agents aboard
    const agentsAboard = f.ships.flatMap((s) => g.ships[s].cargo).filter((c) => g.agents[c]);
    for (const a of agentsAboard) card.append(h('div', { class: 'row' }, `${g.agents[a].kind} aboard`, button('Disembark', () => this.act({ type: 'disembark', agent: a }), { cls: 'small' })));
    return card;
  }

  /** What an agent of the viewer is doing, in a few words. */
  agentStatus(id: string): string {
    const g = this.game;
    const a = g.agents[id];
    const capitalOf = Object.values(g.factions).find((f) => f.kind === 'major' && f.home === a.hex && f.alive);
    const target = a.target && g.factions[a.target] ? factionDef(a.target).short : '';
    return a.capturedBy ? `Prisoner of the ${factionDef(a.capturedBy).short}`
      : a.resident ? `Ambassador to ${target}`
      : a.ship ? 'Aboard a ship'
      : a.mission ? `${MISSIONS[a.mission as MissionId].name} (${a.progress}/${MISSIONS[a.mission as MissionId].turns})`
      : a.path.length ? `Travelling${a.kind === 'diplomat' && target ? ` to the ${target}` : ''}, ${a.path.length} hexes to go`
      : a.kind === 'spy' && capitalOf?.id === this.viewer ? 'Guarding home against enemy spies'
      : a.kind === 'spy' && capitalOf ? `Watching the ${factionDef(capitalOf.id).short} capital (see Victory)`
      : 'Idle';
  }

  agentCard(id: string): HTMLElement {
    const g = this.game;
    const a = g.agents[id];
    const sel = this.selAgent === id;
    const card = h('div', { class: `card ${sel ? 'sel' : ''}`, onclick: () => { if (!sel) this.select(a.hex, null, id); } });
    const status = this.agentStatus(id);
    card.append(h('div', { class: 'row' }, h('b', null, a.kind === 'diplomat' ? 'Diplomat' : 'Spy'), h('span', { class: 'grow' }), h('span', { class: 'dim' }, status)));
    if (!sel || !this.myTurn) return card;
    const acts = h('div', { class: 'row wrap', style: 'margin-top:6px' });
    if (!a.ship && !a.resident) acts.append(button(this.moveMode ? 'Cancel move' : 'Move', () => this.toggleMove(), { cls: `small ${this.moveMode ? 'on' : 'primary'}`, title: 'Then tap a destination. Shortcut: M, or right-click a hex.' }));
    if (a.kind === 'diplomat' && !a.resident) {
      const targets = Object.keys(g.factions).filter((o) => o !== this.viewer && g.factions[o].alive && relation(g, this.viewer, o).contact);
      if (targets.length) {
        const sel2 = h('select', null, ...targets.map((t) => h('option', { value: t }, factionDef(t).name)));
        acts.append(sel2, button('Send', () => this.act({ type: 'sendDiplomat', agent: id, target: sel2.value }), { cls: 'small' }));
      } else acts.append(h('span', { class: 'dim' }, 'No contacts yet.'));
    }
    if (a.resident) acts.append(button('Recall', () => this.act({ type: 'recall', agent: id }), { cls: 'small' }));
    if (a.kind === 'spy') {
      const here = g.map.hexes[a.hex];
      if (here.owner && here.owner !== this.viewer && here.system) {
        const m = h('select', null, ...Object.entries(MISSIONS).map(([k, v]) => h('option', { value: k, title: v.text }, v.name)));
        acts.append(m, button('Start', () => this.act({ type: 'mission', agent: id, mission: m.value as MissionId }), { cls: 'small' }));
      } else acts.append(h('span', { class: 'dim' }, 'Press Move and tap a foreign system to send the spy there.'));
    }
    const ships = Object.values(g.fleets).filter((f) => f.owner === this.viewer && f.hex === a.hex).flatMap((f) => f.ships).filter((s) => cargoFree(g, s) > 0);
    if (ships.length && !a.resident) acts.append(button('Board ship', () => this.act({ type: 'board', agent: id, ship: ships[0] }), { cls: 'small' }));
    card.append(acts);
    return card;
  }
}

import { ABILITIES, type AbilityId } from '../data/abilities';
function abilityName(a: AbilityId): string { return ABILITIES[a].name; }
function abilityText(a: AbilityId): string { return ABILITIES[a].text; }

function refundText(r: { metals: number; energy: number; exotics: number; population: number }): string {
  const parts: string[] = [];
  if (r.metals) parts.push(`${Math.round(r.metals)} metals`);
  if (r.energy) parts.push(`${Math.round(r.energy)} energy`);
  if (r.exotics) parts.push(`${Math.round(r.exotics)} exotics`);
  if (r.population) parts.push(`${Math.round(r.population * 10) / 10} population`);
  return parts.join(', ') || 'nothing';
}
