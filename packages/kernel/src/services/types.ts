/**
 * System services: the parts of the OS that run without being an application.
 *
 * A service is not in the launcher and has no window of its own. Some are
 * genuinely running code in this repository — the update checker, the indexer,
 * the notification daemon — and some are declared because the machine plainly
 * has to be doing them for the rest to work. Both kinds appear in the task
 * manager and in Computer Management, and each says which it is, because a
 * list that mixes real processes with decoration and does not say so is a lie
 * about the system.
 */

export type ServiceCategory =
  | 'core'
  | 'shell'
  | 'files'
  | 'network'
  | 'input'
  | 'media'
  | 'printing'
  | 'security'
  | 'sync'
  | 'maintenance'
  | 'accessibility'
  | 'developer';

export type ServiceState = 'running' | 'stopped' | 'on-demand';

export type ServiceStartup = 'boot' | 'login' | 'manual' | 'triggered';

export interface ServiceDefinition {
  /** Reverse-DNS id, e.g. "com.lumen.windowserver". */
  id: string;
  /** What the task manager prints. */
  name: string;
  category: ServiceCategory;
  /** One sentence: what it does, in plain words. */
  description: string;
  startup: ServiceStartup;
  /**
   * True when code in this repository actually implements the service. False
   * marks a declared service: it is listed, it can be described, and it does
   * not pretend to be doing work it is not.
   */
  implemented: boolean;
  /** Settings page that configures it, e.g. "updates" — most services have one. */
  settingsSection?: string;
  /** Services that must be running first. */
  requires?: readonly string[];
}

export interface ServiceStatus {
  id: string;
  state: ServiceState;
  /** When it last started, or null while stopped. */
  startedAt: number | null;
}
