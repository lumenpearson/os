/**
 * The folder view: a squarified treemap of one directory, drawn in SVG.
 *
 * Treemaps are usually unreachable without a mouse. This one is a listbox:
 * the map itself takes focus, the arrows move between tiles by geometry,
 * Enter descends, Backspace goes back up, and the line under the map is a
 * live region, so the tile under the keyboard is always announced and always
 * legible on screen.
 */

import { Breadcrumb, cx, EmptyState, useElementSize } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { FolderTree } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import { collapseSmall, findNode, type SizeNode, trailTo } from './tree';
import { neighbour, type Rect, squarify } from './treemap';
import { formatShare, segmentColor } from './usage';

export interface FoldersProps {
  /** The whole scanned tree. */
  tree: SizeNode;
  /** The directory being shown; must be inside the tree. */
  path: string;
  onPathChange: (path: string) => void;
}

/** Below these a label would be clipped, so the tile carries none. */
const LABEL_MIN_WIDTH = 54;
const LABEL_MIN_HEIGHT = 20;
const SIZE_MIN_HEIGHT = 34;

export function Folders({ tree, path, onPathChange }: FoldersProps) {
  const listId = useId();
  const [box, size] = useElementSize<HTMLDivElement>();
  const [focus, setFocus] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  const node = useMemo(() => findNode(tree, path) ?? tree, [tree, path]);
  const view = useMemo(() => collapseSmall(node), [node]);
  const trail = useMemo(() => trailTo(tree, node.path), [tree, node.path]);
  const children = view.children;

  const rects = useMemo(
    () =>
      squarify(
        children.map((child) => child.size),
        { x: 0, y: 0, width: Math.max(0, size.width), height: Math.max(0, size.height) },
      ),
    [children, size.width, size.height],
  );

  // `node.path` is never read in the body: it is the trigger. Entering a
  // folder puts the keyboard on that folder's largest tile rather than
  // wherever the index happened to point in the folder before it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: node.path is the trigger
  useEffect(() => {
    setFocus(0);
    setHover(null);
  }, [node.path]);

  const active = children[hover ?? focus] ?? null;
  const up = trail.length > 1 ? trail[trail.length - 2] : null;

  const descend = (child: SizeNode | undefined) => {
    if (child && child.kind === 'directory') onPathChange(child.path);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (children.length === 0) return;
        event.preventDefault();
        const direction =
          event.key === 'ArrowLeft'
            ? 'left'
            : event.key === 'ArrowRight'
              ? 'right'
              : event.key === 'ArrowUp'
                ? 'up'
                : 'down';
        setHover(null);
        setFocus((current) => neighbour(rects, current, direction));
        break;
      }
      case 'Home':
        event.preventDefault();
        setFocus(0);
        break;
      case 'End':
        event.preventDefault();
        setFocus(Math.max(0, children.length - 1));
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        descend(children[focus]);
        break;
      case 'Backspace':
        event.preventDefault();
        if (up) onPathChange(up.path);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule px-3 py-1.5">
        <Breadcrumb
          items={trail.map((entry, i) => ({
            label: entry.name,
            onSelect: i === trail.length - 1 ? undefined : () => onPathChange(entry.path),
          }))}
        />
      </div>
      <div ref={box} className="min-h-0 flex-1 p-2">
        {children.length === 0 ? (
          <EmptyState
            icon={<FolderTree />}
            title="No files here"
            description="A folder with no files in it takes no space, so it gets no tile."
          />
        ) : (
          <svg
            width={Math.max(0, size.width)}
            height={Math.max(0, size.height)}
            role="listbox"
            tabIndex={0}
            aria-label={`Folders and files in ${node.name}`}
            aria-activedescendant={`${listId}-${focus}`}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setHover(null)}
            className="lumen-focus rounded-sm"
          >
            {children.map((child, i) => (
              <Tile
                key={child.path}
                id={`${listId}-${i}`}
                node={child}
                parentSize={view.size}
                rect={rects[i] ?? { x: 0, y: 0, width: 0, height: 0 }}
                color={i === 0 ? 'var(--lumen-accent)' : segmentColor(i - 1, children.length - 1)}
                focused={i === focus}
                hovered={i === hover}
                onHover={() => setHover(i)}
                onSelect={() => {
                  setFocus(i);
                  setHover(null);
                  descend(child);
                }}
              />
            ))}
          </svg>
        )}
      </div>
      <p
        aria-live="polite"
        className="mono flex shrink-0 items-baseline gap-3 border-t border-rule px-3 py-1.5 text-sm tabular-nums text-ink-2"
      >
        <span className="min-w-0 flex-1 truncate-1 text-ink">
          {active ? active.name : node.path}
        </span>
        <span className="shrink-0">{formatBytes(active ? active.size : node.size)}</span>
        <span className="shrink-0 text-ink-3">
          {view.size > 0 && active ? formatShare(active.size / view.size) : ''}
        </span>
      </p>
    </div>
  );
}

interface TileProps {
  id: string;
  node: SizeNode;
  parentSize: number;
  rect: Rect;
  color: string;
  focused: boolean;
  hovered: boolean;
  onHover: () => void;
  onSelect: () => void;
}

function Tile({
  id,
  node,
  parentSize,
  rect,
  color,
  focused,
  hovered,
  onHover,
  onSelect,
}: TileProps) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const share = parentSize > 0 ? formatShare(node.size / parentSize) : '';
  const label = tileLabel(node, share);
  const showLabel = rect.width >= LABEL_MIN_WIDTH && rect.height >= LABEL_MIN_HEIGHT;
  const showSize = showLabel && rect.height >= SIZE_MIN_HEIGHT;
  return (
    <g
      id={id}
      role="option"
      aria-selected={focused}
      aria-label={label}
      data-tile={node.path}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cx(node.kind === 'directory' && 'cursor-pointer')}
    >
      <title>{label}</title>
      <rect
        x={rect.x + 0.5}
        y={rect.y + 0.5}
        width={Math.max(0, rect.width - 1)}
        height={Math.max(0, rect.height - 1)}
        rx={2}
        fill={color}
        stroke={
          focused ? 'var(--lumen-accent)' : hovered ? 'var(--lumen-ink)' : 'var(--lumen-rule)'
        }
        strokeWidth={focused ? 2 : 1}
      />
      {showLabel && (
        <text
          x={rect.x + 6}
          y={rect.y + 14}
          className="fill-ink text-2xs"
          style={{ pointerEvents: 'none' }}
        >
          {clip(node.name, rect.width)}
        </text>
      )}
      {showSize && (
        <text
          x={rect.x + 6}
          y={rect.y + 27}
          className="mono fill-ink-2 text-2xs"
          style={{ pointerEvents: 'none' }}
        >
          {formatBytes(node.size)}
        </text>
      )}
    </g>
  );
}

/** What a screen reader reads for a tile, and what its tooltip says. */
function tileLabel(node: SizeNode, share: string): string {
  const kind =
    node.kind === 'directory'
      ? `folder, ${node.files} ${node.files === 1 ? 'file' : 'files'}`
      : node.kind === 'bucket'
        ? 'grouped remainder'
        : 'file';
  return [node.name, kind, formatBytes(node.size), share && `${share} of this folder`]
    .filter(Boolean)
    .join(', ');
}

/** SVG text does not wrap or ellipsize; cut it to what the tile can hold. */
function clip(text: string, width: number): string {
  const characters = Math.max(0, Math.floor((width - 12) / 5.6));
  if (text.length <= characters) return text;
  return characters <= 1 ? '' : `${text.slice(0, characters - 1)}…`;
}
