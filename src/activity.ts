import type { Activity } from "./model";

export function concise(input: unknown): string {
  if (!input || typeof input !== "object") return String(input ?? "").slice(0, 240);
  const record = input as Record<string, unknown>;
  for (const field of ["label", "description", "command", "action", "prompt", "pattern", "path"]) {
    if (typeof record[field] === "string") return String(record[field]).slice(0, 240);
  }
  return Object.keys(record).slice(0, 8).join(", ");
}

export function textResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  const content = record.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.type === "text" ? item.text : "").join("\n");
  return typeof record.output === "string" ? record.output : "";
}

/** Only local artifact extensions; no broad command parsing or interpreting agent prose as actions. */
export function artifactPaths(value: unknown): string[] {
  const paths = new Set<string>();
  let budget = 120_000;
  const visit = (item: unknown, depth: number): void => {
    if (depth > 8 || budget <= 0) return;
    if (typeof item === "string") {
      const text = item.slice(0, Math.min(budget, 24_000)).replace(/https?:\/\/[^\s"'<>]+/gi, "");
      budget -= text.length;
      // Quoted paths may contain spaces; then unquoted path-shaped tokens.
      for (const match of text.matchAll(/["']([^"'\n]+\.(?:ldr|mpd|png|jpe?g|webp))["']|((?:file:\/\/|\/|\.\/|~\/|[a-zA-Z0-9_-]+\/)[^\s"'<>`|;]*\.(?:ldr|mpd|png|jpe?g|webp))/gi)) {
        const path = match[1] || match[2];
        if (!/^https?:/i.test(path) && !path.includes("\0")) paths.add(path);
      }
    } else if (Array.isArray(item)) item.slice(0, 50).forEach((v) => visit(v, depth + 1));
    else if (item && typeof item === "object") {
      for (const [key, v] of Object.entries(item).slice(0, 50)) {
        if (!/token|password|secret|authorization|base64/i.test(key)) visit(v, depth + 1);
      }
    }
  };
  visit(value, 0);
  return [...paths].slice(0, 50);
}

export function resultFailed(result: unknown): boolean {
  if (!result || typeof result !== "object") return false;
  const record = result as Record<string, unknown>;
  if (record.isError === true || record.ok === false) return true;
  const metadata = record.metadata as Record<string, unknown> | undefined;
  if (typeof metadata?.exit === "number" && metadata.exit !== 0) return true;
  if (typeof metadata?.exitCode === "number" && metadata.exitCode !== 0) return true;
  if (record.output && typeof record.output === "object") {
    const output = record.output as Record<string, unknown>;
    if (output.ok === false || output.isError === true || (typeof output.exitCode === "number" && output.exitCode !== 0)) return true;
  }
  // SuperBrick's stdio MCP front-end returns a JSON reply as text.
  for (const line of textResult(result).split("\n")) {
    try { if (JSON.parse(line)?.ok === false) return true; } catch { /* Ordinary text. */ }
  }
  return false;
}

export class ActivityLog {
  private sessions = new Map<string, Activity[]>();
  private parents = new Map<string, string>();
  parent(sessionID: string, parentID: string): void {
    this.parents.set(sessionID, parentID);
    if (this.parents.size > 400) this.parents.delete(this.parents.keys().next().value!);
  }
  before(event: { id: string; sessionID: string; agent: string; tool: string; input: unknown }): void {
    const list = this.sessions.get(event.sessionID) || [];
    list.push({
      id: event.id, sessionID: event.sessionID, agent: event.agent, tool: event.tool,
      status: "running", summary: concise(event.input), detail: "", started: Date.now(), ended: 0,
      paths: artifactPaths(event.input), images: [],
    });
    this.sessions.delete(event.sessionID);
    this.sessions.set(event.sessionID, list.slice(-160));
    // Bound memory across sessions as well as within each session.
    if (this.sessions.size > 40) this.sessions.delete(this.sessions.keys().next().value!);
  }
  after(event: { id: string; sessionID: string; agent: string; tool: string; input: unknown; status: string; result?: unknown; error?: { message: string } }): void {
    if (!this.sessions.get(event.sessionID)?.some((entry) => entry.id === event.id)) this.before(event);
    const entry = this.sessions.get(event.sessionID)!.find((record) => record.id === event.id)!;
    entry.status = event.status === "error" || resultFailed(event.result) ? "error" : "completed";
    entry.ended = Date.now();
    // Do not duplicate entire shell outputs, prompts, source files or credentials into another persistent log.
    entry.detail = event.status === "error" ? (event.error?.message || "Tool failed").slice(0, 1_200)
      : entry.status === "error" ? textResult(event.result).slice(0, 1_200) || "Tool reported failure. See the original result in the conversation." : "";
    entry.paths = [...new Set([...entry.paths, ...artifactPaths(event.result)])].slice(0, 60);
    const content = event.result && typeof event.result === "object" ? (event.result as { content?: unknown }).content : undefined;
    if (Array.isArray(content)) entry.images = content
      .filter((c) => c.type === "file" && /^image\/(png|jpeg|webp)$/.test(c.mime) && typeof c.uri === "string")
      .map((c) => c.uri).filter((uri) => uri.startsWith("data:image/") && uri.length < 2_000_000).slice(0, 2);
    let imageBytes = 0;
    for (const record of [...this.sessions.values()].flat().sort((a, b) => b.started - a.started)) {
      record.images = record.images.filter((image) => {
        imageBytes += image.length;
        return imageBytes <= 8_000_000;
      });
    }
  }
  list(sessionID: string): Activity[] {
    const included = new Set([sessionID]);
    // Include real descendant sessions, not arbitrary background-task IDs.
    for (let depth = 0; depth < 16; depth++) {
      let changed = false;
      for (const [child, parent] of this.parents) if (included.has(parent) && !included.has(child)) { included.add(child); changed = true; }
      if (!changed) break;
    }
    return [...included].flatMap((id) => this.sessions.get(id) || []).sort((a, b) => a.started - b.started).slice(-160);
  }
}
