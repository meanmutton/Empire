/**
 * Interface sounds, synthesised with Web Audio (no sound files, so the single-file build stays small). Short
 * and soft: a tick on every button, and distinct cues for selecting, moving, building, research, diplomacy,
 * war, battles and the end of a turn. On by default; Options turns them off or sets the volume (per browser).
 */
export type Sfx =
  | 'click' | 'select' | 'move' | 'confirm' | 'endTurn' | 'open' | 'close' | 'error'
  | 'build' | 'research' | 'war' | 'peace' | 'battle' | 'message' | 'colonize';

const ON = 'empire.sound';
const VOL = 'empire.volume';

function get(k: string): string | null {
  try { return localStorage.getItem(k); } catch { return null; }
}
function set(k: string, v: string): void {
  try { localStorage.setItem(k, v); } catch { /* private mode */ }
}

export function soundOn(): boolean { return get(ON) !== 'off'; }
export function setSoundOn(on: boolean): void { set(ON, on ? 'on' : 'off'); }
/** 0..1, default 0.6. */
export function soundVolume(): number { const v = Number(get(VOL)); return get(VOL) === null || !Number.isFinite(v) ? 0.6 : Math.max(0, Math.min(1, v)); }
export function setSoundVolume(v: number): void { set(VOL, String(Math.max(0, Math.min(1, v)))); }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let lastPlayed = new Map<Sfx, number>();

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

/** A tone: frequency (or a glide from→to), wave, start delay, length and peak volume. */
function tone(a: AudioContext, out: AudioNode, f: number | [number, number], type: OscillatorType, at: number, len: number, peak: number): void {
  const o = a.createOscillator(), g = a.createGain();
  const t = a.currentTime + at;
  o.type = type;
  if (Array.isArray(f)) { o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + len); }
  else o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.012, len / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.02);
}

/** Filtered noise: whooshes and thuds. */
function noise(a: AudioContext, out: AudioNode, at: number, len: number, peak: number, freq: [number, number], q = 1): void {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  const t = a.currentTime + at;
  src.buffer = buf;
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(freq[0], t);
  f.frequency.exponentialRampToValueAtTime(freq[1], t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + len * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out);
  src.start(t);
}

const SOUNDS: Record<Sfx, (a: AudioContext, o: AudioNode) => void> = {
  click: (a, o) => tone(a, o, [1500, 1100], 'sine', 0, 0.035, 0.06),
  select: (a, o) => { tone(a, o, 660, 'triangle', 0, 0.06, 0.12); tone(a, o, 990, 'triangle', 0.045, 0.08, 0.1); },
  move: (a, o) => { noise(a, o, 0, 0.32, 0.18, [300, 2200], 0.8); tone(a, o, [220, 330], 'sine', 0, 0.25, 0.08); },
  confirm: (a, o) => { tone(a, o, 523, 'triangle', 0, 0.09, 0.12); tone(a, o, 659, 'triangle', 0.06, 0.09, 0.12); tone(a, o, 784, 'triangle', 0.12, 0.16, 0.12); },
  endTurn: (a, o) => { tone(a, o, 220, 'sine', 0, 0.9, 0.18); tone(a, o, 330, 'sine', 0.05, 0.8, 0.12); tone(a, o, 440, 'triangle', 0.1, 0.7, 0.06); },
  open: (a, o) => tone(a, o, [440, 660], 'sine', 0, 0.09, 0.08),
  close: (a, o) => tone(a, o, [660, 420], 'sine', 0, 0.08, 0.07),
  error: (a, o) => { tone(a, o, 160, 'square', 0, 0.08, 0.06); tone(a, o, 140, 'square', 0.1, 0.1, 0.06); },
  build: (a, o) => { tone(a, o, 880, 'square', 0, 0.05, 0.05); tone(a, o, 1320, 'triangle', 0.05, 0.12, 0.08); noise(a, o, 0, 0.06, 0.05, [3000, 2000], 2); },
  research: (a, o) => [1046, 1318, 1568, 2093].forEach((f, i) => tone(a, o, f, 'sine', i * 0.06, 0.22, 0.07)),
  war: (a, o) => { tone(a, o, 110, 'sawtooth', 0, 0.75, 0.09); tone(a, o, 165, 'sawtooth', 0.02, 0.7, 0.06); noise(a, o, 0, 0.5, 0.12, [120, 60], 1.5); },
  peace: (a, o) => [523, 659, 784, 1046].forEach((f, i) => tone(a, o, f, 'sine', i * 0.09, 0.5, 0.08)),
  battle: (a, o) => { noise(a, o, 0, 0.45, 0.3, [180, 60], 1.2); tone(a, o, [90, 45], 'sine', 0, 0.4, 0.2); noise(a, o, 0.18, 0.3, 0.15, [900, 300], 1); },
  message: (a, o) => { tone(a, o, 988, 'sine', 0, 0.18, 0.1); tone(a, o, 1319, 'sine', 0.12, 0.3, 0.1); },
  colonize: (a, o) => { tone(a, o, [330, 660], 'triangle', 0, 0.3, 0.1); tone(a, o, 990, 'sine', 0.2, 0.4, 0.08); },
};

/** Plays a sound (if sound is on). The same cue within 60 ms is played once. */
export function sfx(name: Sfx): void {
  if (!soundOn() || typeof window === 'undefined') return;
  const a = audio();
  if (!a || !master) return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? 0) < 60) return;
  lastPlayed.set(name, now);
  if (a.state === 'suspended') void a.resume();
  master.gain.value = soundVolume();
  try { SOUNDS[name](a, master); } catch { /* audio unavailable */ }
}

/** A soft tick on every button press, wired once for the whole page. */
export function installClickSounds(): void {
  if (typeof document === 'undefined' || (document as unknown as { _empireSfx?: boolean })._empireSfx) return;
  (document as unknown as { _empireSfx?: boolean })._empireSfx = true;
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('button, .btn, a[href], select, input[type=checkbox], .brief-line.link');
    if (el && !(el as HTMLButtonElement).disabled) sfx('click');
  }, true);
}

export function resetSoundsForTests(): void { lastPlayed = new Map(); }
