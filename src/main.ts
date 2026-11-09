import { aiTurn } from './ai/ai';
import { createGame } from './engine/setup';
import { beginGame } from './engine/turn';
import type { GameState } from './engine/types';
import { relayUrl } from './net/relay-client';
import { toast } from './ui/dom';
import { showGallery } from './ui/gallery';
import { showTitle } from './ui/screens/setup';
import { LocalSession } from './ui/session-local';
import { onlineGames, OnlineSession } from './ui/session-online';
import { deleteSave, listSaves, loadGame } from './ui/storage';
import { injectStyles } from './ui/styles';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const debug = params.has('debug');
const relay = relayUrl();
injectStyles();

function playLocal(game: GameState, saveId: string): void {
  const session = new LocalSession(app, game, saveId, title, debug);
  (window as unknown as { empire: unknown }).empire = { game, session };
}

function newSaveId(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function askNotifications(): void {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  } catch { /* optional */ }
}

function online<T>(p: Promise<T>): void {
  p.then((s) => { (window as unknown as { empire: unknown }).empire = { session: s }; })
    .catch((e: Error) => { toast(e.message, 'error'); title(); });
}

function title(): void {
  showTitle(app, {
    start: (choice) => {
      if (choice.online && relay) {
        askNotifications();
        const host = choice.seats[0];
        online(OnlineSession.host(app, relay, host.name, host.faction, {
          seed: choice.seed, width: choice.width!, height: choice.height!, turnLimit: choice.turnLimit ?? null,
          victory: { conquest: true, domination: true, ascendance: true, alliance: true, ...choice.victory }, timeoutHours: choice.timeoutHours,
        }, title));
        return;
      }
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
    ...(relay ? {
      join: (code: string, name: string) => { askNotifications(); online(OnlineSession.join(app, relay, code, name, title)); },
      onlineGames: () => onlineGames().map((g) => ({ code: g.code, label: g.label })),
      resumeOnline: (code: string) => online(OnlineSession.join(app, relay, code, '', title)),
    } : {}),
  });
}

if (params.has('gallery')) showGallery(app);
else if (params.has('quick')) {
  const seats = (params.get('players') ?? 'concord').split(',').map((f, i) => ({ faction: f, name: `Player ${i + 1}` }));
  const game = createGame({ seed: params.get('seed') ?? 'quick', seats });
  beginGame(game, aiTurn);
  playLocal(game, newSaveId());
} else title();
