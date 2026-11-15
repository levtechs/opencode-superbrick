import { open, type FileHandle } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

interface Entry { offset: number; compressed: number; size: number; method: number; flags: number }
const MAX_PART = 8 * 1024 * 1024;
function integer(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ZIP offset exceeds safe integer range");
  return Number(value);
}

/** Read-only ZIP/ZIP64 index. No extraction, workers or eager Node initialization. */
export class ReadonlyZip {
  readonly entries = new Map<string, Entry>();
  private constructor(private file: FileHandle, private length: number) {}

  private async bytes(offset: number, size: number): Promise<Buffer> {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > this.length) throw new Error("Invalid ZIP bounds");
    const buffer = Buffer.allocUnsafe(size);
    let read = 0;
    while (read < size) {
      const result = await this.file.read(buffer, read, size - read, offset + read);
      if (!result.bytesRead) throw new Error("Truncated ZIP");
      read += result.bytesRead;
    }
    return buffer;
  }

  static async open(path: string): Promise<ReadonlyZip> {
    const file = await open(path, "r");
    try {
      const zip = new ReadonlyZip(file, (await file.stat()).size);
      await zip.index();
      return zip;
    } catch (error) { await file.close(); throw error; }
  }

  private async index(): Promise<void> {
    const start = Math.max(0, this.length - 65_557);
    const tail = await this.bytes(start, this.length - start);
    let end = tail.length - 22;
    while (end >= 0 && !(tail.readUInt32LE(end) === 0x06054b50 && end + 22 + tail.readUInt16LE(end + 20) === tail.length)) end--;
    if (end < 0) throw new Error("LDraw library is not a complete ZIP");
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw new Error("Multi-disk ZIP libraries are unsupported");
    let count = tail.readUInt16LE(end + 10);
    let size = tail.readUInt32LE(end + 12);
    let offset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
      const locator = await this.bytes(start + end - 20, 20);
      if (locator.readUInt32LE(0) !== 0x07064b50 || locator.readUInt32LE(4) || locator.readUInt32LE(16) !== 1) throw new Error("Invalid ZIP64 locator");
      const record = await this.bytes(integer(locator.readBigUInt64LE(8)), 56);
      if (record.readUInt32LE(0) !== 0x06064b50 || record.readUInt32LE(16) || record.readUInt32LE(20)) throw new Error("Invalid ZIP64 directory");
      count = integer(record.readBigUInt64LE(32));
      size = integer(record.readBigUInt64LE(40));
      offset = integer(record.readBigUInt64LE(48));
    }
    if (size > 96 * 1024 * 1024 || count > 500_000) throw new Error("LDraw ZIP directory is too large");
    const directory = await this.bytes(offset, size);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > size || directory.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid ZIP central entry");
      const flags = directory.readUInt16LE(cursor + 8), method = directory.readUInt16LE(cursor + 10);
      let compressed = directory.readUInt32LE(cursor + 20), uncompressed = directory.readUInt32LE(cursor + 24), local = directory.readUInt32LE(cursor + 42);
      const nameLength = directory.readUInt16LE(cursor + 28), extraLength = directory.readUInt16LE(cursor + 30), commentLength = directory.readUInt16LE(cursor + 32);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > size) throw new Error("Truncated ZIP directory entry");
      const name = directory.toString("utf8", cursor + 46, cursor + 46 + nameLength).replaceAll("\\", "/").toLowerCase().replace(/^ldraw\//, "");
      if (compressed === 0xffffffff || uncompressed === 0xffffffff || local === 0xffffffff) {
        let found = false;
        for (let pos = cursor + 46 + nameLength, limit = pos + extraLength; pos + 4 <= limit;) {
          const tag = directory.readUInt16LE(pos), length = directory.readUInt16LE(pos + 2);
          if (pos + 4 + length > limit) throw new Error("Invalid ZIP extra field");
          if (tag === 1) {
            const extra = directory.subarray(pos + 4, pos + 4 + length);
            let index = 0;
            if (uncompressed === 0xffffffff) { uncompressed = integer(extra.readBigUInt64LE(index)); index += 8; }
            if (compressed === 0xffffffff) { compressed = integer(extra.readBigUInt64LE(index)); index += 8; }
            if (local === 0xffffffff) local = integer(extra.readBigUInt64LE(index));
            found = true; break;
          }
          pos += 4 + length;
        }
        if (!found) throw new Error("ZIP64 entry is missing its sizes");
      }
      if (!name.endsWith("/")) this.entries.set(name, { offset: local, compressed, size: uncompressed, method, flags });
      cursor = next;
    }
  }

  async read(entry: Entry): Promise<string> {
    if (entry.flags & 1) throw new Error("Encrypted library parts are unsupported");
    if (entry.size > MAX_PART || entry.compressed > MAX_PART * 2) throw new Error("Library part exceeds 8 MB");
    if (entry.method !== 0 && entry.method !== 8) throw new Error("Unsupported library ZIP compression");
    const header = await this.bytes(entry.offset, 30);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("Invalid ZIP local header");
    const data = await this.bytes(entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28), entry.compressed);
    const output = entry.method === 0 ? data : inflateRawSync(data, { maxOutputLength: MAX_PART });
    if (output.length !== entry.size) throw new Error("Library part size mismatch");
    return output.toString("utf8");
  }

  close(): void { void this.file.close().catch(() => {}); }
}
