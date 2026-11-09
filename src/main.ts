import { aiTurn } from './ai/ai';
import { createGame } from './engine/setup';
import { beginGame } from './engine/turn';
import { showGallery } from './ui/gallery';
import { MapView, Minimap } from './ui/mapview';

// Phase 12 preview: a generated galaxy with the map renderer. Phase 13 replaces this with the full client.
const app = document.getElementById('app')!;
app.innerHTML = `<canvas id="map" style="position:absolute;inset:0;width:100%;height:100%;touch-action:none"></canvas>
<canvas id="mini" style="position:absolute;right:12px;bottom:12px;width:220px;height:132px;border:1px solid #334;border-radius:6px"></canvas>`;
const params = new URLSearchParams(location.search);
if (params.has('gallery')) {
  const style = document.createElement('style');
  style.textContent = '.roster{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.roster-cell{width:64px;text-align:center}.roster-label{font-size:10px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}';
  document.head.appendChild(style);
  showGallery(app);
  throw new Error('gallery');
}
const seed = params.get('seed') ?? 'preview';
const game = createGame({ seed, seats: [{ faction: 'concord', name: 'You' }] });
beginGame(game, aiTurn);
const view = new MapView(document.getElementById('map') as HTMLCanvasElement);
view.revealAll = params.has('reveal');
view.resize();
view.setState(game, 'concord');
view.zoom = Number(params.get('zoom') ?? 1);
view.centerOn(game.factions.concord.home);
const mini = new Minimap(document.getElementById('mini') as HTMLCanvasElement, view);
view.onCamera = () => mini.draw();
mini.draw();
window.addEventListener('resize', () => { view.resize(); mini.draw(); });
(window as unknown as { empire: unknown }).empire = { game, view };
