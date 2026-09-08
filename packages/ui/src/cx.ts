export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

/** Join class names; objects add keys whose value is truthy. Dependency-free. */
export function cx(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
    else if (Array.isArray(v)) {
      const inner = cx(...v);
      if (inner) out.push(inner);
    } else for (const [k, on] of Object.entries(v)) if (on) out.push(k);
  }
  return out.join(' ');
}
