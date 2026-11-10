/**
 * The lore, read from docs/LORE.md at build time so the faction guide always matches the document. The file's
 * layout is the contract: `## ` parts, `### ` sections, paragraphs, `- ` bullets (nested by two spaces), and
 * minor factions as paragraphs starting with their bold name.
 */
import loreText from '../../docs/LORE.md?raw';
import { FACTIONS } from '../data/factions';

export interface LoreItem {
  text: string;
  children: LoreItem[];
}

export type LoreBlock = { kind: 'p'; text: string } | { kind: 'ul'; items: LoreItem[] };

export interface LoreSection {
  title: string;
  blocks: LoreBlock[];
}

export interface MajorLore {
  /** The italic line under the heading ("Home: Sol. Humans. ..."). */
  tagline: string;
  /** The story, as paragraphs. */
  paragraphs: string[];
  appearance: string;
  /** How they see each rival: [who, view]. */
  views: [string, string][];
  /** Leader bios by leader name, as written (they open with the bold name). */
  leaders: Record<string, string>;
}

export interface Lore {
  /** "The Meridian Reach": the opening, then its sections. */
  reach: LoreSection[];
  majors: Record<string, MajorLore>;
  minors: Record<string, string>;
}

/** Splits text into blocks: paragraphs (wrapped lines joined) and bullet lists. */
function blocks(lines: string[]): LoreBlock[] {
  const out: LoreBlock[] = [];
  let para: string[] = [];
  let list: { items: LoreItem[]; stack: { indent: number; item: LoreItem }[] } | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    para = [];
    if (list) out.push({ kind: 'ul', items: list.items });
    list = null;
  };
  for (const raw of lines) {
    if (!raw.trim()) { flush(); continue; }
    const m = /^(\s*)- (.*)$/.exec(raw);
    if (m) {
      if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; }
      list ??= { items: [], stack: [] };
      const indent = m[1].length;
      const item: LoreItem = { text: m[2], children: [] };
      while (list.stack.length && list.stack[list.stack.length - 1].indent >= indent) list.stack.pop();
      (list.stack.length ? list.stack[list.stack.length - 1].item.children : list.items).push(item);
      list.stack.push({ indent, item });
    } else if (list) {
      const top = list.stack[list.stack.length - 1];
      top.item.text += ` ${raw.trim()}`;
    } else {
      para.push(raw.trim());
    }
  }
  flush();
  return out;
}

/** The document cut into `##` parts, each cut into `###` sections (the part's own opening is section ''). */
function parts(text: string): Map<string, Map<string, string[]>> {
  const result = new Map<string, Map<string, string[]>>();
  let part: Map<string, string[]> | null = null;
  let section: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      part = new Map([['', (section = [])]]);
      result.set(line.slice(3).trim(), part);
    } else if (line.startsWith('### ') && part) {
      part.set(line.slice(4).trim(), (section = []));
    } else if (part) {
      section.push(line);
    }
  }
  return result;
}

/** "**Name** rest" → [name, rest]. */
function boldLead(text: string): [string, string] {
  const m = /^\*\*(.+?)\*\*:?\s*(.*)$/.exec(text);
  return m ? [m[1].replace(/:$/, ''), m[2]] : ['', text];
}

export function parseLore(text: string): Lore {
  const doc = parts(text);
  const reach: LoreSection[] = [...(doc.get('The Meridian Reach') ?? new Map())].map(([title, lines]) => ({ title, blocks: blocks(lines) }));
  const majors: Record<string, MajorLore> = {};
  for (const [title, lines] of doc.get('The great powers') ?? []) {
    const def = FACTIONS.find((f) => f.kind === 'major' && f.name === title);
    if (!def) continue;
    const lore: MajorLore = { tagline: '', paragraphs: [], appearance: '', views: [], leaders: {} };
    for (const b of blocks(lines)) {
      if (b.kind === 'p') {
        const tag = /^\*([^*].*)\*$/.exec(b.text);
        if (tag && !lore.tagline) lore.tagline = tag[1];
        else lore.paragraphs.push(b.text);
        continue;
      }
      for (const item of b.items) {
        const [key, rest] = boldLead(item.text);
        if (key === 'Appearance') lore.appearance = rest;
        else if (key === 'Views') lore.views = item.children.map((c) => boldLead(c.text));
        // Keyed by name ("Kaeth Ryn'sora, the Unbroken" → "Kaeth Ryn'sora"); the bio keeps its bold opening.
        else if (key === 'Leaders') for (const c of item.children) { const [name] = boldLead(c.text); if (name) lore.leaders[name.split(',')[0]] = c.text; }
      }
    }
    majors[def.id] = lore;
  }
  const minors: Record<string, string> = {};
  for (const [, lines] of doc.get('Minor factions') ?? []) {
    for (const b of blocks(lines)) {
      if (b.kind !== 'p') continue;
      const m = /^\*\*(.+?)\.\*\*\s*(.*)$/.exec(b.text);
      const def = m && FACTIONS.find((f) => f.kind === 'minor' && f.name === m[1]);
      if (def) minors[def.id] = m![2];
    }
  }
  return { reach, majors, minors };
}

let cached: Lore | null = null;

/** The game's lore (parsed once). */
export function lore(): Lore {
  return (cached ??= parseLore(loreText));
}
