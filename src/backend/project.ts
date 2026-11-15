import { createHash } from "node:crypto";
import { access, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./process";
import type { ProjectInfo } from "../model";

// Read-only URI (NOT immutable: SQLite must include live WAL transactions).
// A read transaction makes the main revision and draft list a coherent snapshot.
export const METADATA_SCRIPT = String.raw`
import sqlite3, json, sys, os, pathlib, hashlib
p = pathlib.Path(sys.argv[1]).resolve(strict=True)
db = sqlite3.connect(p.as_uri() + "?mode=ro", uri=True, timeout=2)
db.execute("PRAGMA query_only=ON")
db.execute("BEGIN")
schema = db.execute("SELECT value FROM meta WHERE key='schema'").fetchone()
if not schema or int(schema[0]) != 1:
    raise RuntimeError("Unsupported SuperBrick schema; this plugin reads schema 1")
w = db.execute("SELECT tree,seq FROM working WHERE branch='main'").fetchone()
if not w: raise RuntimeError("Project has no main working tree")
rows = db.execute("SELECT json FROM drafts WHERE branch='main' ORDER BY id").fetchall()
drafts = []
for row in rows:
    d = json.loads(row[0]); t = d.get("touched", {})
    drafts.append(dict(id=d["id"], user=d["session"], label=d.get("label") or "",
        state=d["state"], created=len(t.get("created",[])), modified=len(t.get("modified",[])),
        removed=len(t.get("removed",[])), dependencies=d.get("dependencies",[]),
        reason=d.get("reason") or "", note=d.get("note") or ""))
lease = db.execute("SELECT pid,renewed FROM leases WHERE branch='main'").fetchone()
alive = False
if lease:
    try: os.kill(lease[0], 0); alive = True
    except ProcessLookupError: pass
    except PermissionError: alive = True
db.rollback(); db.close()
revision = hashlib.sha256(json.dumps([list(w),rows],sort_keys=True).encode()).hexdigest()
print(json.dumps(dict(revision=revision, drafts=drafts,
    builders=sorted(set(d["user"] for d in drafts)),
    editorOpen=alive, editorPID=lease[0] if alive else 0)))
`;

export function expandHome(path: string): string {
  return path === "~" ? homedir() : path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export async function existingFile(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export function cloudProject(path: string): boolean {
  return /[/\\]Library[/\\](Mobile Documents|CloudStorage)[/\\]/i.test(path);
}

export async function projectPath(path: string, directory: string): Promise<string> {
  const canonical = await realpath(resolve(directory, expandHome(path)));
  if (!canonical.toLowerCase().endsWith(".sb")) throw new Error("Choose a SuperBrick .sb project");
  if (cloudProject(canonical)) throw new Error("Live .sb projects in iCloud/CloudStorage are unsafe. Choose a local project copy.");
  return canonical;
}

export async function findPython(configured?: string): Promise<string> {
  if (configured) return expandHome(configured);
  for (const path of [
    process.env.SB_PYTHON,
    join(process.env.SB_SUPPORT_DIR || join(homedir(), "Library/Application Support/SuperBrick"), "python/bin/python3"),
    "/opt/homebrew/bin/python3", "/usr/local/bin/python3",
  ]) if (path && await existingFile(path)) return path;
  return "python3";
}

export async function findBinary(configured?: string): Promise<string> {
  if (configured) return expandHome(configured);
  for (const path of ["/Applications/SuperBrick.app/Contents/MacOS/sb", join(homedir(), ".local/bin/sb")]) {
    if (await existingFile(path)) return path;
  }
  return "sb";
}

export async function readProject(path: string, python: string, signal?: AbortSignal): Promise<ProjectInfo> {
  const info = JSON.parse(await run(python, ["-c", METADATA_SCRIPT, path], { signal, timeout: 8_000 }));
  if (!info || typeof info.revision !== "string" || !Array.isArray(info.drafts)) throw new Error("Invalid project metadata");
  return info as ProjectInfo;
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
