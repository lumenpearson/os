import type { AppIconProps } from '@lumen/kernel';
import type { LucideIcon } from 'lucide-react';
import type { ComponentType } from 'react';

/**
 * App icon tones: eight solid colours chosen to sit together on one dock in
 * both themes. Not derived from the glyph, not a tint of the glyph.
 */
export const ICON_TONES = {
  graphite: '#4b4f57',
  blue: '#2f6fd6',
  teal: '#1e8c85',
  green: '#3c8d4f',
  amber: '#c7841a',
  red: '#c94848',
  violet: '#6f5bd0',
  ink: '#1f2126',
} as const;

export type IconTone = keyof typeof ICON_TONES;

export interface AppIconOptions {
  glyph: LucideIcon;
  tone: IconTone;
  /** Glyph scale relative to the tile (default 0.56). */
  scale?: number;
  strokeWidth?: number;
}

/** A macOS-style rounded tile with a white line glyph. The same component serves 16px to 128px. */
export function createAppIcon({
  glyph: Glyph,
  tone,
  scale = 0.56,
  strokeWidth = 1.75,
}: AppIconOptions): ComponentType<AppIconProps> {
  const background = ICON_TONES[tone];
  return function AppIcon({ size, className }: AppIconProps) {
    const glyphSize = Math.round(size * scale);
    return (
      <span
        aria-hidden
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: Math.max(3, Math.round(size * 0.22)),
          background,
          boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 1px 1px rgb(0 0 0 / 0.18)',
          color: '#fff',
          flexShrink: 0,
        }}
      >
        <Glyph
          width={glyphSize}
          height={glyphSize}
          // At size 16 the glyph box is 9 px, where 1.75 in the 24-unit
          // viewBox comes out at 0.66 CSS px and greys out; the bump holds a
          // hairline. It also eats what little interior there is, which is why
          // app glyphs have to differ in outline — see icon.test.tsx.
          strokeWidth={size < 24 ? strokeWidth + 0.5 : strokeWidth}
          absoluteStrokeWidth={false}
        />
      </span>
    );
  };
}

/** A tile for user-installed pseudo-programs: initial letter on graphite, or a data-URL image. */
export function ManifestIcon({
  size,
  name,
  icon,
  className,
}: AppIconProps & { name: string; icon?: string }) {
  if (icon?.startsWith('data:')) {
    return (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        className={className}
        style={{ borderRadius: Math.round(size * 0.22), flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.max(3, Math.round(size * 0.22)),
        background: ICON_TONES.graphite,
        boxShadow: 'inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 1px 1px rgb(0 0 0 / 0.18)',
        color: '#fff',
        // The fallback tile prints one initial. A letterform standing in for an
        // icon is exactly the accent case design rule 1 sets in JetBrains Mono.
        // deslop-ignore-next-line 34
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        fontSize: Math.round(size * 0.46),
        flexShrink: 0,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
