export type { VfsErrorCode } from './errors';
export { VfsError } from './errors';
export { IndexedDbAdapter } from './idb';
export { MemoryAdapter } from './memory';
export type { FileCategory, TypeInfo } from './mime';
export { fileCategory, formatBytes, isTextLike, mimeType, typeInfo } from './mime';
export { OpfsAdapter } from './opfs';
export * as path from './path';
export {
  ancestors,
  basename,
  dirname,
  extname,
  isAbsolute,
  isInside,
  isValidName,
  join,
  normalize,
  relative,
  resolve,
  SEP,
  segments,
  uniqueName,
} from './path';
export type {
  DirEntry,
  FileKind,
  FileStat,
  RemoveOptions,
  VfsAdapter,
  VfsEvent,
  VfsEventType,
  VfsListener,
  WriteOptions,
} from './types';
export type { SearchOptions } from './vfs';
export { compareEntries, entryCategory, isHidden, Vfs } from './vfs';
