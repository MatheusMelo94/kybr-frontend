// The zip guard (Security C7 v1.1, ADR-0012 Amendment 2): an XLSX's central
// directory is checked before SheetJS sees a byte. It reads only the end
// record, the directory and each entry's local header; its loops are bounded
// by the 2,000-entry cap. Declared sizes can lie: the worker's 20 s timeout
// and terminate() stay the backstop.

export type GuardResult =
  { ok: true } | { ok: false; error: "unreadable" | "type" };

const MAX_ENTRIES = 2000;
const MiB = 1024 * 1024;
const MAX_ENTRY_BYTES = 100 * MiB;
const MAX_TOTAL_BYTES = 150 * MiB;
/** A bomb's signature: ≥ 1000:1 on an entry of ≥ 1 MiB uncompressed. */
const BOMB_RATIO = 1000;
const BOMB_MIN_BYTES = MiB;

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const EOCD_SIZE = 22;
const MAX_COMMENT = 0xffff;

const unreadable: GuardResult = { ok: false, error: "unreadable" };

type Entry = {
  name: string;
  method: number;
  compressed: number;
  uncompressed: number;
  localOffset: number;
  dataStart: number;
};

function findEnd(view: DataView): number {
  const last = view.byteLength - EOCD_SIZE;
  const first = Math.max(0, last - MAX_COMMENT);
  for (let at = last; at >= first; at--)
    if (view.getUint32(at, true) === EOCD) return at;
  return -1;
}

/** The directory's entries, or undefined when the structure is refused. */
function readDirectory(bytes: Uint8Array): Entry[] | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < EOCD_SIZE) return undefined;
  const end = findEnd(view);
  if (end < 0) return undefined;
  // ZIP64 (its locator sits right before the end record) and multi-disk.
  if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR)
    return undefined;
  const disk = view.getUint16(end + 4, true);
  const directoryDisk = view.getUint16(end + 6, true);
  const onDisk = view.getUint16(end + 8, true);
  const total = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (disk !== 0 || directoryDisk !== 0 || onDisk !== total) return undefined;
  if (total === 0xffff || size === 0xffffffff || offset === 0xffffffff)
    return undefined;
  if (total > MAX_ENTRIES || offset + size > end) return undefined;

  const decoder = new TextDecoder();
  const names = new Set<string>();
  const entries: Entry[] = [];
  let at = offset;
  for (let index = 0; index < total; index++) {
    if (at + 46 > offset + size || view.getUint32(at, true) !== CENTRAL)
      return undefined;
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const uncompressed = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const entryDisk = view.getUint16(at + 34, true);
    const localOffset = view.getUint32(at + 42, true);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > offset + size) return undefined;
    // Encrypted (bit 0) or a ZIP64 size, or another disk.
    if ((flags & 1) !== 0 || entryDisk !== 0) return undefined;
    if (compressed === 0xffffffff || uncompressed === 0xffffffff)
      return undefined;
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (names.has(name)) return undefined;
    names.add(name);

    // The local header must be there, inside the data area.
    if (
      localOffset + 30 > offset ||
      view.getUint32(localOffset, true) !== LOCAL
    )
      return undefined;
    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    if (dataStart + compressed > offset) return undefined;
    entries.push({
      name,
      method,
      compressed,
      uncompressed,
      localOffset,
      dataStart,
    });
    at = next;
  }

  // No two entries' local data may overlap (an overlap bomb reuses bytes).
  const spans = [...entries].sort((a, b) => a.localOffset - b.localOffset);
  for (let index = 1; index < spans.length; index++) {
    const before = spans[index - 1];
    const span = spans[index];
    if (
      before !== undefined &&
      span !== undefined &&
      span.localOffset < before.dataStart + before.compressed
    )
      return undefined;
  }
  return entries;
}

function sizesRefused(entries: readonly Entry[]): boolean {
  let total = 0;
  for (const entry of entries) {
    total += entry.uncompressed;
    if (entry.uncompressed > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES)
      return true;
    if (
      entry.uncompressed >= BOMB_MIN_BYTES &&
      entry.uncompressed >= BOMB_RATIO * Math.max(1, entry.compressed)
    )
      return true;
  }
  return false;
}

/** [Content_Types].xml's text (deflated or stored), or undefined. */
async function contentTypes(
  bytes: Uint8Array,
  entry: Entry,
): Promise<string | undefined> {
  if (entry.uncompressed > MiB) return undefined;
  const data = bytes.slice(entry.dataStart, entry.dataStart + entry.compressed);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) return undefined;
  try {
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  } catch {
    return undefined;
  }
}

/**
 * `unreadable` for a malformed zip (C7 v1.1: > 2,000 entries, ZIP64,
 * multi-disk, encrypted, duplicate names, overlapping entries, no
 * xl/workbook.xml, an entry > 100 MiB, > 150 MiB in total, or ≥ 1000:1 on an
 * entry ≥ 1 MiB); `type` for a macro-enabled workbook (ADR-0012 item 2).
 */
export async function zipGuard(bytes: Uint8Array): Promise<GuardResult> {
  let entries: Entry[] | undefined;
  try {
    entries = readDirectory(bytes);
  } catch {
    return unreadable;
  }
  if (entries === undefined || sizesRefused(entries)) return unreadable;
  if (!entries.some((entry) => entry.name === "xl/workbook.xml"))
    return unreadable;
  if (entries.some((entry) => entry.name === "xl/vbaProject.bin"))
    return { ok: false, error: "type" };
  const types = entries.find((entry) => entry.name === "[Content_Types].xml");
  if (types === undefined) return unreadable;
  const text = await contentTypes(bytes, types);
  if (text === undefined) return unreadable;
  // The workbook part's own content type (other defaults may name macro types).
  const workbook = /<Override\b[^>]*PartName="\/xl\/workbook\.xml"[^>]*>/i.exec(
    text,
  )?.[0];
  if (workbook !== undefined && /macroEnabled/i.test(workbook))
    return { ok: false, error: "type" };
  return { ok: true };
}
