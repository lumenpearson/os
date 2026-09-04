import type { ReactNode } from 'react';
import { cx } from '../cx';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Secondary text on the right (a count, a shortcut). */
  meta?: ReactNode;
  onSelect?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Drop target hooks for Files favourites. */
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export interface SidebarSection {
  id: string;
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps {
  sections: SidebarSection[];
  activeId?: string | null;
  width?: number;
  className?: string;
  header?: ReactNode;
  footer?: ReactNode;
}

/** A navigation sidebar: grouped rows with a small mono section title. */
export function Sidebar({
  sections,
  activeId,
  width = 200,
  className,
  header,
  footer,
}: SidebarProps) {
  return (
    <nav
      aria-label="Sidebar"
      className={cx('flex h-full shrink-0 flex-col border-r border-rule bg-canvas', className)}
      style={{ width }}
    >
      {header}
      <div className="lumen-scroll flex-1 px-2 py-2">
        {sections.map((section) => (
          <div key={section.id} className="mb-3 last:mb-0">
            {section.title && (
              <div className="mono px-2 pb-1 pt-1 text-2xs uppercase tracking-[0.08em] text-ink-3">
                {section.title}
              </div>
            )}
            <ul className="flex flex-col gap-px">
              {section.items.map((item) => {
                const active = item.id === activeId;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={item.onSelect}
                      onContextMenu={item.onContextMenu}
                      onDragOver={item.onDragOver}
                      onDrop={item.onDrop}
                      className={cx(
                        'flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-base lumen-focus select-none',
                        'transition-colors duration-(--duration-fast)',
                        active ? 'bg-selection text-ink' : 'text-ink hover:bg-surface-2',
                      )}
                    >
                      {item.icon && (
                        <span
                          className={cx(
                            'shrink-0 [&>svg]:size-4',
                            active ? 'text-accent' : 'text-ink-2',
                          )}
                        >
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate-1 flex-1">{item.label}</span>
                      {item.meta && (
                        <span className="mono shrink-0 text-xs text-ink-3">{item.meta}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {footer}
    </nav>
  );
}
