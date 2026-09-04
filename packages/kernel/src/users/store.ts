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
  hydrate: (users: UserAccount[]) => void;
  setCurrent: (id: string | null) => void;
  upsert: (user: UserAccount) => void;
  remove: (id: string) => void;
}

export const useUsersStore = create<UsersStore>((set) => ({
  users: [],
  currentUserId: null,
  hydrate: (users) => set({ users, currentUserId: users[0]?.id ?? null }),
  setCurrent: (id) => set({ currentUserId: id }),
  upsert: (user) =>
    set((s) => {
      const idx = s.users.findIndex((u) => u.id === user.id);
      const users =
        idx >= 0 ? s.users.map((u) => (u.id === user.id ? user : u)) : [...s.users, user];
      return { users };
    }),
  remove: (id) =>
    set((s) => ({
      users: s.users.filter((u) => u.id !== id),
      currentUserId: s.currentUserId === id ? null : s.currentUserId,
    })),
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
}

/** Build a user record and its one-time recovery key. */
export async function createUserAccount(
  input: CreateUserInput,
): Promise<{ user: UserAccount; recoveryKey: string }> {
  const salt = randomSalt();
  const recoveryKey = generateRecoveryKey();
  const username = (input.username ?? slugify(input.name)) || 'user';
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
