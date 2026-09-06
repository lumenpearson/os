/**
 * The plain-text report. It renders the same `Section[]` the window shows,
 * so a copied or saved report says exactly what was on screen — including
 * the rows that could not be filled in, which keep their em-dash and their
 * one-line reason.
 */

import { NO_VALUE } from './probe';
import { countUnavailable, type FactRow, type Section } from './sections';

export interface ReportMeta {
  title: string;
  /** When the readings were taken, in the user's date format. */
  collectedAtLabel: string;
}

const INDENT = '  ';
const GAP = '  ';

/** Width of the label column: the longest label in the section. */
export function labelWidth(rows: readonly FactRow[]): number {
  return rows.reduce((width, r) => Math.max(width, r.label.length), 0);
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function renderSection(section: Section): string[] {
  const width = labelWidth(section.rows);
  const lines: string[] = [section.title];
  const continuation = INDENT + ' '.repeat(width + GAP.length);
  for (const { label, fact, note } of section.rows) {
    const value = fact.available ? oneLine(fact.value) : NO_VALUE;
    lines.push(`${INDENT}${label.padEnd(width)}${GAP}${value}`);
    const detail = fact.available ? note : fact.reason;
    if (detail) lines.push(continuation + oneLine(detail));
  }
  return lines;
}

export function renderReport(sections: readonly Section[], meta: ReportMeta): string {
  const missing = countUnavailable(sections);
  const total = sections.reduce((count, section) => count + section.rows.length, 0);
  const lines: string[] = [
    meta.title,
    `Collected ${meta.collectedAtLabel}`,
    missing === 0
      ? `${total} values, all available on this platform.`
      : `${total} values, ${missing} of them not available on this platform.`,
  ];
  for (const section of sections) {
    lines.push('', ...renderSection(section));
  }
  return `${lines.join('\n')}\n`;
}

/** File name for Save Report; the VFS makes it unique if one already exists. */
export function reportFileName(collectedAt: number): string {
  const stamp = new Date(collectedAt).toISOString().slice(0, 10);
  return `System Report ${stamp}.txt`;
}
