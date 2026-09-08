import { describe, expect, it } from 'vitest';
import { CURSOR_ART_BOX, CURSOR_DRAWINGS, type CursorDrawingName } from './index';

const names = Object.keys(CURSOR_DRAWINGS) as CursorDrawingName[];

describe('the cursor drawings', () => {
  it('all scale, because they all carry a viewBox', () => {
    // Without one the browser leaves a 32-unit drawing at 32 px in the corner
    // of whatever box it is given, so the cursor stops following its size.
    const flat = names.filter(
      (n) => !CURSOR_DRAWINGS[n].svg.includes(`viewBox="0 0 ${CURSOR_ART_BOX} ${CURSOR_ART_BOX}"`),
    );
    expect(flat).toEqual([]);
  });

  it('name their ids after their own file, so two can share a document', () => {
    // The set arrived with gradients and <use> targets on single letters. The
    // layer only ever shows one drawing, but Settings draws one beside it,
    // and `id="A"` twice on a page is the first one winning both times.
    const clashing: string[] = [];
    for (const name of names) {
      for (const id of CURSOR_DRAWINGS[name].svg.matchAll(/\sid="([^"]+)"/g)) {
        if (!id[1]?.startsWith(`${name}-`)) clashing.push(`${name}: ${id[1]}`);
      }
    }
    expect(clashing).toEqual([]);
  });

  it('resolve every reference they make', () => {
    // A `<use href="#B">` whose target was renamed draws nothing at all, and
    // nothing at all is a cursor that has silently disappeared.
    const dangling: string[] = [];
    for (const name of names) {
      const { svg } = CURSOR_DRAWINGS[name];
      const defined = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
      const used = [
        ...[...svg.matchAll(/(?:xlink:)?href="#([^"]+)"/g)].map((m) => m[1]),
        ...[...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]),
      ];
      for (const ref of used) if (ref && !defined.has(ref)) dangling.push(`${name}: #${ref}`);
    }
    expect(dangling).toEqual([]);
  });

  it('keep every point inside its own box', () => {
    for (const name of names) {
      const { x, y } = CURSOR_DRAWINGS[name].hotspot;
      expect(x, `${name} x`).toBeGreaterThanOrEqual(0);
      expect(y, `${name} y`).toBeGreaterThanOrEqual(0);
      expect(x, `${name} x`).toBeLessThanOrEqual(CURSOR_ART_BOX);
      expect(y, `${name} y`).toBeLessThanOrEqual(CURSOR_ART_BOX);
    }
  });
});
