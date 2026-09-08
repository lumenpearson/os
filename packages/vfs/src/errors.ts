export type VfsErrorCode =
  | 'ENOENT'
  | 'EEXIST'
  | 'ENOTDIR'
  | 'EISDIR'
  | 'EACCES'
  | 'ENOTEMPTY'
  | 'EINVAL'
  | 'EIO'
  | 'ENOSPC';

export class VfsError extends Error {
  readonly code: VfsErrorCode;
  readonly path: string;

  constructor(code: VfsErrorCode, path: string, message?: string) {
    super(message ?? `${code}: ${describe(code)} (${path})`);
    this.name = 'VfsError';
    this.code = code;
    this.path = path;
  }

  static is(error: unknown, code?: VfsErrorCode): error is VfsError {
    return error instanceof VfsError && (code === undefined || error.code === code);
  }
}

function describe(code: VfsErrorCode): string {
  switch (code) {
    case 'ENOENT':
      return 'no such file or directory';
    case 'EEXIST':
      return 'file exists';
    case 'ENOTDIR':
      return 'not a directory';
    case 'EISDIR':
      return 'is a directory';
    case 'EACCES':
      return 'permission denied';
    case 'ENOTEMPTY':
      return 'directory not empty';
    case 'EINVAL':
      return 'invalid argument';
    case 'ENOSPC':
      return 'no space left';
    default:
      return 'i/o error';
  }
}
