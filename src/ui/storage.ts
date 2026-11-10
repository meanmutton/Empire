/** Local saved games in localStorage (compressed). Every access is guarded: storage can be unavailable. */
import { factionDef } from '../data/factions';
import { packState, unpackState } from '../net/codec';
import type { GameState } from '../engine/types';

const INDEX = 'empire.saves';

export interface SaveMeta { id: string; label: string; updated: number; }

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function listSaves(): SaveMeta[] {
  return read<SaveMeta[]>(INDEX, []).sort((a, b) => b.updated - a.updated);
}

export function saveLabel(g: GameState): string {
  const players = g.config.seats.map((s) => `${s.name} (${factionDef(s.faction).short})`).join(', ');
  return `${players} · turn ${g.turn}${g.winner || g.over ? ' · finished' : ''}`;
}

export async function saveGame(id: string, g: GameState): Promise<boolean> {
  const packed = await packState(g);
  if (!write(`empire.save.${id}`, packed)) return false;
  const index = listSaves().filter((s) => s.id !== id);
  index.push({ id, label: saveLabel(g), updated: Date.now() });
  return write(INDEX, index.slice(-12));
}

export async function loadGame(id: string): Promise<GameState | null> {
  try {
    const packed = localStorage.getItem(`empire.save.${id}`);
    return packed ? await unpackState(packed) : null;
  } catch {
    return null;
  }
}

export function deleteSave(id: string): void {
  try {
    localStorage.removeItem(`empire.save.${id}`);
    // Its turn-briefing history (one per player), too.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`empire.brief.${id}.`)) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  write(INDEX, listSaves().filter((s) => s.id !== id));
}

/** Offers the state as a downloadable file. */
export async function downloadSave(g: GameState): Promise<void> {
  const packed = await packState(g);
  const blob = new Blob([JSON.stringify({ empire: 1, state: packed })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `empire-${g.seed}-turn${g.turn}.empire.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function readSaveFile(file: File): Promise<GameState> {
  const data = JSON.parse(await file.text()) as { empire?: number; state?: string };
  if (!data.state) throw new Error('Not an Empire save file.');
  return unpackState(data.state);
}
