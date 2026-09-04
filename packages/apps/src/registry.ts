import type { AppDefinition } from '@lumen/kernel';
import webapp from './webapp';

/**
 * Every built-in app, in launcher order. Add new apps here; the folder
 * layout is described in README.md. Definitions are cheap (lazy components).
 */
export const builtinApps: AppDefinition[] = [webapp];
