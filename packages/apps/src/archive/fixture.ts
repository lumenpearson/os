/**
 * Test data: a small archive produced by the `zip` command line tool, so the
 * reader is checked against an implementation that is not this one. It holds
 * a stored file, a deflated file, an explicit directory entry and a file
 * inside it, every entry carrying the extra fields `zip` writes and this app
 * does not, plus an archive comment. Only the tests import this file.
 */

/** `zip -r fixture.zip hello.txt long.txt docs`, then `zip -z` for the comment. */
const BASE64 =
  'UEsDBAoAAAAAANZLsVggMDo2BgAAAAYAAAAJABwAaGVsbG8udHh0VVQJAAPEI0dmxCNHZnV4CwABBAAAAAAEAAAAAGhlbGxv' +
  'ClBLAwQUAAAACADWS7FYzcPvvT0AAADgBgAACAAcAGxvbmcudHh0VVQJAAPEI0dmxCNHZnV4CwABBAAAAAAEAAAAACvJSFUo' +
  'LM1MzlZIKsovz1NIy69QyCrNLShWyC9LLVIoAUrnJFZVKqTkp3OVjKodVTuqdlTtqNpRtUNELQBQSwMECgAAAAAA1kuxWAAA' +
  'AAAAAAAAAAAAAAUAHABkb2NzL1VUCQADxCNHZl/xm2p1eAsAAQQAAAAABAAAAABQSwMECgAAAAAA1kuxWI2Vq+sHAAAABwAA' +
  'AA0AHABkb2NzL25vdGUudHh0VVQJAAPEI0dmxCNHZnV4CwABBAAAAAAEAAAAAG5lc3RlZApQSwECHgMKAAAAAADWS7FYIDA6' +
  'NgYAAAAGAAAACQAYAAAAAAABAAAApIEAAAAAaGVsbG8udHh0VVQFAAPEI0dmdXgLAAEEAAAAAAQAAAAAUEsBAh4DFAAAAAgA' +
  '1kuxWM3D7709AAAA4AYAAAgAGAAAAAAAAQAAAKSBSQAAAGxvbmcudHh0VVQFAAPEI0dmdXgLAAEEAAAAAAQAAAAAUEsBAh4D' +
  'CgAAAAAA1kuxWAAAAAAAAAAAAAAAAAUAGAAAAAAAAAAQAO1ByAAAAGRvY3MvVVQFAAPEI0dmdXgLAAEEAAAAAAQAAAAAUEsB' +
  'Ah4DCgAAAAAA1kuxWI2Vq+sHAAAABwAAAA0AGAAAAAAAAQAAAKSBBwEAAGRvY3Mvbm90ZS50eHRVVAUAA8QjR2Z1eAsAAQQA' +
  'AAAABAAAAABQSwUGAAAAAAQABAA7AQAAVQEAABoAd3JpdHRlbiBieSB0aGUgemlwIGNvbW1hbmQ=';
/** The body of `long.txt`, which the tool deflated from 1,760 bytes to 61. */
export const FIXTURE_LONG_TEXT = 'the quick brown fox jumps over the lazy dog\n'.repeat(40);

/** When every entry in the fixture was last modified, in local time. */
export const FIXTURE_MODIFIED = new Date(2024, 4, 17, 9, 30, 44).getTime();

export const FIXTURE_COMMENT = 'written by the zip command';

export function fixtureArchive(): Uint8Array {
  return Uint8Array.from(atob(BASE64), (c) => c.charCodeAt(0));
}
