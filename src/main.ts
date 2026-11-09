import { aiTurn } from './ai/ai';
import { createGame } from './engine/setup';
import { beginGame } from './engine/turn';
import type { GameState } from './engine/types';
import { toast } from './ui/dom';
import { showGallery } from './ui/gallery';
import { showTitle } from './ui/screens/setup';
import { LocalSession } from './ui/session-local';
import { deleteSave, listSaves, loadGame } from './ui/storage';
import { injectStyles } from './ui/styles';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
injectStyles();

function playLocal(game: GameState, saveId: string): void {
  const session = new LocalSession(app, game, saveId, title, debug);
  (window as unknown as { empire: unknown }).empire = { game, session };
}

function newSaveId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function title(): void {
  showTitle(app, {
    start: (choice) => {
      const game = createGame(choice);
      beginGame(game, aiTurn);
      playLocal(game, newSaveId());
    },
    saves: () => listSaves().map((s) => ({ id: s.id, label: s.label })),
    load: async (id) => {
      const g = await loadGame(id);
      if (g) playLocal(g, id);
      else toast('That save could not be read.', 'error');
    },
    deleteSave,
  });
}

if (params.has('gallery')) showGallery(app);
else if (params.has('quick')) {
  const seats = (params.get('players') ?? 'concord').split(',').map((f, i) => ({ faction: f, name: `Player ${i + 1}` }));
  const game = createGame({ seed: params.get('seed') ?? 'quick', seats });
  beginGame(game, aiTurn);
  playLocal(game, newSaveId());
} else title();
