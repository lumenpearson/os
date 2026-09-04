import { useKernel, useSetting, useSettings } from '@lumen/kernel/react';
import { Button, cx, Slider, useClickOutside, useEscape } from '@lumen/ui';
import {
  Bluetooth,
  Lock,
  Moon,
  MoonStar,
  Plane,
  Sun,
  SunMedium,
  Volume2,
  VolumeX,
  Wifi,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useShellStore } from '../shellStore';

/** Quick toggles and sliders under the menubar. Everything writes to Settings. */
export function ControlCenter() {
  const kernel = useKernel();
  const open = useShellStore((s) => s.controlCenter);
  const toggle = useShellStore((s) => s.toggle);
  const brightness = useShellStore((s) => s.brightness);
  const setBrightness = useShellStore((s) => s.setBrightness);
  const settings = useSettings();
  const [network, setNetwork] = useSetting('network');
  const [sound, setSound] = useSetting('sound');
  const [notifications, setNotifications] = useSetting('notifications');
  const [appearance, setAppearance] = useSetting('appearance');
  const ref = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(refs, () => toggle('controlCenter', false), open);
  useEscape(() => toggle('controlCenter', false), open);

  useEffect(() => {
    if (open)
      requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('button')?.focus());
  }, [open]);

  return (
    <>
      {brightness < 1 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[2150] bg-black"
          style={{ opacity: 1 - brightness }}
        />
      )}
      {open && (
        <div
          ref={ref}
          role="dialog"
          aria-label="Control Center"
          data-testid="control-center"
          className={cx(
            'absolute right-2 top-[calc(var(--lumen-menubar-h)+6px)] z-[1200] flex w-[min(320px,calc(100vw-16px))] flex-col gap-3 rounded-lg border border-rule bg-chrome p-3 text-ink shadow-lg lumen-pop-enter',
            !settings.appearance.reduceTransparency && 'surface-blur',
          )}
          style={{ ['--lumen-pop-origin' as string]: 'top right' }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Toggle
              icon={<Wifi />}
              label="Wi-Fi"
              detail={network.airplane ? 'Airplane mode' : network.wifi ? network.ssid : 'Off'}
              active={network.wifi && !network.airplane}
              disabled={network.airplane}
              onClick={() => setNetwork({ wifi: !network.wifi })}
            />
            <Toggle
              icon={<Bluetooth />}
              label="Bluetooth"
              detail={network.bluetooth && !network.airplane ? 'On' : 'Off'}
              active={network.bluetooth && !network.airplane}
              disabled={network.airplane}
              onClick={() => setNetwork({ bluetooth: !network.bluetooth })}
            />
            <Toggle
              icon={<Plane />}
              label="Airplane"
              detail={network.airplane ? 'On' : 'Off'}
              active={network.airplane}
              onClick={() => setNetwork({ airplane: !network.airplane })}
            />
            <Toggle
              icon={<MoonStar />}
              label="Do Not Disturb"
              detail={notifications.doNotDisturb ? 'On' : 'Off'}
              active={notifications.doNotDisturb}
              onClick={() => setNotifications({ doNotDisturb: !notifications.doNotDisturb })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Toggle
              icon={appearance.theme === 'dark' ? <Moon /> : <Sun />}
              label="Theme"
              detail={
                appearance.theme === 'auto'
                  ? 'Auto'
                  : appearance.theme === 'dark'
                    ? 'Dark'
                    : 'Light'
              }
              active={appearance.theme === 'dark'}
              onClick={() =>
                setAppearance({ theme: appearance.theme === 'dark' ? 'light' : 'dark' })
              }
            />
            <Toggle
              icon={<Lock />}
              label="Lock"
              detail="Now"
              active={false}
              onClick={() => {
                toggle('controlCenter', false);
                kernel.lock();
              }}
            />
          </div>
          <div className="flex flex-col gap-2 rounded-md border border-rule bg-surface/70 p-3">
            <label className="flex items-center gap-2 text-sm text-ink-2" htmlFor="cc-brightness">
              <SunMedium className="size-4" /> Brightness
            </label>
            <Slider
              id="cc-brightness"
              min={30}
              max={100}
              value={Math.round(brightness * 100)}
              onChange={(v) => setBrightness(v / 100)}
              aria-label="Brightness"
            />
            <label className="flex items-center gap-2 pt-1 text-sm text-ink-2" htmlFor="cc-volume">
              <button
                type="button"
                aria-label={sound.muted ? 'Unmute' : 'Mute'}
                onClick={() => setSound({ muted: !sound.muted })}
                className="rounded-xs lumen-focus"
              >
                {sound.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
              Sound
            </label>
            <Slider
              id="cc-volume"
              min={0}
              max={100}
              value={sound.muted ? 0 : Math.round(sound.volume * 100)}
              onChange={(v) => setSound({ volume: v / 100, muted: false })}
              aria-label="Volume"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="self-end"
            onClick={() => {
              toggle('controlCenter', false);
              void kernel.launch('lumen.settings');
            }}
          >
            All settings
          </Button>
        </div>
      )}
    </>
  );
}

function Toggle({
  icon,
  label,
  detail,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-left lumen-focus',
        'transition-colors duration-(--duration-fast)',
        active
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-rule bg-surface/70 text-ink hover:bg-surface',
        disabled && 'opacity-50',
        '[&>svg]:size-4 [&>svg]:shrink-0',
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium">{label}</span>
        <span className={cx('truncate-1 text-xs', active ? 'text-accent-ink/75' : 'text-ink-3')}>
          {detail}
        </span>
      </span>
    </button>
  );
}
