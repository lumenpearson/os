/**
 * Text layout helpers for command output: column listings, aligned tables,
 * `date` formats, the `cal` grid and duration strings. Pure functions.
 */

/** Lay names out in columns that fit `width` characters, filled column-major like `ls`. */
export function columns(names: string[], width = 80): string {
  if (names.length === 0) return '';
  const longest = Math.max(...names.map((n) => n.length));
  const colWidth = longest + 2;
  const cols = Math.max(1, Math.floor(width / colWidth));
  const rows = Math.ceil(names.length / cols);
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const name = names[c * rows + r];
      if (name === undefined) break;
      const isLast = names[(c + 1) * rows + r] === undefined;
      line += isLast ? name : name.padEnd(colWidth);
    }
    lines.push(line.trimEnd());
  }
  return `${lines.join('\n')}\n`;
}

export interface TableColumn {
  label: string;
  align?: 'left' | 'right';
}

/** Align rows under a header. Every column but the last is padded to its widest cell. */
export function table(cols: TableColumn[], rows: string[][]): string {
  const widths = cols.map((c, i) =>
    Math.max(c.label.length, ...rows.map((r) => (r[i] ?? '').length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => {
        const w = widths[i] ?? 0;
        const last = i === cols.length - 1;
        if (cols[i]?.align === 'right') return cell.padStart(w);
        return last ? cell : cell.padEnd(w);
      })
      .join('  ')
      .trimEnd();
  return `${[line(cols.map((c) => c.label)), ...rows.map(line)].join('\n')}\n`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A subset of strftime: %Y %y %m %d %e %H %I %M %S %p %A %a %B %b %j %s %Z %n %t %%.
 */
export function formatDate(date: Date, format: string): string {
  let out = '';
  for (let i = 0; i < format.length; i++) {
    const c = format.charAt(i);
    if (c !== '%') {
      out += c;
      continue;
    }
    const spec = format.charAt(++i);
    switch (spec) {
      case 'Y':
        out += date.getFullYear();
        break;
      case 'y':
        out += pad2(date.getFullYear() % 100);
        break;
      case 'm':
        out += pad2(date.getMonth() + 1);
        break;
      case 'd':
        out += pad2(date.getDate());
        break;
      case 'e':
        out += String(date.getDate()).padStart(2, ' ');
        break;
      case 'H':
        out += pad2(date.getHours());
        break;
      case 'I':
        out += pad2(date.getHours() % 12 || 12);
        break;
      case 'M':
        out += pad2(date.getMinutes());
        break;
      case 'S':
        out += pad2(date.getSeconds());
        break;
      case 'p':
        out += date.getHours() < 12 ? 'AM' : 'PM';
        break;
      case 'A':
        out += DAYS[date.getDay()];
        break;
      case 'a':
        out += (DAYS[date.getDay()] as string).slice(0, 3);
        break;
      case 'B':
        out += MONTHS[date.getMonth()];
        break;
      case 'b':
        out += (MONTHS[date.getMonth()] as string).slice(0, 3);
        break;
      case 'j':
        out += String(dayOfYear(date)).padStart(3, '0');
        break;
      case 's':
        out += Math.floor(date.getTime() / 1000);
        break;
      case 'Z':
        out += timeZoneAbbreviation(date);
        break;
      case 'F':
        out += `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
        break;
      case 'T':
        out += `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
        break;
      case 'n':
        out += '\n';
        break;
      case 't':
        out += '\t';
        break;
      case '%':
        out += '%';
        break;
      case '':
        out += '%';
        break;
      default:
        out += `%${spec}`;
    }
  }
  return out;
}

/** The default `date` output: "Thu Sep  4 10:22:33 2026". */
export function defaultDate(date: Date): string {
  return formatDate(date, '%a %b %e %H:%M:%S %Y');
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.floor((date.getTime() - start.getTime()) / 86_400_000) + 1;
}

function timeZoneAbbreviation(date: Date): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  return part?.value ?? 'UTC';
}

/** A month grid like `cal`. When `today` falls in the month it is marked with an asterisk. */
export function calendar(month: Date, firstDayOfWeek: 0 | 1 = 1, today: Date = month): string {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const title = `${MONTHS[monthIndex]} ${year}`;
  const mark =
    today.getFullYear() === year && today.getMonth() === monthIndex ? today.getDate() : -1;
  const heads = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const order = firstDayOfWeek === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const lines = [
    title
      .padStart(Math.floor((20 + title.length) / 2))
      .padEnd(20)
      .trimEnd(),
  ];
  lines.push(order.map((d) => heads[d]).join(' '));
  const first = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  let offset = order.indexOf(first);
  // Cells are three wide (separator + two digits); today's separator is `*`,
  // so the marker never shifts the grid: " *4" and "*12" both keep alignment.
  const cell = (day: number) => (day === mark ? `*${day}` : String(day)).padStart(3, ' ');
  const flush = (line: string) =>
    lines.push((line.startsWith(' ') ? line.slice(1) : line).trimEnd());
  let line = '   '.repeat(offset);
  for (let day = 1; day <= daysInMonth; day++) {
    line += cell(day);
    offset++;
    if (offset % 7 === 0) {
      flush(line);
      line = '';
    }
  }
  if (line.trim()) flush(line);
  return `${lines.join('\n')}\n`;
}

/** "3 days, 4:05" style uptime, or "12 min" / "45 s" for short spans. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}, ${hours}:${pad2(minutes)}`;
  if (hours > 0) return `${hours}:${pad2(minutes)}`;
  if (minutes > 0) return `${minutes} min`;
  return `${s} s`;
}

/** `ls -l` style timestamp: "Sep  4 10:22" this year, "Sep  4  2025" otherwise. */
export function listingDate(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return sameYear ? formatDate(d, '%b %e %H:%M') : formatDate(d, '%b %e  %Y');
}

/** Wrap a number for display with thousands separators, tabular-friendly. */
export function groupDigits(n: number): string {
  return n.toLocaleString('en-US');
}
