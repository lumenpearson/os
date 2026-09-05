export interface AppEntry {
  name: string;
  summary: string;
}

/**
 * The built-in apps, in the order the Start menu lists them.
 *
 * This list mirrors `packages/apps/src/registry.ts` — the same names and the
 * same descriptions — because a landing page that claims an app the OS does
 * not ship is a lie about the product. The one entry it leaves out is Web App,
 * which is hidden from the launcher: it is the host that runs installed HTML
 * programs rather than something anybody opens.
 */
export const apps: readonly AppEntry[] = [
  { name: 'Files', summary: 'Browse, organise and open your files.' },
  {
    name: 'Mail',
    summary: 'A local mailbox: threads, folders and a search you can write queries in.',
  },
  {
    name: 'Browser',
    summary: 'Tabbed web browsing with bookmarks, history and a sandboxed page frame.',
  },
  { name: 'Terminal', summary: 'A shell over the file system with the usual commands.' },
  {
    name: 'Text Editor',
    summary: 'Plain text and code with line numbers, find and replace, Markdown preview.',
  },
  { name: 'Notes', summary: 'Markdown notes with tags, search, preview and task lists.' },
  { name: 'Contacts', summary: 'An address book, with vCard import and export.' },
  {
    name: 'Reminders',
    summary: 'Lists with due dates typed in plain words, priorities and subtasks.',
  },
  {
    name: 'Writer',
    summary: 'Rich text documents: headings, lists, links, export to HTML and Markdown.',
  },
  { name: 'Sheets', summary: 'Spreadsheets with formulas, ranges and CSV import.' },
  { name: 'Slides', summary: 'Presentations with layouts, notes and a full-screen player.' },
  { name: 'Preview', summary: 'View images, PDFs, media and data files.' },
  {
    name: 'Media Player',
    summary: 'Play audio and video files with a playlist, loop and shuffle.',
  },
  { name: 'Paint', summary: 'Draw and edit pictures pixel by pixel.' },
  {
    name: 'Calculator',
    summary: 'Basic, scientific and programmer arithmetic with a running tape.',
  },
  { name: 'Units', summary: 'Convert between fourteen kinds of unit, including the awkward ones.' },
  {
    name: 'Calendar',
    summary: 'Keep a calendar: month, week, day and agenda, with repeating events.',
  },
  { name: 'Clock', summary: 'Local and world time, a stopwatch with laps, and a countdown timer.' },
  { name: 'Settings', summary: 'System preferences: appearance, desktop, security, devices.' },
  {
    name: 'Task Manager',
    summary: 'Running processes, measured performance, and every registered app.',
  },
  {
    name: 'System Information',
    summary: 'Hardware, software and storage readings for this computer.',
  },
  { name: 'Storage', summary: 'See what is using disk space and clear it out.' },
  { name: 'Console', summary: 'Read the system log: kernel events, notifications and errors.' },
  {
    name: 'Workbench',
    summary: 'JSON, regex, diff, encoders, hashes, IDs and epoch times in one window.',
  },
  { name: 'Archive Utility', summary: 'Open and create ZIP archives.' },
  { name: 'Software Center', summary: 'Install, inspect and remove apps and pseudo-programs.' },
  { name: 'Minesweeper', summary: 'Clear the field without uncovering a mine.' },
  {
    name: 'Chess',
    summary: 'The complete rules, checked against published move counts, and an opponent.',
  },
  { name: 'Sudoku', summary: 'Generated puzzles at four grades, with pencil marks and hints.' },
  { name: '2048', summary: 'Slide the tiles together until one of them reads 2048.' },
];
