/** Playing on this device: one human against the computer, or several humans passing the device (hot seat). */
import { aiTurn } from '../ai/ai';
import { factionDef } from '../data/factions';
import { activeFaction } from '../engine/query';
import { runUntilHuman } from '../engine/turn';
import type { GameState } from '../engine/types';
import { button, clear, h, modal, toast } from './dom';
import { GameUI, type GameHost } from './game-ui';
import { LocalMessaging } from './messaging';
import { openHelp } from './screens/help';
import { openOptions } from './screens/options';
import { openBriefing } from './screens/briefing';
import { downloadSave, saveGame } from './storage';

export class LocalSession {
  private ui: GameUI | null = null;
  private readonly hotseat: boolean;

  constructor(private root: HTMLElement, private game: GameState, private saveId: string, private onQuit: () => void, private debug = false) {
    this.hotseat = game.config.seats.length > 1;
    this.messaging.subscribe(() => void this.save());
    this.startHumanTurn(true);
  }

  private readonly messaging = new LocalMessaging(() => this.game);

  private host(): GameHost {
    return {
      canAct: () => true,
      afterEndTurn: () => this.afterEndTurn(),
      openMenu: (ui) => this.menu(ui),
      messaging: this.messaging,
      gameKey: this.saveId,
    };
  }

  private async save(): Promise<void> {
    if (!(await saveGame(this.saveId, this.game))) toast('Could not save: browser storage is full or disabled.', 'error');
  }

  private afterEndTurn(): void {
    runUntilHuman(this.game, aiTurn);
    void this.save();
    this.startHumanTurn(false);
  }

  /** Shows the next human's turn, behind a hand-over screen in hot seat games. */
  private startHumanTurn(first: boolean): void {
    const g = this.game;
    const who = activeFaction(g);
    const show = () => {
      if (!this.ui) this.ui = new GameUI(this.root, this.host());
      this.ui.setGame(g, who, true);
      this.ui.refresh();
      if (!first || this.hotseat) openBriefing(this.ui, { auto: true });
      if (g.winner) toast(`${factionDef(g.winner).name} won the game!`);
      else if (g.over) toast(`The game is over: ${g.over.reason}.`);
      else if (!g.factions[who].research.current) toast('Pick a research project.');
    };
    if (!this.hotseat || g.winner || g.over) { show(); return; }
    // Hot seat: hide the board until the right player has the device.
    this.ui?.destroy();
    this.ui = null;
    const player = g.factions[who].player;
    const cover = h('div', { class: 'screen', style: 'display:flex;align-items:center;justify-content:center' },
      h('div', { style: 'text-align:center' },
        h('div', { class: 'title', style: `font-size:28px;color:${factionDef(who).color}` }, factionDef(who).name),
        h('div', { class: 'subtitle' }, `Turn ${g.turn}. Pass the device to ${player}.`),
        button(`I'm ${player}: start my turn`, () => { cover.remove(); show(); }, { cls: 'primary' })));
    clear(this.root).append(cover);
  }

  private menu(ui: GameUI): void {
    const m = modal('Menu', h('div', { class: 'row wrap' },
      button('How to play', () => { m.close(); openHelp(); }),
      button('Options', () => { m.close(); openOptions(() => ui.refresh()); }),
      button('Save', async () => { await this.save(); toast('Saved.'); m.close(); }),
      button('Download save file', () => { void downloadSave(this.game); }),
      button('Save and quit', async () => { await this.save(); m.close(); this.ui?.destroy(); this.onQuit(); }),
      this.debug ? button('Reveal map (debug)', () => { ui.view.revealAll = !ui.view.revealAll; ui.refresh(); m.close(); }) : null));
  }
}
