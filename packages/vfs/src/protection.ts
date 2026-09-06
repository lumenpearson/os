/**
 * Which paths belong to the system, what may still be done to them, and the
 * token a caller passes to say it is allowed to do it anyway.
 *
 * This is pure logic: no I/O, no ambient state, no `process.env`. `Vfs`
 * applies it on every operation that changes something; the rule itself is a
 * function of (operation, path, policy), so it can be tested on its own and
 * asked ahead of time — the shell does exactly that to print a refusal that
 * says what to do instead of the bare "permission denied".
 *
 * Reading is never refused. A system that hides its own files from the person
 * using it buys nothing; the damage this guards against is destruction.
 */

import { VfsError } from './errors';
import { isInside, normalize } from './path';

/** The kinds of change a protected path can refuse. Reads are not listed. */
export type ProtectedOperation = 'write' | 'remove' | 'rename' | 'overwrite';

export interface ProtectionPolicy {
  /** Protected together with everything inside them. */
  readonly trees: readonly string[];
  /** Protected on their own; what is inside them is not. */
  readonly entries: readonly string[];
  /**
   * Paths inside a protected tree that are exempt from the *write* rule only.
   * They can still not be removed, renamed, or moved onto.
   *
   * Empty, and meant to stay that way. The kernel rewrites its own state under
   * /System as the OS runs — a settings change, a new account, a window moved
   * — and it passes authority for each of those writes rather than being
   * exempted from the rule. An entry here is a path anything at all can
   * overwrite, so add one only when there is a writer that genuinely cannot
   * mint authority, and say which writer it is.
   */
  readonly writable: readonly string[];
}

/**
 * What Lumen protects by default. /System is the kernel's own tree: settings,
 * accounts, session state, wallpapers. /Applications is protected as a single
 * entry rather than a tree — the folder has to keep existing because the
 * launcher mirrors it, but installing and removing programs inside it is
 * ordinary work, and the built-in manifests in there are re-seeded on every
 * boot, so losing one costs a reboot rather than the system.
 */
export const SYSTEM_PROTECTION: ProtectionPolicy = {
  trees: ['/System'],
  entries: ['/Applications'],
  writable: [],
};

/** For tests and for a `Vfs` that is nobody's system disk. */
export const NO_PROTECTION: ProtectionPolicy = { trees: [], entries: [], writable: [] };

/** True when the path is one the system owns. Reading it is still allowed. */
export function isProtectedPath(path: string, policy: ProtectionPolicy = SYSTEM_PROTECTION) {
  const n = normalize(path);
  if (policy.entries.some((entry) => normalize(entry) === n)) return true;
  return policy.trees.some((tree) => isInside(normalize(tree), n, true));
}

/** True when the policy refuses this operation on this path without authority. */
export function requiresElevation(
  operation: ProtectedOperation,
  path: string,
  policy: ProtectionPolicy = SYSTEM_PROTECTION,
): boolean {
  if (!isProtectedPath(path, policy)) return false;
  if (operation !== 'write') return true;
  const n = normalize(path);
  return !policy.writable.some((writable) => normalize(writable) === n);
}

/**
 * The refusal, as the same kind of typed error every other VFS failure uses.
 * The message is a whole sentence because it is what the Files app shows the
 * person: `EACCES` alone would reach them as "permission denied" or, worse,
 * as an unhandled rejection.
 */
export function protectionError(operation: ProtectedOperation, path: string): VfsError {
  const n = normalize(path);
  return new VfsError('EACCES', n, `${n} ${ENDINGS[operation]}`);
}

const ENDINGS: Record<ProtectedOperation, string> = {
  write: 'is part of the system and cannot be changed.',
  remove: 'is part of the system and cannot be deleted.',
  rename: 'is part of the system and cannot be moved or renamed.',
  overwrite: 'is part of the system and cannot be replaced.',
};

/**
 * Authority to change a protected path, for exactly the calls it is passed to.
 *
 * The class is not exported as a value and its instances are only made by
 * `elevate`, in this module. That gives the token three properties the escape
 * hatch depends on:
 *
 * 1. It is never ambient. There is no flag on the `Vfs`, no environment
 *    variable, no module-level "we are root now". Two operations running over
 *    the same `Vfs` cannot borrow each other's authority, however they
 *    interleave across awaits — the classic failure of a mutable sudo bit.
 * 2. It cannot arrive as data. It is not `true`, not `{ elevated: true }`:
 *    nothing parsed from JSON, read out of settings, or spread from user
 *    input can become one. It has to be minted by a line of code, and every
 *    such line is one `elevate(` away in a grep.
 * 3. It says nothing about *what* may be done. The VFS still decides which
 *    paths are protected; the token only carries the claim that the caller
 *    checked its authority, and the reason it gives for saying so.
 *
 * Checking that authority stays where the evidence is. The shell mints one
 * only inside `sudo`, after the kernel has verified the password against the
 * account's PBKDF2 hash, and drops it again when the wrapped command returns.
 */
class Elevation {
  /** Why it was granted, for the audit line and for a clearer refusal. */
  readonly reason: string;
  readonly grantedAt: number;

  constructor(reason: string, grantedAt: number) {
    this.reason = reason;
    this.grantedAt = grantedAt;
  }
}

export type { Elevation };

/** Mint authority to change protected paths. Grep for callers: there are few. */
export function elevate(reason: string): Elevation {
  return new Elevation(reason, Date.now());
}

/** True only for a token that came from `elevate`; a look-alike object does not pass. */
export function isElevated(value: unknown): value is Elevation {
  return value instanceof Elevation;
}

/** Mixed into the options of every `Vfs` call that can change a protected path. */
export interface Authority {
  /** Authority to go through with it; see `elevate`. */
  elevation?: Elevation;
}
