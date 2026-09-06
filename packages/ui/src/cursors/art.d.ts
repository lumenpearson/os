/**
 * The cursor drawings are SVG files, imported as markup. Vite serves both
 * hosts and Vitest, so `?raw` needs only this declaration to typecheck.
 */
declare module '*.svg?raw' {
  const svg: string;
  export default svg;
}
