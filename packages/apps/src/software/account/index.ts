/**
 * The store's account and subscription model.
 *
 * A made-up account for a made-up store. It authenticates against nothing,
 * sends nothing anywhere, and keeps its whole state in one JSON file under the
 * user's home, so the storefront can show a plan, a renewal date and a history
 * of what was bought — everything a real account would show — without
 * pretending to be one.
 *
 * `types.ts` is the shapes, `plans.ts` the plans and their prices,
 * `account.ts` the reducers and the install predicate, `storage.ts` the file
 * and its validating reader. Nothing here draws anything or touches the VFS.
 */

export * from './account';
export * from './plans';
export * from './storage';
export * from './types';
