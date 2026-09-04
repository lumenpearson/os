import { cx } from '@lumen/ui';
import { useEffect, useState } from 'react';

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener: (type: string, cb: () => void) => void;
  removeEventListener: (type: string, cb: () => void) => void;
}

/** Real battery level when the host exposes it; hidden on desktops without one. */
export function BatteryStatus({ className }: { className?: string }) {
  const [state, setState] = useState<{ level: number; charging: boolean } | null>(null);

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    if (!nav.getBattery) return;
    let battery: BatteryLike | null = null;
    const update = () => battery && setState({ level: battery.level, charging: battery.charging });
    nav
      .getBattery()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
      })
      .catch(() => setState(null));
    return () => {
      battery?.removeEventListener('levelchange', update);
      battery?.removeEventListener('chargingchange', update);
    };
  }, []);

  if (!state) return null;
  const pct = Math.round(state.level * 100);
  return (
    <span
      className={cx(className, 'gap-1.5')}
      aria-label={`Battery ${pct}%${state.charging ? ', charging' : ''}`}
      title={`Battery ${pct}%`}
    >
      <svg viewBox="0 0 28 14" className="h-3.5 w-7" aria-hidden>
        <rect
          x="0.5"
          y="0.5"
          width="24"
          height="13"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.5"
        />
        <rect x="25.5" y="4" width="2" height="6" rx="1" fill="currentColor" fillOpacity="0.5" />
        <rect x="2" y="2" width={21 * state.level} height="10" rx="1.5" fill="currentColor" />
        {state.charging && <path d="M14 2l-3 5h3l-1 5 4-6h-3z" fill="var(--lumen-canvas)" />}
      </svg>
      <span className="mono text-xs tabular-nums">{pct}%</span>
    </span>
  );
}
