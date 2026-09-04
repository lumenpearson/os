export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parses the colour strings getComputedStyle returns: `rgb(r, g, b)`,
 * `rgba(r, g, b, a)`, and the modern `rgb(r g b / a)` form. Channels are 0–1.
 */
export function parseRgb(input: string): Rgba | null {
  const match = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(
    input,
  );
  if (!match) return null;
  const channel = (value: string | undefined) => Math.min(1, Number(value ?? 0) / 255);
  const alphaText = match[4];
  const a =
    alphaText === undefined
      ? 1
      : alphaText.endsWith('%')
        ? Number(alphaText.slice(0, -1)) / 100
        : Number(alphaText);
  return { r: channel(match[1]), g: channel(match[2]), b: channel(match[3]), a };
}

/** Composites `top` over `under` (both opaque apart from `top.a`) and returns an opaque colour. */
export function over(top: Rgba, under: Rgba): Rgba {
  const mix = (t: number, u: number) => t * top.a + u * (1 - top.a);
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

/** Resolves a CSS custom property to a colour by letting the browser compute it. */
export function readCssColor(name: string, fallback: Rgba): Rgba {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const parsed = parseRgb(getComputedStyle(probe).color);
  probe.remove();
  return parsed ?? fallback;
}
