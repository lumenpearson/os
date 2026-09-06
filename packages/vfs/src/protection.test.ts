import { describe, expect, it } from 'vitest';
import { VfsError } from './errors';
import {
  type Elevation,
  elevate,
  isElevated,
  isProtectedPath,
  NO_PROTECTION,
  type ProtectionPolicy,
  protectionError,
  requiresElevation,
  SYSTEM_PROTECTION,
} from './protection';

describe('which paths the system owns', () => {
  it('claims /System and everything under it', () => {
    expect(isProtectedPath('/System')).toBe(true);
    expect(isProtectedPath('/System/settings.json')).toBe(true);
    expect(isProtectedPath('/System/Wallpapers/dune.jpg')).toBe(true);
  });

  it('claims /Applications itself but not what is installed in it', () => {
    expect(isProtectedPath('/Applications')).toBe(true);
    expect(isProtectedPath('/Applications/Quick Notes.app')).toBe(false);
  });

  it('leaves the rest of the disk alone', () => {
    for (const path of ['/', '/Users', '/Users/ada/Documents/notes.txt', '/Trash', '/Systemic']) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  it('normalises before deciding, so a detour does not slip past', () => {
    expect(isProtectedPath('/System/')).toBe(true);
    expect(isProtectedPath('/Users/../System/users.json')).toBe(true);
    expect(isProtectedPath('/System/../Users/ada')).toBe(false);
  });
});

describe('which operations are refused', () => {
  it('refuses to write, remove, rename or be moved onto', () => {
    for (const op of ['write', 'remove', 'rename', 'overwrite'] as const) {
      expect(requiresElevation(op, '/System/Wallpapers')).toBe(true);
    }
  });

  it('exempts nothing from the write rule, the kernel state files included', () => {
    for (const file of ['/System/settings.json', '/System/users.json', '/System/state.json']) {
      expect(requiresElevation('write', file)).toBe(true);
    }
    expect(requiresElevation('write', '/System/notes.json')).toBe(true);
  });

  it('refuses every kind of change to a system file, not only deletion', () => {
    for (const op of ['write', 'remove', 'rename', 'overwrite'] as const) {
      expect(requiresElevation(op, '/System/settings.json')).toBe(true);
    }
  });

  it('honours a policy that does name an exempt path', () => {
    const policy = { trees: ['/System'], entries: [], writable: ['/System/open.json'] };
    expect(requiresElevation('write', '/System/open.json', policy)).toBe(false);
    expect(requiresElevation('remove', '/System/open.json', policy)).toBe(true);
    expect(requiresElevation('write', '/System/other.json', policy)).toBe(true);
  });

  it('asks nothing of an ordinary path', () => {
    expect(requiresElevation('remove', '/Users/ada/Desktop/Welcome.md')).toBe(false);
    expect(requiresElevation('write', '/Applications/Quick Notes.app')).toBe(false);
  });

  it('takes the policy as data, so another disk can have another rule', () => {
    const policy: ProtectionPolicy = { trees: ['/etc'], entries: [], writable: [] };
    expect(requiresElevation('remove', '/etc/passwd', policy)).toBe(true);
    expect(requiresElevation('remove', '/System', policy)).toBe(false);
    expect(requiresElevation('remove', '/System', NO_PROTECTION)).toBe(false);
  });
});

describe('the refusal', () => {
  it('is a typed error the callers can tell apart, like EACCES anywhere else', () => {
    const error = protectionError('remove', '/System');
    expect(VfsError.is(error, 'EACCES')).toBe(true);
    expect(error.path).toBe('/System');
  });

  it('reads as a sentence, because the Files app shows it to a person', () => {
    expect(protectionError('remove', '/System').message).toBe(
      '/System is part of the system and cannot be deleted.',
    );
    expect(protectionError('write', '/System/x').message).toContain('cannot be changed');
    expect(protectionError('rename', '/System').message).toContain('cannot be moved or renamed');
    expect(protectionError('overwrite', '/System').message).toContain('cannot be replaced');
  });
});

describe('elevation', () => {
  it('carries the reason it was granted', () => {
    const granted = elevate('sudo rm');
    expect(granted.reason).toBe('sudo rm');
    expect(granted.grantedAt).toBeLessThanOrEqual(Date.now());
    expect(isElevated(granted)).toBe(true);
  });

  it('cannot be forged out of data', () => {
    // Anything that arrives as JSON, settings or user input lands here: none
    // of it is authority, whatever shape it wears.
    const lookalike = { reason: 'sudo rm', grantedAt: Date.now() } as unknown as Elevation;
    expect(isElevated(lookalike)).toBe(false);
    for (const value of [true, 1, 'sudo', {}, null, undefined]) {
      expect(isElevated(value)).toBe(false);
    }
  });
});

describe('the default policy', () => {
  it('protects the trees rather than listing every file inside them', () => {
    expect(SYSTEM_PROTECTION.trees).toEqual(['/System']);
    expect(SYSTEM_PROTECTION.entries).toEqual(['/Applications']);
  });
});
