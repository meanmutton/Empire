/** Game state packing for saves and the relay: JSON → gzip → base64 (≈ 10× smaller). */
import { deserializeState, serializeState } from '../engine/serialize';
import type { GameState } from '../engine/types';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function packText(text: string): Promise<string> {
  return toBase64(await pipe(new TextEncoder().encode(text), new CompressionStream('gzip')));
}

export async function unpackText(b64: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64(b64), new DecompressionStream('gzip')));
}

export async function packState(state: GameState): Promise<string> {
  return packText(serializeState(state));
}

export async function unpackState(b64: string): Promise<GameState> {
  return deserializeState(await unpackText(b64));
}
