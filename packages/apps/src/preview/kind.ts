/**
 * Which viewer a file gets. The VFS already maps an extension to a category,
 * but a category is not a viewer: `.svg` is an image that also has readable
 * source, `.json` is data with a tree, `.csv` is a spreadsheet Preview shows
 * as a table, and `.xlsx` is a spreadsheet Preview cannot read at all.
 */
import { extname, type FileCategory, fileCategory } from '@lumen/vfs';

export type ViewerKind =
  | 'image'
  | 'svg'
  | 'pdf'
  | 'markdown'
  | 'json'
  | 'csv'
  | 'text'
  | 'audio'
  | 'video'
  | 'hex'
  | 'unsupported';

/** Extensions whose viewer is not the one their category implies. */
const BY_EXTENSION: Record<string, ViewerKind> = {
  '.svg': 'svg',
  '.json': 'json',
  '.csv': 'csv',
  '.tsv': 'csv',
};

const BY_CATEGORY: Record<FileCategory, ViewerKind> = {
  text: 'text',
  code: 'text',
  markdown: 'markdown',
  data: 'text',
  script: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  pdf: 'pdf',
  // Formats with a real reader elsewhere in the OS, or no reader at all.
  document: 'unsupported',
  spreadsheet: 'unsupported',
  presentation: 'unsupported',
  archive: 'unsupported',
  font: 'unsupported',
  app: 'unsupported',
  // An unregistered extension says nothing; the bytes decide (see refineKind).
  binary: 'hex',
};

export function viewerKind(path: string): ViewerKind {
  return BY_EXTENSION[extname(path)] ?? BY_CATEGORY[fileCategory(path)];
}

/** Bytes sampled before deciding an unknown file is text. */
export const SNIFF_LIMIT = 4096;

/** Control characters that appear in ordinary text files. */
const TEXT_CONTROLS = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1b]);

/**
 * A file with no NUL bytes and few control characters reads as text. The
 * sample is the head of the file, which is where a binary signature lives.
 */
export function looksTextual(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, SNIFF_LIMIT);
  if (end === 0) return true;
  let odd = 0;
  for (let i = 0; i < end; i++) {
    const byte = bytes[i] ?? 0;
    if (byte === 0) return false;
    if (byte < 0x20 && !TEXT_CONTROLS.has(byte)) odd++;
  }
  return odd / end <= 0.05;
}

/** Promote a file with no known extension to the text viewer if it reads as text. */
export function refineKind(kind: ViewerKind, bytes: Uint8Array): ViewerKind {
  if (kind !== 'hex') return kind;
  return looksTextual(bytes) ? 'text' : 'hex';
}

export function canPreview(path: string): boolean {
  return viewerKind(path) !== 'unsupported';
}

/** True when the viewer draws pixels the zoom controls apply to. */
export function isZoomable(kind: ViewerKind): boolean {
  return kind === 'image' || kind === 'svg';
}

export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.bmp',
  '.ico',
  '.svg',
] as const;

export const MEDIA_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.flac',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
] as const;

export const DOCUMENT_EXTENSIONS = ['.pdf'] as const;

/** Text-ish formats: the Editor owns them, Preview reads them. */
export const TEXT_EXTENSIONS = [
  '.txt',
  '.log',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.tsv',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.js',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.css',
  '.html',
  '.htm',
  '.rs',
  '.py',
  '.go',
  '.c',
  '.h',
  '.cpp',
  '.java',
  '.sh',
] as const;
