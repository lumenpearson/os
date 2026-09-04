/**
 * The output log is a list of blocks: one per submitted command (its prompt
 * and text, then the chunks it wrote to stdout/stderr) plus prompt-less
 * blocks for the banner, completion listings and `^C`. Pure helpers keep the
 * log under a line budget and build the prompt text.
 */

export type ChunkKind = 'out' | 'err' | 'info';

export interface Chunk {
  kind: ChunkKind;
  text: string;
}

export interface Prompt {
  /** "ada@lumen" */
  user: string;
  /** "~/Documents" */
  path: string;
}

export interface Block {
  id: number;
  prompt: Prompt | null;
  command: string | null;
  chunks: Chunk[];
}

export const MAX_LINES = 5000;

/** Lines a piece of text occupies: one per newline, plus a partial last line. */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return text.endsWith('\n') ? n : n + 1;
}

export function blockLines(block: Block): number {
  const own = block.command !== null ? 1 : 0;
  return own + countLines(block.chunks.map((c) => c.text).join(''));
}

/** Append text to a block, merging into the previous chunk when the kind matches. */
export function appendChunk(block: Block, chunk: Chunk): Block {
  if (chunk.text.length === 0) return block;
  const last = block.chunks[block.chunks.length - 1];
  if (last && last.kind === chunk.kind) {
    return {
      ...block,
      chunks: [...block.chunks.slice(0, -1), { kind: last.kind, text: last.text + chunk.text }],
    };
  }
  return { ...block, chunks: [...block.chunks, chunk] };
}

/** Route pending chunks to their blocks; chunks for a vanished block (after `clear`) start a new one. */
export function applyChunks(
  blocks: Block[],
  pending: Array<{ id: number; chunk: Chunk }>,
): Block[] {
  if (pending.length === 0) return blocks;
  const next = [...blocks];
  const index = new Map<number, number>();
  for (let i = 0; i < next.length; i++) index.set((next[i] as Block).id, i);
  for (const { id, chunk } of pending) {
    const at = index.get(id);
    if (at === undefined) {
      index.set(id, next.length);
      next.push({ id, prompt: null, command: null, chunks: chunk.text ? [chunk] : [] });
    } else {
      next[at] = appendChunk(next[at] as Block, chunk);
    }
  }
  return next;
}

/** Drop the first `n` lines of a text. */
export function dropLines(text: string, n: number): string {
  let rest = text;
  for (let i = 0; i < n && rest.length > 0; i++) {
    const nl = rest.indexOf('\n');
    rest = nl < 0 ? '' : rest.slice(nl + 1);
  }
  return rest;
}

/** Keep the newest blocks so the total stays within `max` lines. */
export function trimBlocks(blocks: Block[], max = MAX_LINES): Block[] {
  let total = 0;
  const sizes = blocks.map((b) => {
    const n = blockLines(b);
    total += n;
    return n;
  });
  if (total <= max) return blocks;
  let start = 0;
  while (start < blocks.length && total - (sizes[start] as number) >= max) {
    total -= sizes[start] as number;
    start++;
  }
  const kept = blocks.slice(start);
  const first = kept[0];
  if (!first || total <= max) return kept;
  // The oldest kept block alone overflows: cut lines from its head.
  let excess = total - max;
  const chunks: Chunk[] = [];
  let command = first.command;
  let prompt = first.prompt;
  if (command !== null && excess > 0) {
    command = null;
    prompt = null;
    excess--;
  }
  for (const c of first.chunks) {
    if (excess <= 0) {
      chunks.push(c);
      continue;
    }
    const lines = countLines(c.text);
    if (lines <= excess) {
      excess -= lines;
      continue;
    }
    chunks.push({ kind: c.kind, text: dropLines(c.text, excess) });
    excess = 0;
  }
  return [{ ...first, command, prompt, chunks }, ...kept.slice(1)];
}

/** "/Users/ada/Documents" → "~/Documents"; the home itself → "~". */
export function abbreviateHome(path: string, home: string): string {
  if (home !== '/' && path === home) return '~';
  if (home !== '/' && path.startsWith(`${home}/`)) return `~${path.slice(home.length)}`;
  return path;
}

export function promptFor(user: string, host: string, cwd: string, home: string): Prompt {
  return { user: `${user}@${host}`, path: abbreviateHome(cwd, home) };
}

export function promptText(prompt: Prompt): string {
  return `${prompt.user}:${prompt.path}$ `;
}

export function windowTitle(cwd: string, home: string, override?: string): string {
  if (override?.trim()) return override.trim();
  return `${abbreviateHome(cwd, home)} — Terminal`;
}
