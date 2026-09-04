export interface AppEntry {
  name: string;
  summary: string;
}

/** The built-in apps, in the order the Start menu lists them. */
export const apps: readonly AppEntry[] = [
  {
    name: 'Files',
    summary: 'Browse the virtual file system: home folders, Applications, System, Trash.',
  },
  { name: 'Terminal', summary: 'A shell over the same file system, with a parsed command line.' },
  {
    name: 'Text Editor',
    summary: 'Plain text with line numbers; .txt, .md, .json and source files.',
  },
  { name: 'Writer', summary: 'Rich-text documents.' },
  { name: 'Sheets', summary: 'A spreadsheet with a formula evaluator.' },
  { name: 'Slides', summary: 'Slide decks you can edit and present full-screen.' },
  { name: 'Browser', summary: 'Loads the URL you type into a sandboxed iframe.' },
  {
    name: 'Task Manager',
    summary: 'Reads the process table; killing a process closes its windows.',
  },
  {
    name: 'Settings',
    summary: 'Appearance, desktop, lock screen, display scale, accessibility, region.',
  },
  { name: 'Calculator', summary: 'Arithmetic, driven from the keyboard.' },
  { name: 'Notes', summary: 'Short notes, stored as files in your home directory.' },
  { name: 'Preview', summary: 'Opens images.' },
  { name: 'Media Player', summary: 'Plays audio and video files from the file system.' },
  { name: 'PDF Viewer', summary: 'Opens PDFs in a window.' },
  { name: 'Calendar', summary: 'A month view.' },
  { name: 'Clock', summary: 'The time, large enough to read from across the room.' },
  { name: 'System Info', summary: 'Host details; on desktop, from the Rust kernel.' },
  { name: 'Storage', summary: 'Where the home directory lives and how much it holds.' },
  { name: 'Paint', summary: 'Bitmap drawing, saved to Pictures.' },
  { name: 'Minesweeper', summary: 'The game.' },
  { name: 'Software Center', summary: 'Installs .app manifests into /Applications.' },
  { name: 'Console', summary: 'Tails the session log.' },
];
