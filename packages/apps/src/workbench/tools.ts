/**
 * The tools in the window and the order they sit in. Everything that names a
 * tool — the sidebar, the select the sidebar folds into, the View menu and its
 * shortcuts — reads this list, so they cannot drift apart.
 */

export const TOOLS = ['json', 'regex', 'diff', 'encode', 'ids', 'time', 'hash'] as const;

export type ToolId = (typeof TOOLS)[number];

export const TOOL_LABEL: Record<ToolId, string> = {
  json: 'JSON',
  regex: 'Regex',
  diff: 'Diff',
  encode: 'Encode',
  ids: 'IDs',
  time: 'Time',
  hash: 'Hash',
};

/** One line under the title of the pane. Says what the tool does. */
export const TOOL_SUMMARY: Record<ToolId, string> = {
  json: 'Format, minify and query a document.',
  regex: 'Match a pattern against a subject and preview a replacement.',
  diff: 'Compare two texts line by line.',
  encode: 'Base64, URL, hex and HTML entities, both directions.',
  ids: 'Generate UUID v4 and ULID.',
  time: 'Convert between epoch timestamps and dates.',
  hash: 'SHA-1, SHA-256, SHA-384 and SHA-512 digests.',
};

/** Mod+1 through Mod+7, in list order. */
export const TOOL_SHORTCUT: Record<ToolId, string> = Object.fromEntries(
  TOOLS.map((tool, i) => [tool, `Mod+${i + 1}`]),
) as Record<ToolId, string>;

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && (TOOLS as readonly string[]).includes(value);
}

/** The next tool in the list, wrapping at both ends. */
export function stepTool(current: ToolId, direction: 1 | -1): ToolId {
  const at = TOOLS.indexOf(current);
  return TOOLS[(at + direction + TOOLS.length) % TOOLS.length] as ToolId;
}
