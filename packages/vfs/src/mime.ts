import { extname } from './path';

export type FileCategory =
  | 'text'
  | 'code'
  | 'markdown'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'image'
  | 'audio'
  | 'video'
  | 'pdf'
  | 'archive'
  | 'app'
  | 'script'
  | 'data'
  | 'font'
  | 'binary';

export interface TypeInfo {
  mime: string;
  category: FileCategory;
  label: string;
}

const OOXML = 'application/vnd.openxmlformats-officedocument';

const TYPES: Record<string, TypeInfo> = {
  '.txt': { mime: 'text/plain', category: 'text', label: 'Plain Text' },
  '.log': { mime: 'text/plain', category: 'text', label: 'Log' },
  '.md': { mime: 'text/markdown', category: 'markdown', label: 'Markdown' },
  '.markdown': { mime: 'text/markdown', category: 'markdown', label: 'Markdown' },
  '.json': { mime: 'application/json', category: 'data', label: 'JSON' },
  '.csv': { mime: 'text/csv', category: 'spreadsheet', label: 'CSV' },
  '.tsv': { mime: 'text/tab-separated-values', category: 'spreadsheet', label: 'TSV' },
  '.xml': { mime: 'application/xml', category: 'data', label: 'XML' },
  '.yaml': { mime: 'application/yaml', category: 'data', label: 'YAML' },
  '.yml': { mime: 'application/yaml', category: 'data', label: 'YAML' },
  '.toml': { mime: 'application/toml', category: 'data', label: 'TOML' },
  '.ini': { mime: 'text/plain', category: 'data', label: 'Config' },
  '.js': { mime: 'text/javascript', category: 'code', label: 'JavaScript' },
  '.mjs': { mime: 'text/javascript', category: 'code', label: 'JavaScript' },
  '.ts': { mime: 'text/typescript', category: 'code', label: 'TypeScript' },
  '.tsx': { mime: 'text/typescript', category: 'code', label: 'TypeScript React' },
  '.jsx': { mime: 'text/javascript', category: 'code', label: 'JavaScript React' },
  '.css': { mime: 'text/css', category: 'code', label: 'Stylesheet' },
  '.html': { mime: 'text/html', category: 'code', label: 'HTML' },
  '.htm': { mime: 'text/html', category: 'code', label: 'HTML' },
  '.rs': { mime: 'text/x-rust', category: 'code', label: 'Rust' },
  '.py': { mime: 'text/x-python', category: 'code', label: 'Python' },
  '.go': { mime: 'text/x-go', category: 'code', label: 'Go' },
  '.c': { mime: 'text/x-c', category: 'code', label: 'C' },
  '.h': { mime: 'text/x-c', category: 'code', label: 'C Header' },
  '.cpp': { mime: 'text/x-c++', category: 'code', label: 'C++' },
  '.java': { mime: 'text/x-java', category: 'code', label: 'Java' },
  '.sh': { mime: 'application/x-sh', category: 'script', label: 'Shell Script' },
  '.lsh': { mime: 'application/x-lumen-script', category: 'script', label: 'Lumen Script' },
  '.lwr': { mime: 'application/x-lumen-writer', category: 'document', label: 'Writer Document' },
  '.rtf': { mime: 'application/rtf', category: 'document', label: 'Rich Text' },
  '.doc': { mime: 'application/msword', category: 'document', label: 'Word Document' },
  '.docx': {
    mime: `${OOXML}.wordprocessingml.document`,
    category: 'document',
    label: 'Word Document',
  },
  '.lsd': { mime: 'application/x-lumen-sheet', category: 'spreadsheet', label: 'Sheets Workbook' },
  '.xlsx': {
    mime: `${OOXML}.spreadsheetml.sheet`,
    category: 'spreadsheet',
    label: 'Excel Workbook',
  },
  '.lsl': { mime: 'application/x-lumen-slides', category: 'presentation', label: 'Slides Deck' },
  '.pptx': {
    mime: `${OOXML}.presentationml.presentation`,
    category: 'presentation',
    label: 'PowerPoint Deck',
  },
  '.png': { mime: 'image/png', category: 'image', label: 'PNG Image' },
  '.jpg': { mime: 'image/jpeg', category: 'image', label: 'JPEG Image' },
  '.jpeg': { mime: 'image/jpeg', category: 'image', label: 'JPEG Image' },
  '.gif': { mime: 'image/gif', category: 'image', label: 'GIF Image' },
  '.webp': { mime: 'image/webp', category: 'image', label: 'WebP Image' },
  '.svg': { mime: 'image/svg+xml', category: 'image', label: 'SVG Image' },
  '.bmp': { mime: 'image/bmp', category: 'image', label: 'Bitmap Image' },
  '.ico': { mime: 'image/x-icon', category: 'image', label: 'Icon' },
  '.avif': { mime: 'image/avif', category: 'image', label: 'AVIF Image' },
  '.mp3': { mime: 'audio/mpeg', category: 'audio', label: 'MP3 Audio' },
  '.wav': { mime: 'audio/wav', category: 'audio', label: 'WAV Audio' },
  '.ogg': { mime: 'audio/ogg', category: 'audio', label: 'OGG Audio' },
  '.m4a': { mime: 'audio/mp4', category: 'audio', label: 'AAC Audio' },
  '.flac': { mime: 'audio/flac', category: 'audio', label: 'FLAC Audio' },
  '.mp4': { mime: 'video/mp4', category: 'video', label: 'MP4 Video' },
  '.webm': { mime: 'video/webm', category: 'video', label: 'WebM Video' },
  '.mov': { mime: 'video/quicktime', category: 'video', label: 'QuickTime Video' },
  '.mkv': { mime: 'video/x-matroska', category: 'video', label: 'Matroska Video' },
  '.pdf': { mime: 'application/pdf', category: 'pdf', label: 'PDF Document' },
  '.zip': { mime: 'application/zip', category: 'archive', label: 'ZIP Archive' },
  '.tar': { mime: 'application/x-tar', category: 'archive', label: 'TAR Archive' },
  '.gz': { mime: 'application/gzip', category: 'archive', label: 'GZip Archive' },
  '.7z': { mime: 'application/x-7z-compressed', category: 'archive', label: '7-Zip Archive' },
  '.app': { mime: 'application/x-lumen-app', category: 'app', label: 'Application' },
  '.ttf': { mime: 'font/ttf', category: 'font', label: 'TrueType Font' },
  '.otf': { mime: 'font/otf', category: 'font', label: 'OpenType Font' },
  '.woff': { mime: 'font/woff', category: 'font', label: 'Web Font' },
  '.woff2': { mime: 'font/woff2', category: 'font', label: 'Web Font' },
};

export function typeInfo(path: string): TypeInfo {
  const ext = extname(path);
  return (
    TYPES[ext] ?? {
      mime: 'application/octet-stream',
      category: 'binary',
      label: ext ? `${ext.slice(1).toUpperCase()} File` : 'File',
    }
  );
}

export function mimeType(path: string): string {
  return typeInfo(path).mime;
}

export function fileCategory(path: string): FileCategory {
  return typeInfo(path).category;
}

export function isTextLike(path: string): boolean {
  const c = fileCategory(path);
  return c === 'text' || c === 'code' || c === 'markdown' || c === 'data' || c === 'script';
}

export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 100 ? 0 : digits)} ${units[i]}`;
}
