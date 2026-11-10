/** Images imported by the UI are inlined into the single-file build as data URLs. */
declare module '*.webp' {
  const url: string;
  export default url;
}
