/**
 * CRC-32 as ZIP uses it: the IEEE 802.3 polynomial, reflected (0xEDB88320),
 * initialised and finalised with all bits set. Every entry in an archive
 * carries one of these over its *uncompressed* bytes, so both reading and
 * writing go through here.
 *
 * The table is generated on first use rather than checked in as 256 literals:
 * the eight-shift loop below is the definition of the polynomial and can be
 * read, where a wall of hex cannot.
 */

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  const next = new Uint32Array(256);
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    next[byte] = value >>> 0;
  }
  table = next;
  return next;
}

/**
 * The checksum of `data`, continued from `previous` so a file can be summed
 * chunk by chunk: `crc32(b, crc32(a))` equals the checksum of `a` followed
 * by `b`. The empty input checksums to 0.
 */
export function crc32(data: Uint8Array, previous = 0): number {
  const lookup = crcTable();
  let crc = ~previous >>> 0;
  for (const byte of data) {
    crc = ((lookup[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return ~crc >>> 0;
}

/** The checksum as ZIP prints it: eight lowercase hex digits. */
export function formatCrc(crc: number): string {
  return (crc >>> 0).toString(16).padStart(8, '0');
}
