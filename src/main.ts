import { aiTurn } from './ai/ai';
import { createGame } from './engine/setup';
import { beginGame, runUntilHuman } from './engine/turn';
import { activeFaction } from './engine/query';
import type { GameState } from './engine/types';
import { button, h, modal, toast } from './ui/dom';
import { showGallery } from './ui/gallery';
import { GameUI } from './ui/game-ui';
import { openReport } from './ui/screens/report';
import { showTitle } from './ui/screens/setup';
import { injectStyles } from './ui/styles';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
injectStyles();

function play(game: GameState): void {
  const ui = new GameUI(app, {
    canAct: () => true,
    afterEndTurn: (u) => {
      runUntilHuman(u.game, aiTurn);
      u.setGame(u.game, activeFaction(u.game), false);
      u.refresh();
      openReport(u, u.game.turn - 1);
      if (!u.game.factions[u.viewer].research.current) toast('Research complete: pick a new project.');
    },
    openMenu: (u) => {
      const m = modal('Menu', h('div', { class: 'row wrap' },
        button('Quit to title', () => { m.close(); title(); }),
        button('Reveal map (debug)', () => { u.view.revealAll = !u.view.revealAll; u.refresh(); m.close(); })));
    },
  });
  ui.setGame(game, activeFaction(game));
  ui.refresh();
  (window as unknown as { empire: unknown }).empire = { game, ui };
}

function title(): void {
  showTitle(app, {
    start: (choice) => {
      const game = createGame(choice);
      beginGame(game, aiTurn);
      play(game);
    },
    saves: () => [],
    load: () => {},
    deleteSave: () => {},
  });
}

if (params.has('gallery')) showGallery(app);
else if (params.has('quick')) {
  const game = createGame({ seed: params.get('seed') ?? 'quick', seats: [{ faction: (params.get('faction') ?? 'concord'), name: 'You' }] });
  beginGame(game, aiTurn);
  play(game);
} else title();
