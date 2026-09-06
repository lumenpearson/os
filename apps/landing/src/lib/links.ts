const trim = (url: string) => url.replace(/\/$/, '');

export const OS_URL = trim(import.meta.env.VITE_OS_URL ?? 'https://lumen-os.vercel.app');
export const SITE_URL = trim(
  import.meta.env.VITE_SITE_URL ?? 'https://lumen-os-landing.vercel.app',
);
export const REPO_URL = 'https://github.com/lumenpearson/os';
export const RELEASES_URL = `${REPO_URL}/releases`;
export const repoFile = (path: string) => `${REPO_URL}/blob/main/${path}`;
