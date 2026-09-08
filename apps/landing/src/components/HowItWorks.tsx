import { Section } from './Section';

interface Layer {
  label: string;
  boxes: { name: string; items: string }[];
}

const layers: Layer[] = [
  {
    label: 'hosts',
    boxes: [
      { name: 'apps/desktop', items: 'Tauri 2 window' },
      { name: 'apps/web', items: 'Vite SPA, service worker' },
    ],
  },
  {
    label: 'desktop environment',
    boxes: [
      {
        name: 'packages/shell',
        items: 'boot · setup · lock · desktop · menubar · taskbar · start · windows · cursor',
      },
    ],
  },
  {
    label: 'programs',
    boxes: [
      {
        name: 'packages/apps',
        items: 'files · settings · terminal · office · viewers · utilities',
      },
    ],
  },
  {
    label: 'core',
    boxes: [
      {
        name: 'packages/kernel',
        items:
          'processes · windows · registry · settings · events · notifications · clipboard · users',
      },
    ],
  },
  {
    label: 'I/O',
    boxes: [
      { name: 'packages/vfs', items: 'paths · adapters' },
      { name: 'packages/platform', items: 'web (OPFS / IndexedDB) · tauri (invoke)' },
    ],
  },
  {
    label: 'presentation',
    boxes: [
      { name: 'packages/ui', items: 'atoms → molecules → organisms → templates' },
      { name: 'packages/tokens', items: 'colour · type · space · motion' },
    ],
  },
];

const native: Layer = {
  label: 'native',
  boxes: [{ name: 'crates/lumen-kernel', items: 'Rust: sandboxed fs · sysinfo · config' }],
};

const decisions = [
  {
    title: 'Zustand, not Redux or Context',
    body: 'Window dragging updates the store at 60–120 Hz. Selectors keep re-renders scoped to the window being dragged instead of the whole tree.',
  },
  {
    title: 'Tailwind 4 over CSS tokens',
    body: 'One @theme block in packages/tokens feeds both the utility classes and plain CSS. Colour, radius and motion have a single source of truth, which is what keeps the system visually consistent.',
  },
  {
    title: 'Vite for every app, no SSR',
    body: 'The OS is a client application and this site has nothing to render on a server. One build tool, one config.',
  },
  {
    title: 'A Rust crate separate from the Tauri binary',
    body: 'lumen-kernel compiles and tests on Linux CI without a WebView. The Tauri binary only wires its commands to the crate.',
  },
];

function LayerRow({ layer }: { layer: Layer }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-t border-rule py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_128px]">
      <div className={layer.boxes.length > 1 ? 'grid gap-x-6 gap-y-2 sm:grid-cols-2' : ''}>
        {layer.boxes.map((box) => (
          <div key={box.name}>
            <div className="mono text-sm">{box.name}</div>
            <div className="text-sm text-ink-2">{box.items}</div>
          </div>
        ))}
      </div>
      <div className="mono text-sm text-ink-3 md:text-right">{layer.label}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <Section id="how-it-works" title="How it works">
      <figure className="m-0">
        <div className="rounded-md border border-rule bg-surface px-4">
          {layers.map((layer) => (
            <LayerRow key={layer.label} layer={layer} />
          ))}
        </div>
        <div className="flex items-center gap-3 py-2 pl-6">
          <span className="h-6 w-px bg-rule-strong" aria-hidden="true" />
          <span className="mono text-sm text-ink-3">tauri commands (desktop only)</span>
        </div>
        <div className="rounded-md border border-rule bg-surface px-4">
          <LayerRow layer={native} />
        </div>
        <figcaption className="mt-4 max-w-[64ch] text-sm text-ink-2">
          Layers, top to bottom. Each package imports only from the ones below it; nothing imports
          upward. The kernel has no DOM dependency and is unit-tested on its own.
        </figcaption>
      </figure>

      <h3 className="mt-16 text-lg font-medium">Decisions</h3>
      <dl className="mt-4 grid gap-6 sm:grid-cols-2 sm:gap-x-10 sm:gap-y-8">
        {decisions.map((decision) => (
          <div key={decision.title} className="max-w-[48ch]">
            <dt className="font-medium">{decision.title}</dt>
            <dd className="mt-1 text-ink-2">{decision.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
