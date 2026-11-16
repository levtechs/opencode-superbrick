import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import type { IpcClient } from "@opencode/plugin/gui";
import type { Bridge } from "./contract";
import { icon } from "./logo";
import { defaultBinding, emptyProject, errorText } from "./model";
import type { Activity, Artifact, Binding, BuildState, Draft, Preview, Scope } from "./model";
import { styles } from "./styles";
import { ViewCube } from "./viewcube";
import { Viewport, type CameraState } from "./viewport";

type Client = Pick<IpcClient<typeof Bridge.spec>, "watch" | "release" | "status" | "preview" | "configure" | "refresh" | "choose" | "open" | "decide" | "discover" | "image" | "on">;
type DockTab = "agents" | "activity" | "artifacts" | "project";

const cameras = new Map<string, CameraState>();
const thumbCache = new Map<string, string>();
const name = (path: string) => path.split(/[\\/]/).at(-1) || path;
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const OPEN_STATES = ["pending", "stale", "blocked"];

/** Small isometric brick, used for model tiles. */
const BrickGlyph = () => <svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M8 26 32 14l24 12-24 12Z" fill="#d6a12a" />
  <path d="M8 26v16l24 12V38Z" fill="#a87a14" />
  <path d="M56 26v16L32 54V38Z" fill="#7d5a0c" />
  <ellipse cx="25" cy="24" rx="6" ry="3" fill="#ffffff40" /><ellipse cx="39" cy="24" rx="6" ry="3" fill="#ffffff40" />
  <ellipse cx="32" cy="20" rx="6" ry="3" fill="#ffffff30" /><ellipse cx="32" cy="28" rx="6" ry="3" fill="#ffffff30" />
</svg>;
/** egui_dock's tab close cross. */
const Cross = () => <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" stroke-width="1.2" /></svg>;
const Chevron = (p: { down?: boolean }) => <svg viewBox="0 0 12 8" aria-hidden="true"><path d={p.down ? "M1.5 1.5 6 6l4.5-4.5" : "M1.5 6.5 6 2l4.5 4.5"} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>;

export function BuildUI(props: {
  bridge: Client;
  scope: () => Scope;
  local: () => boolean;
  background: () => readonly string[];
  activity: (scope: Scope, signal: AbortSignal) => Promise<Activity[]>;
  insert: (text: string) => void;
}) {
  const [state, setState] = createSignal<BuildState>({
    binding: defaultBinding(), project: emptyProject(), previewRevision: "", previewSource: "",
    busy: false, error: "", updated: 0, artifacts: [],
  });
  const [preview, setPreview] = createSignal<Preview>();
  const [activity, setActivity] = createSignal<Activity[]>([]);
  const [activityError, setActivityError] = createSignal("");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [form, setForm] = createSignal(defaultBinding());
  const [tab, setTab] = createSignal<DockTab>("agents");
  const [drawer, setDrawer] = createSignal(false);
  const [selected, setSelected] = createSignal<number[]>([]);
  const [bulk, setBulk] = createSignal<{ action: "accept" | "reject"; ids: number[]; revision: string }>();
  const [rejecting, setRejecting] = createSignal<number>();
  const [note, setNote] = createSignal("");
  const [working, setWorking] = createSignal(false);
  const [lightbox, setLightbox] = createSignal<{ path: string; data: string }>();
  const [thumbs, setThumbs] = createSignal<Record<string, string>>({});
  const [showRecent, setShowRecent] = createSignal(false);
  const [renderError, setRenderError] = createSignal("");
  const [rendering, setRendering] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [ortho, setOrtho] = createSignal(false);
  const [edges, setEdges] = createSignal(true);
  const [steps, setSteps] = createSignal(1);
  const [step, setStep] = createSignal(1);
  const [dockHeight, setDockHeight] = createSignal(230);
  const [dragging, setDragging] = createSignal(false);
  const [viewportVersion, setViewportVersion] = createSignal(0);
  let root!: HTMLElement;
  let cubeUpdate: ((view: ArrayLike<number>) => void) | undefined;
  let canvas!: HTMLDivElement;
  let viewport: Viewport | undefined;
  let reload: (() => Promise<void>) | undefined;
  let adopted = false;

  const session = createMemo(() => props.scope());
  const binding = () => state().binding;
  const project = () => state().project;
  const cameraKey = createMemo(() => {
    const b = binding();
    return JSON.stringify([session().key, b.project, b.view, b.builder, b.generated]);
  });
  const open = createMemo(() => project().drafts.filter((d) => OPEN_STATES.includes(d.state)));
  const pending = createMemo(() => open().filter((d) => d.state === "pending"));
  const recent = createMemo(() => project().drafts.filter((d) => !OPEN_STATES.includes(d.state)).slice(-8).reverse());
  const manyUsers = createMemo(() => new Set(project().drafts.map((d) => d.user)).size > 1);
  const images = createMemo(() => state().artifacts.filter((a) => a.kind === "image"));
  const locked = () => working() || project().editorOpen || !props.local();
  const field = (key: keyof Binding, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const current = (key: string) => session().key === key;
  const showTab = (next: DockTab) => { setTab(next); setDrawer(true); };

  onMount(() => setMounted(true));

  // One owner per routed session. Abort old replies, release watchers, reset artifacts and confirmations.
  createEffect(() => {
    const scope = session();
    const local = props.local();
    const controller = new AbortController();
    let polling = false;
    let lastPreview = "";
    let discoveries = "";
    let first = true;
    adopted = false;
    setPreview(undefined); setActivity([]); setLightbox(undefined); setSelected([]); setBulk(undefined); setRejecting(undefined);
    setError(""); setNotice(""); setActivityError(""); setWorking(false); setRendering(false);
    setState({ binding: defaultBinding(), project: emptyProject(), previewRevision: "", previewSource: "", busy: false, error: "", updated: 0, artifacts: [] });
    const poll = async () => {
      if (polling || controller.signal.aborted || !local) return;
      polling = true;
      try {
        const json = first
          ? await props.bridge.watch(scope, { signal: controller.signal })
          : await props.bridge.status(scope, { signal: controller.signal });
        if (controller.signal.aborted || !current(scope.key)) return;
        const next = JSON.parse(json) as BuildState;
        const before = state().binding;
        setState(next);
        // Keep the Project form in step when the backend connects itself to the agent's project.
        if (first || before.project !== next.binding.project || before.runDirectory !== next.binding.runDirectory) setForm({ ...next.binding });
        first = false;
        if (next.previewRevision !== lastPreview) {
          const raw = await props.bridge.preview(scope, { signal: controller.signal });
          if (controller.signal.aborted || !current(scope.key)) return;
          setPreview(JSON.parse(raw) || undefined);
          lastPreview = next.previewRevision;
        }
        try {
          const entries = await props.activity(scope, controller.signal);
          if (controller.signal.aborted || !current(scope.key)) return;
          setActivity(entries); setActivityError("");
          const paths = [...new Set(entries.flatMap((entry) => entry.paths))].slice(-100);
          const signature = JSON.stringify(paths);
          if (signature !== discoveries) {
            discoveries = signature;
            await props.bridge.discover({ scope, paths }, { signal: controller.signal });
          }
        } catch (cause) {
          if (!controller.signal.aborted) setActivityError(`Activity unavailable: ${errorText(cause)}`);
        }
      } catch (cause) {
        if (!controller.signal.aborted && current(scope.key)) setError(errorText(cause));
      } finally { polling = false; }
    };
    reload = poll;
    const unsubscribe = props.bridge.on("updated", (event) => { if (event.key === scope.key) void poll(); });
    void poll();
    const timer = setInterval(() => void poll(), 1_000);
    onCleanup(() => {
      controller.abort();
      clearInterval(timer);
      unsubscribe();
      void props.bridge.release(scope).catch(() => {});
      if (reload === poll) reload = undefined;
    });
  });

  // One viewport per (session, project, view, builder, generated); camera survives across switches.
  createEffect(() => {
    if (!mounted()) return;
    const key = cameraKey();
    setRenderError("");
    try {
      const view = new Viewport(canvas, (camera) => {
        cameras.set(key, camera);
        if (cameras.size > 80) cameras.delete(cameras.keys().next().value!);
      }, cameras.get(key));
      viewport = view;
      view.onFrame = (matrix) => cubeUpdate?.(matrix);
      setOrtho(view.ortho);
      view.showEdges(untrack(edges));
      setViewportVersion((version) => version + 1);
      onCleanup(() => { view.dispose(); if (viewport === view) viewport = undefined; });
    } catch (cause) { setRenderError(`3D preview unavailable: ${errorText(cause)}`); }
  });
  createEffect(() => {
    viewportVersion();
    const model = preview();
    const view = viewport;
    let alive = true;
    if (model && view) {
      setRendering(true); setRenderError("");
      void view.load(model.packed).then((count) => {
        if (!alive) return;
        setSteps(count); setStep(view.currentStep);
      }).catch((cause) => {
        if (alive) setRenderError(errorText(cause));
      }).finally(() => { if (alive) setRendering(false); });
    }
    onCleanup(() => { alive = false; });
  });

  // Image artifact thumbnails, loaded lazily through the bridge with a bounded cache.
  createEffect(() => {
    if (tab() !== "artifacts") return;
    const scope = session();
    const wanted = images().slice(0, 24);
    let alive = true;
    void (async () => {
      for (const artifact of wanted) {
        const key = `${artifact.path}@${artifact.modified}`;
        if (!alive) return;
        if (untrack(thumbs)[key]) continue;
        let data = thumbCache.get(key);
        if (!data) {
          try { data = await props.bridge.image({ scope, path: artifact.path }); }
          catch { continue; }
          thumbCache.set(key, data);
          if (thumbCache.size > 48) thumbCache.delete(thumbCache.keys().next().value!);
        }
        if (alive && current(scope.key)) setThumbs((all) => ({ ...all, [key]: data! }));
      }
    })();
    onCleanup(() => { alive = false; });
  });

  // Decision results are transient status-bar text, not a banner.
  createEffect(() => {
    if (!notice()) return;
    const timer = setTimeout(() => setNotice(""), 8_000);
    onCleanup(() => clearTimeout(timer));
  });

  const act = async (action: () => Promise<void>) => {
    if (working()) return;
    const key = session().key;
    setWorking(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { if (current(key)) setError(errorText(cause)); }
    finally { if (current(key)) { setWorking(false); await reload?.(); } }
  };
  const configure = async (next: Binding) => {
    const scope = session();
    const result = JSON.parse(await props.bridge.configure({ scope, binding: next })) as BuildState;
    if (!current(scope.key)) return;
    setState(result); setForm({ ...result.binding }); setSelected([]); setBulk(undefined); setRejecting(undefined);
    const model = JSON.parse(await props.bridge.preview(scope)) as Preview | null;
    if (current(scope.key)) setPreview(model || undefined);
  };

  // When the project has exactly one builder and ours has never proposed anything, follow that builder
  // instead of asking the user to fix a name mismatch. Several builders get a picker in the toolbar.
  createEffect(() => {
    const b = binding();
    const builders = project().builders;
    if (adopted || working() || !b.project || builders.length !== 1 || builders.includes(b.builder)) return;
    if (project().drafts.some((d) => d.user === b.builder)) return;
    adopted = true;
    void act(() => configure({ ...b, builder: builders[0] }));
  });

  const choose = (kind: "project" | "model" | "directory") => act(async () => {
    const scope = session();
    const path = await props.bridge.choose({ scope, kind });
    if (!path || !current(scope.key)) return;
    field(kind === "project" ? "project" : kind === "model" ? "generated" : "runDirectory", path);
    if (kind === "model") field("view", "generated");
  });
  const switchView = (view: Binding["view"], builder = binding().builder) => {
    if (view !== binding().view || builder !== binding().builder) void act(() => configure({ ...binding(), view, builder }));
  };
  const decide = (action: "accept" | "reject", ids: number[], revision = project().revision, text = "") => act(async () => {
    const scope = session();
    const result = await props.bridge.decide({ scope, action, ids, note: text, revision });
    if (!current(scope.key)) return;
    setBulk(undefined); setRejecting(undefined); setNote("");
    setSelected((all) => all.filter((id) => !ids.includes(id)));
    setNotice(result);
  });
  const showImage = (path: string, modified: number) => {
    const cached = thumbs()[`${path}@${modified}`];
    if (cached) { setLightbox({ path, data: cached }); return; }
    void act(async () => {
      const scope = session();
      const data = await props.bridge.image({ scope, path });
      if (current(scope.key)) setLightbox({ path, data });
    });
  };
  const follow = (artifact: Artifact) => void act(() => configure({ ...binding(), view: "generated", generated: artifact.path }));
  const ask = (draft: Draft) => props.insert(`\nAbout SuperBrick proposal #${draft.id} (${draft.label}) by ${draft.user} in ${binding().project}: `);
  const toggle = (id: number, on: boolean) => setSelected((ids) => on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));
  const scrub = (value: number) => { setStep(value); viewport?.setStep(value); };
  const toggleOrtho = (on: boolean) => { setOrtho(on); viewport?.setOrtho(on); };
  const toggleEdges = (on: boolean) => { setEdges(on); viewport?.showEdges(on); };
  const startDrag = (event: PointerEvent) => {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = dockHeight();
    setDragging(true);
    const move = (e: PointerEvent) => {
      const max = Math.max(120, root.clientHeight - 200);
      setDockHeight(Math.min(max, Math.max(90, startHeight - (e.clientY - startY))));
    };
    const up = () => {
      setDragging(false);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const StepSlider = () => <Show when={steps() > 1}>
    <span class="sb-step">
      <input type="range" min="1" max={steps()} value={step()} aria-label="Building step" onInput={(e) => scrub(Number(e.currentTarget.value))} />
      <span class="mono">{step()}/{steps()}</span>
    </span>
  </Show>;

  const DraftRow = (p: { draft: Draft }) => {
    const d = p.draft;
    const live = OPEN_STATES.includes(d.state);
    return <>
      <div class="sb-draft" title={[`#${d.id} · ${d.state}`, d.dependencies.length ? `needs ${d.dependencies.map((id) => `#${id}`).join(", ")}` : ""].filter(Boolean).join("\n")}>
        <Show when={live} fallback={<span class="sb-nocheck" />}>
          <input type="checkbox" aria-label={`Select proposal ${d.id}`} checked={selected().includes(d.id)} onChange={(e) => toggle(d.id, e.currentTarget.checked)} />
        </Show>
        <span class={`label ${d.state}`}>{d.label || "Untitled clump"}<span class="faint"> #{d.id}</span>
          <Show when={manyUsers()}><span class="who">{d.user}</span></Show>
        </span>
        <span class="delta">+{d.created} ~{d.modified} −{d.removed}</span>
        <Show when={live}>
          <span class="actions">
            <button class="small" disabled={locked() || d.state !== "pending"} title="Accept (dependencies are accepted too)" onClick={() => void decide("accept", [d.id])}>Accept</button>
            <button class="small" disabled={locked()} title="Reject with optional feedback" onClick={() => { setNote(""); setBulk(undefined); setRejecting(rejecting() === d.id ? undefined : d.id); }}>Reject</button>
            <button class="small frameless" title="Ask the agent about this proposal in the chat" onClick={() => ask(d)}>Ask</button>
          </span>
        </Show>
      </div>
      <Show when={live && (d.reason || d.note)}><div class="sb-sub warn">{d.reason || d.note}</div></Show>
      <Show when={rejecting() === d.id}>
        <div class="sb-confirm">
          <textarea placeholder="Optional feedback for the builder" value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
          <div class="sb-row">
            <button class="danger" disabled={locked()} onClick={() => void decide("reject", [d.id], project().revision, note())}>Reject #{d.id}</button>
            <button onClick={() => setRejecting(undefined)}>Cancel</button>
          </div>
        </div>
      </Show>
    </>;
  };

  const busy = () => state().busy || rendering() || working();
  const running = () => activity().some((a) => a.status === "running") || props.background().length > 0;
  const Tab = (p: { id: DockTab; label: string; extra?: any }) =>
    <button class="sb-tab" role="tab" aria-selected={tab() === p.id} onClick={() => setTab(p.id)}>{p.label}{p.extra}</button>;

  return <section class="sb" ref={root} aria-label="SuperBrick build companion">
    <style>{styles}</style>

    {/* The build, full bleed */}
    <div class="sb-stage">
      <div class="sb-canvas" ref={canvas} />

      <Show when={!preview()}>
        <div class="sb-empty">
          <img src={icon} alt="" />
          <Show when={props.local()} fallback={<div class="weak">Needs the desktop app's local server.</div>}>
            <div class="title">{binding().project || binding().generated ? "Loading the build…" : "Waiting for the agent…"}</div>
            <Show when={!binding().project && !binding().generated}>
              <div class="weak">Connects by itself when the agent opens or creates a .sb project.</div>
              <button class="link" onClick={() => showTab("project")}>Choose a project instead</button>
            </Show>
          </Show>
        </div>
      </Show>

      <div class="sb-hud tl">
        <button disabled={!binding().project || working()} title="Open this project in the SuperBrick app" onClick={() => void act(async () => { await props.bridge.open(session()); })}>Open in app</button>
        <label class="check"><input type="checkbox" checked={ortho()} onChange={(e) => toggleOrtho(e.currentTarget.checked)} />Ortho</label>
        <label class="check"><input type="checkbox" checked={edges()} onChange={(e) => toggleEdges(e.currentTarget.checked)} />Edges</label>
      </div>

      <Show when={preview()}>
        <ViewCube register={(update) => (cubeUpdate = update)} onView={(v) => viewport?.view(v)} onOrbit={(dx, dy, done) => viewport?.orbit(dx, dy, done)} />
        <div class="sb-hud br">
          <StepSlider />
          <span class="count">{preview()?.parts} pieces</span>
          <Show when={busy()}><span class="sb-busy" title={state().busy ? "Exporting…" : "Rendering…"} /></Show>
        </div>
      </Show>

      <Show when={error() || state().error || renderError()}>
        <div class="sb-toast err" role="alert">
          <span class="grow">{error() || state().error || renderError()}</span>
          <button class="small frameless" aria-label="Dismiss" onClick={() => { setError(""); setRenderError(""); }}><Cross /></button>
        </div>
      </Show>
      <Show when={notice()}><div class="sb-toast note" role="status">{notice()}</div></Show>

      <button class="sb-pull" classList={{ open: drawer(), hot: pending().length > 0 }} aria-expanded={drawer()}
        title={drawer() ? "Hide agents, activity and artifacts" : "Show agents, activity and artifacts"}
        onClick={() => setDrawer(!drawer())}>
        <Chevron down={drawer()} />
        <Show when={!drawer() && open().length}><span class="badge">{open().length}</span></Show>
        <Show when={!drawer() && running()}><span class="dot" /></Show>
      </button>
    </div>

    {/* Drawer: agents, activity, artifacts, project */}
    <Show when={drawer()}>
      <div class={`sb-drawer ${dragging() ? "drag" : ""}`} style={{ height: `${dockHeight()}px` }}>
        <div class="sb-grip" role="separator" aria-orientation="horizontal" aria-label="Resize" onPointerDown={startDrag} />
        <div class="sb-tabs" role="tablist" aria-label="Build details">
          <Tab id="agents" label="Agents" extra={<Show when={open().length}><span class={`count ${pending().length ? "hot" : ""}`}>{open().length}</span></Show>} />
          <Tab id="activity" label="Activity" extra={<Show when={running()}><span class="sb-busy" /></Show>} />
          <Tab id="artifacts" label="Artifacts" />
          <Tab id="project" label="Project" />
        </div>
        <div class="sb-body" role="tabpanel">
          <Show when={lightbox()}>{(value) => <div class="sb-lightbox" onClick={() => setLightbox(undefined)}>
            <div class="sb-row"><span class="grow mono">{value().path}</span><button class="small" onClick={() => setLightbox(undefined)}>Close</button></div>
            <img src={value().data} alt={`Build artifact: ${name(value().path)}`} />
          </div>}</Show>

          <Show when={tab() === "agents"}>
            <Show when={project().editorOpen}><p class="sb-hint">Open in the SuperBrick app — close it there to accept or reject here.</p></Show>
            <Show when={!project().drafts.length}><p class="weak">No proposals yet.</p></Show>
            <Show when={open().length > 1}>
              <label class="check sb-all"><input type="checkbox" checked={selected().length > 0 && selected().length === open().length}
                onChange={(e) => setSelected(e.currentTarget.checked ? open().map((d) => d.id) : [])} /><span class="weak">{open().length} open</span></label>
            </Show>
            <For each={open()}>{(draft) => <DraftRow draft={draft} />}</For>
            <Show when={selected().length && !bulk()}>
              <div class="sb-row sb-bulk">
                <span class="weak">{selected().length} checked</span>
                <button class="small frameless" onClick={() => setSelected([])}>Clear</button>
                <span class="grow" />
                <button disabled={locked()} onClick={() => { setNote(""); setRejecting(undefined); setBulk({ action: "reject", ids: [...selected()], revision: project().revision }); }}>Reject…</button>
                <button class="on" disabled={locked() || !selected().every((id) => pending().some((d) => d.id === id))} onClick={() => { setRejecting(undefined); setBulk({ action: "accept", ids: [...selected()], revision: project().revision }); }}>Accept</button>
              </div>
            </Show>
            <Show when={bulk()}>{(request) => <div class="sb-confirm">
              <div class="strong">{request().action === "accept" ? "Accept" : "Reject"} {request().ids.map((id) => `#${id}`).join(", ")}?</div>
              <Show when={request().action === "reject"}><textarea placeholder="Optional feedback for the builder" value={note()} onInput={(e) => setNote(e.currentTarget.value)} /></Show>
              <Show when={request().revision !== project().revision}><div class="sb-sub warn">The project changed since you checked these. Review and try again.</div></Show>
              <div class="sb-row">
                <button class={request().action === "accept" ? "on" : "danger"} disabled={locked() || request().revision !== project().revision} onClick={() => void decide(request().action, request().ids, request().revision, note())}>{request().action === "accept" ? "Accept" : "Reject"}</button>
                <button onClick={() => setBulk(undefined)}>Cancel</button>
              </div>
            </div>}</Show>
            <Show when={recent().length}>
              <button class={`sb-collapse ${showRecent() ? "open" : ""}`} onClick={() => setShowRecent(!showRecent())}><span class="tri" />Recent<span class="faint">{recent().length}</span></button>
              <Show when={showRecent()}><div class="sb-indent"><For each={recent()}>{(draft) => <DraftRow draft={draft} />}</For></div></Show>
            </Show>
          </Show>

          <Show when={tab() === "activity"}>
            <Show when={activityError()}><p class="sb-sub warn">{activityError()}</p></Show>
            <For each={props.background()}>{(task) => <div class="sb-row"><span class="sb-busy" /><span>{task}</span></div>}</For>
            <Show when={!activity().length}><p class="weak">Waiting for the agent's next tool call…</p></Show>
            <div class="sb-log">
              <For each={[...activity()].reverse()}>{(entry) => <>
                <span class="t">{time(entry.started)}</span>
                <span class="tool"><span class={`dot ${entry.status}`} />{entry.tool}</span>
                <span class="what" title={entry.summary}>{entry.summary}<span class="faint">{entry.ended ? ` · ${((entry.ended - entry.started) / 1_000).toFixed(1)}s` : ""}</span></span>
                <Show when={entry.detail || entry.images.length}>
                  <div class="extra">
                    <Show when={entry.detail}><div class="err">{entry.detail}</div></Show>
                    <For each={entry.images}>{(src) => <img src={src} alt="Tool result — an attempt or diagnostic, not necessarily accepted geometry" />}</For>
                  </div>
                </Show>
              </>}</For>
            </div>
          </Show>

          <Show when={tab() === "artifacts"}>
            <Show when={!state().artifacts.length}><p class="weak">No renders or models yet.</p></Show>
            <div class="sb-grid">
              <For each={[...state().artifacts].sort((a, b) => b.modified - a.modified)}>{(artifact) => {
                const active = () => artifact.kind === "model" && binding().view === "generated" && binding().generated === artifact.path;
                return <button class={`sb-tile ${active() ? "active" : ""}`} disabled={working()}
                  title={`${artifact.path}\n${time(artifact.modified)}\n${artifact.kind === "model" ? "Click to view (generated, not proposed)" : "Click to enlarge"}`}
                  onClick={() => artifact.kind === "image" ? showImage(artifact.path, artifact.modified) : follow(artifact)}>
                  <div class="sb-thumb">
                    <Show when={artifact.kind === "image"} fallback={<BrickGlyph />}>
                      <Show when={thumbs()[`${artifact.path}@${artifact.modified}`]}>
                        <img src={thumbs()[`${artifact.path}@${artifact.modified}`]} alt="" />
                      </Show>
                    </Show>
                  </div>
                  <div class="name"><span>{name(artifact.path)}</span></div>
                </button>;
              }}</For>
            </div>
          </Show>

          <Show when={tab() === "project"}>
            <div class="sb-form">
              <label>Show</label>
              <span class="sb-seg" role="radiogroup" aria-label="Model shown">
                <button classList={{ on: binding().view === "builder" }} aria-pressed={binding().view === "builder"} disabled={working()} title="Accepted model plus this builder's open proposals" onClick={() => switchView("builder")}>Proposals</button>
                <button classList={{ on: binding().view === "accepted" }} aria-pressed={binding().view === "accepted"} disabled={working()} title="Only accepted geometry" onClick={() => switchView("accepted")}>Accepted</button>
                <button classList={{ on: binding().view === "generated" }} aria-pressed={binding().view === "generated"} disabled={working()} title="A generated LDraw file (not proposed)" onClick={() => switchView("generated")}>Generated</button>
              </span>
              <span />
            </div>
            <form class="sb-form" onSubmit={(event) => { event.preventDefault(); void act(() => configure(form())); }}>
              <label for="sb-project">Project</label>
              <input id="sb-project" type="text" placeholder="/path/to/build.sb" value={form().project} onInput={(e) => field("project", e.currentTarget.value)} />
              <button type="button" onClick={() => void choose("project")}>Browse…</button>
              <label for="sb-builder" title="The agent's sb --user name">Builder</label>
              <input id="sb-builder" type="text" list="sb-builders" value={form().builder} onInput={(e) => field("builder", e.currentTarget.value)} />
              <datalist id="sb-builders"><For each={project().builders}>{(b) => <option value={b} />}</For></datalist>
              <span />
              <label for="sb-run">Run folder</label>
              <input id="sb-run" type="text" placeholder="Optional — watch renders and generated models" value={form().runDirectory} onInput={(e) => field("runDirectory", e.currentTarget.value)} />
              <button type="button" onClick={() => void choose("directory")}>Browse…</button>
              <label for="sb-generated">Generated</label>
              <input id="sb-generated" type="text" placeholder="Optional .ldr/.mpd (default: newest in run folder)" value={form().generated} onInput={(e) => field("generated", e.currentTarget.value)} />
              <button type="button" onClick={() => void choose("model")}>Browse…</button>
              <span />
              <span class="sb-row">
                <button class="on" disabled={working() || !props.local()}>Connect</button>
                <button type="button" onClick={() => setForm({ ...binding() })}>Revert</button>
                <span class="grow" />
                <button type="button" disabled={!props.local() || working()} title="Re-export and reload the preview" onClick={() => void act(async () => { await props.bridge.refresh(session()); })}>Re-export</button>
              </span>
              <span />
            </form>
            <Show when={preview()?.warnings.length}>
              <details class="sb-sub warn"><summary>{preview()!.warnings.length} missing library parts</summary><For each={preview()!.warnings}>{(w) => <div class="mono">{w}</div>}</For></details>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  </section>;
}
