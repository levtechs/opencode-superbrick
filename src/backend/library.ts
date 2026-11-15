import { readFile, realpath, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { existingFile, expandHome } from "./project";
import { ReadonlyZip } from "./zip";

const MAX_MODEL = 32 * 1024 * 1024;

export function normalized(name: string): string {
  const value = name.trim().replaceAll("\\", "/").toLowerCase().replace(/^\.\/+/, "");
  if (!value || value.startsWith("/") || value.split("/").includes("..") || /[:\0]/.test(value)) {
    throw new Error(`Unsafe LDraw reference: ${name.slice(0, 120)}`);
  }
  return value;
}

export function references(text: string): string[] {
  const refs = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*1\s+(?:\S+\s+){13}(.+?)\s*$/.exec(line);
    if (match) refs.add(normalized(match[1]));
  }
  return [...refs];
}

export function embeddedFiles(text: string): Set<string> {
  return new Set([...text.matchAll(/^\s*0\s+FILE\s+(.+?)\s*$/gim)].map((m) => normalized(m[1])));
}

function loaderName(name: string): string {
  const key = normalized(name);
  return key.startsWith("s/") ? `parts/${key}` : key.startsWith("48/") ? `p/${key}` : key;
}

export interface PackedModel {
  text: string;
  warnings: string[];
  parts: number;
  steps: number;
}

/** Resolve the same ZIP-first library hierarchy as SuperBrick, without extracting the library. */
export class PartsLibrary {
  private zip?: ReadonlyZip;
  private extras = new Map<string, string>();
  private cache = new Map<string, string>();
  private opening?: Promise<void>;
  private closed = false;

  constructor(private options: { libraryPath?: string; extraPaths?: string[] } = {}) {}

  private async initialize(): Promise<void> {
    const support = process.env.SB_SUPPORT_DIR || join(homedir(), "Library/Application Support/SuperBrick");
    const candidates = [
      this.options.libraryPath, process.env.SB_LDRAW_ZIP, process.env.BENCH_LDRAW_ZIP,
      join(support, "ldraw/complete.zip"),
      ...(process.env.SB_NO_LEOCAD ? [] : ["/Applications/LeoCAD.app/Contents/Resources/library.bin"]),
    ];
    let path = "";
    for (const item of candidates) if (item && await existingFile(expandHome(item))) { path = expandHome(item); break; }
    if (!path) throw new Error("LDraw library not found. Run `sb setup --library`, or configure libraryPath.");
    this.zip = await ReadonlyZip.open(path);
    if (this.closed) { this.zip?.close(); throw new Error("Library was closed"); }
    const extras = this.options.extraPaths ?? (process.env.BENCH_LDRAW_EXTRA || "").split(sep === "/" ? ":" : ";").filter(Boolean);
    const visit = async (root: string, dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await visit(root, path);
        else if (entry.isFile() && /\.(dat|ldr|mpd)$/i.test(path)) {
          const name = relative(root, path).replaceAll(sep, "/").toLowerCase().replace(/^ldraw\//, "");
          if (!this.zip!.entries.has(name) && !this.extras.has(name)) this.extras.set(name, path);
        }
      }
    };
    for (const dir of extras) await visit(expandHome(dir), expandHome(dir));
  }

  async read(name: string): Promise<string | undefined> {
    this.opening ??= this.initialize();
    await this.opening;
    const key = normalized(name);
    const candidates = [key, `parts/${key}`, `p/${key}`, `models/${key}`];
    const found = candidates.find((item) => this.zip!.entries.has(item)) ?? candidates.find((item) => this.extras.has(item));
    if (!found) return undefined;
    if (this.cache.has(found)) return this.cache.get(found)!;
    const entry = this.zip!.entries.get(found);
    let text: string;
    if (entry) {
      text = await this.zip!.read(entry);
    } else text = await readFile(this.extras.get(found)!, "utf8");
    this.cache.set(found, text);
    return text;
  }

  async pack(source: string, sourcePath: string): Promise<PackedModel> {
    if (Buffer.byteLength(source) > MAX_MODEL) throw new Error("Preview model exceeds 32 MB");
    const colors = await this.read("LDConfig.ldr");
    const embedded = embeddedFiles(source);
    const seen = new Set([...embedded].map(loaderName));
    const warnings: string[] = [];
    const dependencies: string[] = [];
    const root = await realpath(dirname(sourcePath));
    let bytes = source.length;
    const visit = async (name: string): Promise<void> => {
      if (seen.has(loaderName(name))) return;
      seen.add(loaderName(name));
      if (seen.size > 12_000) throw new Error("Preview has too many dependencies");
      let text = await this.read(name);
      if (text === undefined) {
        const candidate = resolve(root, name);
        try {
          const canonical = await realpath(candidate);
          if (relative(root, canonical).startsWith("..") || !canonical.startsWith(root + sep)) throw new Error("Outside preview directory");
          text = await readFile(canonical, "utf8");
        } catch { /* Missing parts are reported below, never fetched from the network. */ }
      }
      if (text === undefined) {
        warnings.push(`Missing part: ${name}`);
        // Cache an empty definition so LDrawLoader never tries an HTTP fallback.
        dependencies.push(`0 FILE ${name}\n0 Missing part: ${name}\n0 NOFILE`);
        return;
      }
      bytes += text.length;
      if (bytes > 96 * 1024 * 1024) throw new Error("Packed preview exceeds 96 MB");
      dependencies.push(`0 FILE ${name}\n${text}\n0 NOFILE`);
      for (const ref of references(text)) await visit(ref);
    };
    for (const ref of references(source)) await visit(ref);
    const config = (colors || "").split(/\r?\n/).filter((line) => /^0\s+!COLOUR\b/.test(line)).join("\n");
    const lines = source.split(/\r?\n/);
    const firstFile = lines.findIndex((line) => /^\s*0\s+FILE\s+.+$/i.test(line));
    // Three.js treats an MPD FILE directive as the root only at line zero.
    // SuperBrick exports may have comments or blank lines before that directive.
    const main = firstFile >= 0
      ? [lines[firstFile].trim(), config, ...lines.slice(0, firstFile), ...lines.slice(firstFile + 1)].join("\n")
      : `0 FILE __superbrick_preview__.ldr\n${config}\n${source}\n0 NOFILE`;
    const canonical = `${main}\n${dependencies.join("\n")}`
      .replace(/^[ \t]*0[ \t]+FILE[ \t]+(.+?)[ \t]*$/gim, (_line, file: string) => `0 FILE ${loaderName(file)}`)
      .replace(/^([ \t]*1[ \t]+(?:\S+[ \t]+){13})(.+?)[ \t]*$/gm, (_line, prefix: string, file: string) => `${prefix}${loaderName(file)}`);
    return {
      text: canonical,
      warnings,
      parts: source.split(/\r?\n/).filter((line) => /^\s*1\s/.test(line)).length,
      steps: source.split(/\r?\n/).filter((line) => /^\s*0\s+(STEP|ROTSTEP)\b/i.test(line)).length + 1,
    };
  }

  close(): void { this.closed = true; this.zip?.close(); this.cache.clear(); }
}
