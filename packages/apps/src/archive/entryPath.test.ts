import { isInside } from '@lumen/vfs';
import { describe, expect, it } from 'vitest';
import { extractionPath, isRewritten, sanitizeComponent, sanitizeEntryName } from './entryPath';

describe('sanitizeComponent', () => {
  it('keeps an ordinary name', () => {
    expect(sanitizeComponent('report.txt')).toBe('report.txt');
    expect(sanitizeComponent('.hidden')).toBe('.hidden');
  });

  it('refuses the traversal components and the empty string', () => {
    expect(sanitizeComponent('')).toBeNull();
    expect(sanitizeComponent('.')).toBeNull();
    expect(sanitizeComponent('..')).toBeNull();
  });

  it('refuses a component of nothing but dots', () => {
    expect(sanitizeComponent('...')).toBeNull();
    expect(sanitizeComponent('....')).toBeNull();
  });

  it('replaces characters the file system rejects', () => {
    expect(sanitizeComponent('a:b')).toBe('a_b');
    expect(sanitizeComponent('a*b?c"d<e>f|g')).toBe('a_b_c_d_e_f_g');
    expect(sanitizeComponent('nul\u0000byte')).toBe('nul_byte');
  });

  it('trims the trailing dots and spaces Windows will not store', () => {
    expect(sanitizeComponent('name.')).toBe('name');
    expect(sanitizeComponent('name ')).toBe('name');
    expect(sanitizeComponent('name. . ')).toBe('name');
    expect(sanitizeComponent('  keeps leading')).toBe('  keeps leading');
  });

  it('steps around the MS-DOS device names', () => {
    expect(sanitizeComponent('CON')).toBe('_CON');
    expect(sanitizeComponent('com1.txt')).toBe('_com1.txt');
    expect(sanitizeComponent('console.log')).toBe('console.log');
  });

  it('clamps a component to 255 characters and still trims the tail', () => {
    expect(sanitizeComponent('x'.repeat(300))).toHaveLength(255);
    const dotted = `${'x'.repeat(250)}${'.'.repeat(50)}`;
    expect(sanitizeComponent(dotted)).toBe('x'.repeat(250));
  });
});

describe('sanitizeEntryName', () => {
  it('strips a relative climb out of the destination', () => {
    expect(sanitizeEntryName('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeEntryName('..')).toBeNull();
    expect(sanitizeEntryName('../..')).toBeNull();
  });

  it('makes an absolute name relative', () => {
    expect(sanitizeEntryName('/etc/passwd')).toBe('etc/passwd');
    expect(sanitizeEntryName('///etc///passwd')).toBe('etc/passwd');
  });

  it('drops interior climbs instead of resolving them', () => {
    expect(sanitizeEntryName('a/../../b')).toBe('a/b');
    expect(sanitizeEntryName('a/./b')).toBe('a/b');
  });

  it('disarms a Windows drive path', () => {
    expect(sanitizeEntryName('C:\\Windows\\x')).toBe('Windows/x');
    expect(sanitizeEntryName('c:x')).toBe('x');
    expect(sanitizeEntryName('\\\\server\\share\\x')).toBe('server/share/x');
  });

  it('refuses a name with nothing usable in it', () => {
    expect(sanitizeEntryName('')).toBeNull();
    expect(sanitizeEntryName('...')).toBeNull();
    expect(sanitizeEntryName('/')).toBeNull();
    expect(sanitizeEntryName('./././')).toBeNull();
  });

  it('drops the trailing slash a directory entry carries', () => {
    expect(sanitizeEntryName('docs/')).toBe('docs');
    expect(sanitizeEntryName('docs/images/')).toBe('docs/images');
  });

  it('leaves a plain nested name alone', () => {
    expect(sanitizeEntryName('src/app/index.ts')).toBe('src/app/index.ts');
  });
});

describe('extractionPath', () => {
  const dest = '/Users/lumen/Extracted';

  it('joins a safe name under the destination', () => {
    expect(extractionPath(dest, 'src/index.ts')).toBe(`${dest}/src/index.ts`);
  });

  it('keeps every hostile name inside the destination', () => {
    const hostile = [
      '../../etc/passwd',
      '/etc/passwd',
      'a/../../b',
      'C:\\Windows\\x',
      'a/./b',
      '....//....//x',
      '..\\..\\..\\boot.ini',
      'ok/../../../../../../tmp/x',
    ];
    for (const name of hostile) {
      const target = extractionPath(dest, name);
      expect(target, name).not.toBeNull();
      expect(isInside(dest, target as string), name).toBe(true);
    }
  });

  it('names the file the archive meant, minus the climb', () => {
    expect(extractionPath(dest, '../../etc/passwd')).toBe(`${dest}/etc/passwd`);
    expect(extractionPath(dest, 'C:\\Windows\\x')).toBe(`${dest}/Windows/x`);
  });

  it('refuses a name that reduces to nothing', () => {
    expect(extractionPath(dest, '')).toBeNull();
    expect(extractionPath(dest, '..')).toBeNull();
    expect(extractionPath(dest, '...')).toBeNull();
  });

  it('works when the destination is the root', () => {
    expect(extractionPath('/', 'a/b')).toBe('/a/b');
  });

  it('does not confuse a sibling folder with the destination', () => {
    expect(isInside(dest, extractionPath(dest, '../Extracted2/x') as string)).toBe(true);
    expect(extractionPath(dest, '../Extracted2/x')).toBe(`${dest}/Extracted2/x`);
  });
});

describe('isRewritten', () => {
  it('flags a name the extractor had to change', () => {
    expect(isRewritten('../../etc/passwd')).toBe(true);
    expect(isRewritten('/etc/passwd')).toBe(true);
    expect(isRewritten('C:\\Windows\\x')).toBe(true);
    expect(isRewritten('...')).toBe(true);
  });

  it('leaves an ordinary name unflagged', () => {
    expect(isRewritten('src/index.ts')).toBe(false);
    expect(isRewritten('docs/')).toBe(false);
  });
});
