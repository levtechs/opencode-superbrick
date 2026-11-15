import { mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultBinding, emptyProject, errorText, validBuilder } from "../model";
import type { Artifact, Binding, BuildState, Preview, Scope } from "../model";
import { PartsLibrary } from "./library";
import { digest, expandHome, projectPath, readProject } from "./project";
import { run } from "./process";

export interface BuildOptions {
  sb: string;
  python: string;
  library: PartsLibrary;
  signal?: AbortSignal;
  pollMs?: number;
}

export function decisionAllowed(state: BuildState, ids: readonly number[], revision: string, action: string): void {
  if (!state.binding.project) throw new Error("Choose a project first");
  if (state.project.editorOpen) throw new Error("Close this project in SuperBrick before deciding proposals here (native editor conflict safety).");
  if (state.project.revision !== revision) throw new Error("The project changed. Review the refreshed proposals before deciding.");
  if (!ids.length || ids.length > 200 || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("Choose specific proposal IDs");
  for (const id of ids) {
    const draft = state.project.drafts.find((d) => d.id === id);
    if (!draft || !(action === "accept" ? draft.state === "pending" : ["pending", "stale", "blocked"].includes(draft.state))) {
      throw new Error(`Proposal #${id} is no longer eligible for ${action}`);
    }
  }
}

export class Build {
  readonly state: BuildState;
  private preview?: Preview;
  private scratch?: string;
  private timer?: ReturnType<typeof setInterval>;
  private debounce?: ReturnType<typeof setTimeout>;
  private watchers: FSWatcher[] = [];
  private controller = new AbortController();
  private generation = 0;
  private refreshing?: Promise<void>;
  private again = false;
  private forceAgain = false;
  private scanTime = 0;
  private known = new Map<string, Artifact>();
  private closed = false;
  private deciding = false;

  constructor(
    readonly scope: Scope,
    binding: Binding,
    private options: BuildOptions,
    private changed: () => void = () => {},
  ) {
    this.state = {
      binding, project: emptyProject(), previewRevision: "", previewSource: "",
      busy: false, error: "", updated: 0, artifacts: [],
    };
    options.signal?.addEventListener("abort", () => this.controller.abort(), { once: true });
  }

  start(): void {
    if (this.timer || this.closed) return;
    this.installWatchers();
    this.timer = setInterval(() => void this.refresh(), this.options.pollMs ?? 2_000);
    this.timer.unref?.();
    void this.refresh();
  }

  private installWatchers(): void {
    this.watchers.forEach((watcher) => watcher.close());
    this.watchers = [];
    const { project, runDirectory, generated } = this.state.binding;
    const dirs = new Map<string, boolean>();
    if (project) dirs.set(dirname(project), false);
    if (generated) dirs.set(dirname(generated), false);
    if (runDirectory) dirs.set(runDirectory, true);
    for (const [dir, recursive] of dirs) {
      try {
        const watcher = watch(dir, { recursive }, (_event, name) => {
          const filename = String(name || "");
          if (!recursive && project && dir === dirname(project)
            && ![basename(project), `${basename(project)}-wal`, `${basename(project)}-shm`, basename(generated)].includes(filename)) return;
          clearTimeout(this.debounce);
          this.debounce = setTimeout(() => { this.scanTime = 0; void this.refresh(); }, 250);
        });
        watcher.on("error", () => {}); // Polling reconciles when OS watches are unavailable.
        this.watchers.push(watcher);
      } catch { /* Reconciliation timer is the fallback. */ }
    }
  }

  async configure(binding: Binding): Promise<void> {
    if (this.deciding) throw new Error("A proposal decision is in progress");
    if (!validBuilder(binding.builder)) throw new Error("Builder must be 1–32 letters/digits/._- and cannot be human");
    const next = { ...binding };
    if (next.project) next.project = await projectPath(next.project, this.scope.directory);
    if (next.generated) {
      next.generated = await realpath(resolve(this.scope.directory, expandHome(next.generated)));
      if (!/\.(ldr|mpd)$/i.test(next.generated)) throw new Error("Generated previews must be .ldr or .mpd files");
    }
    if (next.runDirectory) {
      next.runDirectory = await realpath(resolve(this.scope.directory, expandHome(next.runDirectory)));
      if (!(await stat(next.runDirectory)).isDirectory()) throw new Error("Run folder must be a directory");
    }
    this.generation++;
    this.state.binding = next;
    this.state.project = emptyProject();
    this.state.previewRevision = "";
    this.state.previewSource = "";
    this.state.error = "";
    this.preview = undefined;
    this.known.clear();
    this.state.artifacts = [];
    this.scanTime = 0;
    this.installWatchers();
    this.changed();
    await this.refresh(true);
  }

  async refresh(force = false): Promise<void> {
    if (this.closed) return;
    if (this.refreshing) {
      this.again = true;
      this.forceAgain ||= force;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      let forced = force;
      do {
        this.again = false;
        await this.update(forced);
        forced = this.forceAgain;
        this.forceAgain = false;
      } while (this.again && !this.closed);
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async update(force: boolean): Promise<void> {
    const generation = this.generation;
    const binding = { ...this.state.binding };
    const signal = AbortSignal.any([this.controller.signal, ...(this.options.signal ? [this.options.signal] : [])]);
    try {
      let project = emptyProject();
      if (binding.project) project = await readProject(binding.project, this.options.python, signal);
      if (generation !== this.generation || this.closed) return;
      const old = JSON.stringify(this.state.project);
      this.state.project = project;
      await this.scan();
      let path = binding.generated;
      if (binding.view === "generated" && !path) path = this.state.artifacts.find((a) => a.kind === "model")?.path || "";
      const source = binding.view === "generated" ? path : binding.project;
      if (!source) {
        this.state.error = binding.view === "generated" ? "Choose a generated model or a run folder to follow." : "";
        this.changed();
        return;
      }
      const signature = binding.view === "generated"
        ? `${path}:${(await stat(path)).mtimeMs}:${(await stat(path)).size}`
        : `${binding.project}:${project.revision}:${binding.view}:${binding.builder}`;
      if (!force && this.preview?.source === signature) {
        this.state.error = "";
        if (old !== JSON.stringify(project)) this.changed();
        return;
      }
      this.state.busy = true;
      this.changed();
      let modelPath = path;
      if (binding.view !== "generated") {
        this.scratch ??= await mkdtemp(join(tmpdir(), "opencode-superbrick-"));
        modelPath = join(this.scratch, `snapshot-${digest(signature)}.ldr`);
        // If the selected builder has no pending drafts, use the genuinely read-only human export.
        // Nonhuman direct export bypasses human_news, but first-visit observation setup may write.
        const hasDrafts = binding.view === "builder" && project.drafts.some((d) => d.user === binding.builder && d.state === "pending");
        const args = [binding.project, "--user", hasDrafts ? binding.builder : "human", "export", "-o", modelPath, "--force"];
        await run(this.options.sb, args, { signal, timeout: 60_000 });
      }
      const sourceText = await readFile(modelPath, "utf8");
      const packed = await this.options.library.pack(sourceText, modelPath);
      if (generation !== this.generation || this.closed) return;
      // Do not label an export with metadata from a different commit/draft revision.
      if (binding.project && binding.view !== "generated") {
        const after = await readProject(binding.project, this.options.python, signal);
        if (after.revision !== project.revision) { this.again = true; return; }
        this.state.project = after;
      }
      const preview: Preview = {
        revision: digest(packed.text), source: signature,
        label: binding.view === "generated" ? `Generated preview — not proposed: ${path}`
          : binding.view === "accepted" ? "Accepted main" : `Accepted main + ${binding.builder}'s pending proposals`,
        packed: packed.text, warnings: packed.warnings, parts: packed.parts, steps: packed.steps,
      };
      this.preview = preview;
      this.state.previewRevision = preview.revision;
      this.state.previewSource = binding.view === "generated" ? path : binding.project;
      this.state.updated = Date.now();
      this.state.error = "";
      // Keep only the current exported snapshot; the packed preview is already in memory.
      if (this.scratch) for (const file of await readdir(this.scratch)) {
        if (file !== basename(modelPath)) await rm(join(this.scratch, file), { force: true });
      }
    } catch (error) {
      if (generation === this.generation && !this.closed) this.state.error = errorText(error);
    } finally {
      if (generation === this.generation) this.state.busy = false;
      if (!this.closed) this.changed();
    }
  }

  snapshot(): Preview | undefined { return this.preview; }

  private async scan(): Promise<void> {
    if (Date.now() - this.scanTime < 5_000) return;
    this.scanTime = Date.now();
    let visited = 0;
    const visit = async (dir: string, depth: number): Promise<void> => {
      if (depth > 6 || visited > 5_000) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (++visited > 5_000) break;
        if (entry.name.startsWith(".") || ["node_modules", "target"].includes(entry.name)) continue;
        const path = join(dir, entry.name);
        try {
          if (entry.isDirectory()) await visit(path, depth + 1);
          else if (entry.isFile()) await this.addArtifact(path);
        } catch { /* Generators may replace files/directories while we scan. */ }
      }
    };
    if (this.state.binding.runDirectory) await visit(this.state.binding.runDirectory, 0);
    for (const path of this.known.keys()) {
      try { await this.addArtifact(path); } catch { this.known.delete(path); }
    }
    this.state.artifacts = [...this.known.values()].sort((a, b) => b.modified - a.modified).slice(0, 100);
  }

  private async addArtifact(path: string): Promise<void> {
    const extension = extname(path).toLowerCase();
    const kind = [".ldr", ".mpd"].includes(extension) ? "model"
      : [".png", ".jpg", ".jpeg", ".webp"].includes(extension) ? "image" : undefined;
    if (!kind) return;
    const info = await stat(path);
    if (info.isFile()) this.known.set(path, { path, kind, modified: info.mtimeMs });
  }

  async discover(paths: readonly string[]): Promise<void> {
    const before = JSON.stringify(this.state.artifacts);
    for (const path of paths.slice(0, 100)) {
      try {
        const absolute = path.startsWith("file:") ? fileURLToPath(path) : resolve(this.scope.directory, expandHome(path));
        await this.addArtifact(absolute);
      } catch { /* Tool paths are hints, not trusted file existence assertions. */ }
    }
    this.state.artifacts = [...this.known.values()].sort((a, b) => b.modified - a.modified).slice(0, 100);
    if (before !== JSON.stringify(this.state.artifacts)) this.changed();
  }

  async image(path: string): Promise<string> {
    if (!this.state.artifacts.some((a) => a.kind === "image" && a.path === path)) throw new Error("Image is not a discovered build artifact");
    const info = await stat(path);
    if (info.size > 12 * 1024 * 1024) throw new Error("Image exceeds 12 MB");
    const mime = extname(path).toLowerCase() === ".webp" ? "image/webp" : /\.jpe?g$/i.test(path) ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
  }

  async decide(action: "accept" | "reject", ids: readonly number[], note: string, revision: string): Promise<string> {
    if (this.deciding) throw new Error("A proposal decision is already in progress");
    this.deciding = true;
    try {
      const fresh = await readProject(this.state.binding.project, this.options.python, this.controller.signal);
      this.state.project = fresh;
      decisionAllowed(this.state, ids, revision, action);
      const output = await run(this.options.sb, [
        this.state.binding.project, "--user", "human", "--no-images", "project",
        JSON.stringify({ action, ids: [...new Set(ids)], ...(action === "reject" ? { note: note.slice(0, 4_000) } : {}) }),
      ], { signal: this.controller.signal, timeout: 60_000 });
      const reply = JSON.parse(output);
      if (!reply.ok) throw new Error(reply.text || `${action} failed`);
      return String(reply.text || "Decision saved");
    } finally { this.deciding = false; await this.refresh(true); }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.controller.abort();
    clearInterval(this.timer);
    clearTimeout(this.debounce);
    this.watchers.forEach((watcher) => watcher.close());
    await this.refreshing;
    if (this.scratch) await rm(this.scratch, { recursive: true, force: true });
  }
}
