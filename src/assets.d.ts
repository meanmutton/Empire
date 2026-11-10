/** Images imported by the UI are inlined into the single-file build as data URLs. */
declare module '*.webp' {
  const url: string;
  export default url;
}

/** Vite's import.meta.glob, as used for the portrait set. */
interface ImportMeta {
  glob<T = unknown>(pattern: string, options: { eager: true; import: 'default' }): Record<string, T>;
}

/** Text files imported whole (docs/LORE.md for the faction guide). */
declare module '*?raw' {
  const text: string;
  export default text;
}
