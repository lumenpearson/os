import { type DirEntry, fileCategory } from '@lumen/vfs';
import {
  AppWindow,
  Archive,
  Binary,
  Braces,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
  type LucideIcon,
  Presentation,
  ScrollText,
  Terminal,
} from 'lucide-react';

/** The glyph and tone for a file, shared by Files, Spotlight, the desktop and open/save dialogs. */
export function fileGlyph(entry: Pick<DirEntry, 'kind' | 'path'>): {
  Icon: LucideIcon;
  color: string;
} {
  if (entry.kind === 'directory') return { Icon: Folder, color: 'var(--lumen-accent)' };
  switch (fileCategory(entry.path)) {
    case 'image':
      return { Icon: FileImage, color: '#3c8d4f' };
    case 'audio':
      return { Icon: FileAudio, color: '#6f5bd0' };
    case 'video':
      return { Icon: FileVideo, color: '#c94848' };
    case 'pdf':
      return { Icon: ScrollText, color: '#c94848' };
    case 'spreadsheet':
      return { Icon: FileSpreadsheet, color: '#3c8d4f' };
    case 'presentation':
      return { Icon: Presentation, color: '#c7841a' };
    case 'document':
    case 'markdown':
    case 'text':
      return { Icon: FileText, color: 'var(--lumen-ink-2)' };
    case 'code':
      return { Icon: FileCode, color: '#2f6fd6' };
    case 'data':
      return { Icon: Braces, color: '#1e8c85' };
    case 'script':
      return { Icon: Terminal, color: 'var(--lumen-ink-2)' };
    case 'archive':
      return { Icon: Archive, color: '#c7841a' };
    case 'app':
      return { Icon: AppWindow, color: '#4b4f57' };
    case 'font':
      return { Icon: FileType, color: 'var(--lumen-ink-2)' };
    default:
      return { Icon: Binary, color: 'var(--lumen-ink-3)' };
  }
}

export interface FileTypeIconProps {
  entry: Pick<DirEntry, 'kind' | 'path'>;
  size?: number;
  open?: boolean;
  className?: string;
}

export function FileTypeIcon({ entry, size = 16, open, className }: FileTypeIconProps) {
  const { Icon, color } = fileGlyph(entry);
  const Glyph = entry.kind === 'directory' && open ? FolderOpen : Icon;
  return (
    <Glyph
      aria-hidden
      width={size}
      height={size}
      strokeWidth={size >= 32 ? 1.25 : 1.75}
      className={className}
      style={{ color, flexShrink: 0 }}
      fill={
        entry.kind === 'directory' ? 'color-mix(in srgb, currentColor 22%, transparent)' : 'none'
      }
    />
  );
}
