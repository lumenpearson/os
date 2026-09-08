/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
  readonly VITE_OS_URL?: string;
}
