import { create } from 'zustand';
import type { UserAccount } from '../types';
import {
  generateRecoveryKey,
  hashSecret,
  normalizeRecoveryKey,
  randomSalt,
  verifySecret,
} from './crypto';

interface UsersStore {
  users: UserAccount[];
  currentUserId: string | null;
  /**
   * `signedIn` is who the machine was left signed in as, read back from the
   * state file. With one account it made no difference; with several, coming
   * back to whoever the first account happens to be is the wrong answer, and
   * an id that no longer names an account has to fall back rather than leave
   * the system with nobody to unlock as.
   */
  hydrate: (users: UserAccount[], signedIn?: string | null) => void;
  setCurrent: (id: string | null) => void;
  upsert: (user: UserAccount) => void;
  remove: (id: string) => void;
}

export const useUsersStore = create<UsersStore>((set) => ({
  users: [],
  currentUserId: null,
  hydrate: (users, signedIn) =>
    set({
      users,
      currentUserId: users.some((u) => u.id === signedIn)
        ? (signedIn ?? null)
        : (users[0]?.id ?? null),
    }),
  setCurrent: (id) => set({ currentUserId: id }),
  upsert: (user) =>
    set((s) => {
      const idx = s.users.findIndex((u) => u.id === user.id);
      const users =
        idx >= 0 ? s.users.map((u) => (u.id === user.id ? user : u)) : [...s.users, user];
      return { users };
    }),
  remove: (id) =>
    set((s) => {
      const users = s.users.filter((u) => u.id !== id);
      // Leaving `currentUserId` null would leave the lock screen with no
      // account to ask about, which reads as a broken system rather than as
      // one account fewer.
      const currentUserId = s.currentUserId === id ? (users[0]?.id ?? null) : s.currentUserId;
      return { users, currentUserId };
    }),
}));

export const currentUser = (): UserAccount | undefined => {
  const s = useUsersStore.getState();
  return s.users.find((u) => u.id === s.currentUserId);
};

export interface CreateUserInput {
  name: string;
  username?: string;
  password: string;
  hint?: string;
  avatar?: string;
  /** Usernames already in use, so the new one gets a home of its own. */
  taken?: readonly string[];
}

/** Build a user record and its one-time recovery key. */
export async function createUserAccount(
  input: CreateUserInput,
): Promise<{ user: UserAccount; recoveryKey: string }> {
  const salt = randomSalt();
  const recoveryKey = generateRecoveryKey();
  const username = uniqueUsername(input.username ?? slugify(input.name), input.taken ?? []);
  const user: UserAccount = {
    id: `u_${randomSalt(6)}`,
    name: input.name.trim(),
    username,
    avatar: input.avatar ?? 'preset:ember',
    passwordHash: input.password ? await hashSecret(input.password, salt) : null,
    salt,
    hint: input.hint?.trim() ?? '',
    recoveryKeyHash: await hashSecret(normalizeRecoveryKey(recoveryKey), salt),
    createdAt: Date.now(),
    lastLoginAt: null,
  };
  return { user, recoveryKey };
}

export async function verifyPassword(user: UserAccount, password: string): Promise<boolean> {
  if (user.passwordHash === null) return password.length === 0;
  return verifySecret(password, user.salt, user.passwordHash);
}

export async function verifyRecoveryKey(user: UserAccount, key: string): Promise<boolean> {
  return verifySecret(normalizeRecoveryKey(key), user.salt, user.recoveryKeyHash);
}

/** Set a new password and rotate the recovery key. Returns the new key. */
export async function resetCredentials(
  user: UserAccount,
  newPassword: string,
  hint?: string,
): Promise<{ user: UserAccount; recoveryKey: string }> {
  const salt = randomSalt();
  const recoveryKey = generateRecoveryKey();
  const next: UserAccount = {
    ...user,
    salt,
    passwordHash: newPassword ? await hashSecret(newPassword, salt) : null,
    recoveryKeyHash: await hashSecret(normalizeRecoveryKey(recoveryKey), salt),
    hint: hint ?? user.hint,
  };
  return { user: next, recoveryKey };
}

/**
 * A username nobody else has. The username is the name of the home directory,
 * so two people called Ada Lovelace sharing one would be two people sharing a
 * Documents folder — which is not a naming problem, it is a privacy one.
 */
export function uniqueUsername(base: string, taken: readonly string[]): string {
  const root = (base || 'user').slice(0, 24);
  const used = new Set(taken);
  if (!used.has(root)) return root;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root.slice(0, 24 - String(n).length)}${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // A thousand Adas. Fall back to something that cannot collide at all.
  return `${root.slice(0, 16)}${randomSalt(4)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
}

export const AVATAR_PRESETS = [
  { id: 'preset:ember', label: 'Ember', hue: 18 },
  { id: 'preset:moss', label: 'Moss', hue: 140 },
  { id: 'preset:tide', label: 'Tide', hue: 200 },
  { id: 'preset:iris', label: 'Iris', hue: 262 },
  { id: 'preset:slate', label: 'Slate', hue: 220 },
  { id: 'preset:sand', label: 'Sand', hue: 42 },
] as const;
