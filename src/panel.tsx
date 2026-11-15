import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack } from "solid-js";
import type { IpcClient } from "@opencode/plugin/gui";
import type { Bridge } from "./contract";
import { icon } from "./logo";
import { defaultBinding, emptyProject, errorText } from "./model";
import type { Activity, Artifact, Binding, BuildState, Draft, Preview, Scope } from "./model";
import { styles } from "./styles";
import { Viewport, type CameraState, type ViewName } from "./viewport";

type Client = Pick<IpcClient<typeof Bridge.spec>, "watch" | "release" | "status" | "preview" | "configure" | "refresh" | "choose" | "open" | "decide" | "discover" | "image" | "on">;
type DockTab = "agents" | "activity" | "artifacts" | "project";

const cameras = new Map<string, CameraState>();
const thumbCache = new Map<string, string>();
const name = (path: string) => path.split(/[\\/]/).at(-1) || path;
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const OPEN_STATES = ["pending", "stale", "blocked"];
const VIEWS: [ViewName, string][] = [["front", "Front"], ["top", "Top"], ["right", "Right"], ["iso", "3D"]];

/** Small isometric brick, used for model tiles and the empty viewport. */
const BrickGlyph = (props: { color?: string }) => <svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M8 26 32 14l24 12-24 12Z" fill={props.color ?? "#d6a12a"} />
  <path d="M8 26v16l24 12V38Z" fill="#a87a14" />
  <path d="M56 26v16L32 54V38Z" fill="#7d5a0c" />
  <ellipse cx="25" cy="24" rx="6" ry="3" fill="#ffffff40" /><ellipse cx="39" cy="24" rx="6" ry="3" fill="#ffffff40" />
  <ellipse cx="32" cy="20" rx="6" ry="3" fill="#ffffff30" /><ellipse cx="32" cy="28" rx="6" ry="3" fill="#ffffff30" />
</svg>;

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
  const [selected, setSelected] = createSignal<number[]>([]);
  const [bulk, setBulk] = createSignal<{ action: "accept" | "reject"; ids: number[]; revision: string }>();
  const [rejecting, setRejecting] = createSignal<number>();
  const [note, setNote] = createSignal("");
  const [working, setWorking] = createSignal(false);
  const [lightbox, setLightbox] = createSignal<{ path: string; data: string }>();
  const [thumbs, setThumbs] = createSignal<Record<string, string>>({});
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  const [renderError, setRenderError] = createSignal("");
  const [rendering, setRendering] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [ortho, setOrtho] = createSignal(false);
  const [edges, setEdges] = createSignal(true);
  const [steps, setSteps] = createSignal(1);
  const [step, setStep] = createSignal(1);
  const [dockHeight, setDockHeight] = createSignal(240);
  const [dragging, setDragging] = createSignal(false);
  const [viewportVersion, setViewportVersion] = createSignal(0);
  let root!: HTMLElement;
  let canvas!: HTMLDivElement;
  let viewport: Viewport | undefined;
  let reload: (() => Promise<void>) | undefined;

  const session = createMemo(() => props.scope());
  const binding = () => state().binding;
  const project = () => state().project;
  const cameraKey = createMemo(() => {
    const b = binding();
    return JSON.stringify([session().key, b.project, b.view, b.builder, b.generated]);
  });
  const open = createMemo(() => project().drafts.filter((d) => OPEN_STATES.includes(d.state)));
  const pending = createMemo(() => open().filter((d) => d.state === "pending"));
  const users = createMemo(() => {
    const names = new Set<string>([...project().builders, ...project().drafts.map((d) => d.user)]);
    return [...names].sort().map((user) => {
      const mine = project().drafts.filter((d) => d.user === user);
      return {
        user,
        live: mine.filter((d) => OPEN_STATES.includes(d.state)),
        recent: mine.filter((d) => !OPEN_STATES.includes(d.state)).slice(-5).reverse(),
      };
    }).filter((group) => group.live.length || group.recent.length);
  });
  const images = createMemo(() => state().artifacts.filter((a) => a.kind === "image"));
  const locked = () => working() || project().editorOpen || !props.local();
  const field = (key: keyof Binding, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const current = (key: string) => session().key === key;
  const builderMismatch = () => binding().view === "builder" && project().builders.length > 0 && !project().builders.includes(binding().builder);

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
        setState(next);
        if (first) {
          setForm({ ...next.binding });
          if (!next.binding.project && !next.binding.generated) setTab("project");
          first = false;
        }
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
  const choose = (kind: "project" | "model" | "directory") => act(async () => {
    const scope = session();
    const path = await props.bridge.choose({ scope, kind });
    if (!path || !current(scope.key)) return;
    field(kind === "project" ? "project" : kind === "model" ? "generated" : "runDirectory", path);
    if (kind === "model") field("view", "generated");
  });
  const switchView = (view: Binding["view"]) => {
    if (view !== binding().view) void act(() => configure({ ...binding(), view }));
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

  const docTitle = () => {
    const b = binding();
    if (b.view === "generated") return b.generated ? name(b.generated) : "Generated";
    return b.project ? name(b.project) : "No project";
  };
  const statusText = () => state().busy ? "Exporting…" : rendering() ? "Rendering…" : working() ? "Working…" : state().updated ? `Updated ${time(state().updated)}` : "Ready";

  const DraftRow = (p: { draft: Draft }) => {
    const d = p.draft;
    return <>
      <div class="sb-draft">
        <input type="checkbox" aria-label={`Select proposal ${d.id}`} disabled={d.state !== "pending" && d.state !== "stale" && d.state !== "blocked"}
          checked={selected().includes(d.id)} onChange={(e) => toggle(d.id, e.currentTarget.checked)} />
        <span class={`label ${d.state}`} title={`#${d.id} · ${d.state}`}>#{d.id} {d.label || "Untitled clump"}</span>
        <span class="delta">+{d.created} ~{d.modified} −{d.removed}</span>
        <Show when={OPEN_STATES.includes(d.state)}>
          <span class="actions">
            <button class="small" disabled={locked() || d.state !== "pending"} title="Accept (dependencies are accepted too)" onClick={() => void decide("accept", [d.id])}>Accept</button>
            <button class="small" disabled={locked()} onClick={() => { setNote(""); setBulk(undefined); setRejecting(rejecting() === d.id ? undefined : d.id); }}>Reject…</button>
            <button class="small frameless" title="Insert a reference to this proposal in the chat composer" onClick={() => ask(d)}>Ask</button>
          </span>
        </Show>
      </div>
      <Show when={d.dependencies.length}><div class="sb-sub">needs {d.dependencies.map((id) => `#${id}`).join(", ")}</div></Show>
      <Show when={d.reason || d.note}><div class={`sb-sub ${d.state === "stale" || d.state === "blocked" ? "warn" : ""}`}>{d.reason || d.note}</div></Show>
      <Show when={rejecting() === d.id}>
        <div class="sb-confirm">
          <textarea placeholder="Optional feedback for the builder — delivered on its next call" value={note()} onInput={(e) => setNote(e.currentTarget.value)} />
          <div class="sb-row">
            <button class="danger" disabled={locked()} onClick={() => void decide("reject", [d.id], project().revision, note())}>Reject #{d.id}</button>
            <button onClick={() => setRejecting(undefined)}>Cancel</button>
          </div>
        </div>
      </Show>
    </>;
  };

  return <section class="sb" ref={root} aria-label="SuperBrick build companion">
    <style>{styles}</style>

    {/* Menu bar — mirrors SuperBrick's top toolbar */}
    <div class="sb-menubar">
      <span class="sb-brand"><img src={icon} alt="" /><span>SuperBrick</span></span>
      <span class="sep" />
      <span class="sb-seg" role="radiogroup" aria-label="Model shown">
        <button classList={{ on: binding().view === "builder" }} aria-pressed={binding().view === "builder"} disabled={working()} title="Accepted main plus this builder's proposals" onClick={() => switchView("builder")}>Builder · {binding().builder}</button>
        <button classList={{ on: binding().view === "accepted" }} aria-pressed={binding().view === "accepted"} disabled={working()} title="Only accepted geometry" onClick={() => switchView("accepted")}>Accepted</button>
        <button classList={{ on: binding().view === "generated" }} aria-pressed={binding().view === "generated"} disabled={working()} title="A generated LDraw file — not proposed" onClick={() => switchView("generated")}>Generated</button>
      </span>
      <span class="sep" />
      <button disabled={!props.local() || working()} title="Re-export and reload the preview" onClick={() => void act(async () => { await props.bridge.refresh(session()); })}>⟳ Refresh</button>
      <button disabled={!binding().project || working()} title="Open this project in the SuperBrick app" onClick={() => void act(async () => { await props.bridge.open(session()); })}>Open in app ↗</button>
      <span class="grow" />
      <span class="weak small" aria-live="polite"><Show when={state().busy || rendering() || working()}><span class="sb-busy" /> </Show>{statusText()}</span>
    </div>

    <Show when={!props.local()}><div class="sb-banner warn"><span class="grow">This companion needs the desktop's own local server. Remote server paths are not read on this computer.</span></div></Show>
    <Show when={error() || state().error}><div class="sb-banner" role="alert"><span class="grow">{error() || state().error}{preview() ? " — showing the last successful preview." : ""}</span><button class="small" onClick={() => setError("")}>✕</button></div></Show>
    <Show when={notice()}><div class="sb-banner info" role="status"><span class="grow">{notice()}</span><button class="small" onClick={() => setNotice("")}>✕</button></div></Show>
    <Show when={builderMismatch()}><div class="sb-banner warn"><span class="grow">No proposals from “{binding().builder}”. This project's builders: {project().builders.join(", ")}.</span><button class="small" onClick={() => setTab("project")}>Change…</button></div></Show>

    {/* Viewport area — document tab, view toolbar, canvas */}
    <div class="sb-area" style={{ flex: "1 1 auto" }}>
      <div class="sb-tabs" role="tablist" aria-label="Document">
        <button class="sb-tab" role="tab" aria-selected="true" title={binding().view === "generated" ? binding().generated : binding().project}>{docTitle()}</button>
      </div>
      <div class="sb-viewbar">
        <button disabled={!preview()} title="Fit (F)" onClick={() => viewport?.fit()}>Fit</button>
        <For each={VIEWS}>{([id, label]) => <button disabled={!preview()} onClick={() => viewport?.view(id)}>{label}</button>}</For>
        <label class="check"><input type="checkbox" checked={ortho()} onChange={(e) => toggleOrtho(e.currentTarget.checked)} />Ortho</label>
        <label class="check"><input type="checkbox" checked={edges()} onChange={(e) => toggleEdges(e.currentTarget.checked)} />Edges</label>
        <Show when={steps() > 1}>
          <span class="sb-step">
            <span class="weak">Step</span>
            <input type="range" min="1" max={steps()} value={step()} aria-label="Building step" onInput={(e) => scrub(Number(e.currentTarget.value))} />
            <span class="mono">{step()}/{steps()}</span>
          </span>
        </Show>
      </div>
      <div class="sb-viewport">
        <div class="sb-canvas" ref={canvas} />
        <Show when={!preview()}>
          <div class="sb-empty">
            <img src={icon} alt="" />
            <div class="title">{binding().project || binding().generated ? "Waiting for the first export…" : "No build connected"}</div>
            <div>Connect a local <code>.sb</code> project or follow a generated LDraw model.<br />Your agent keeps building with its existing tools.</div>
            <Show when={!binding().project && !binding().generated}><button onClick={() => setTab("project")}>Connect project…</button></Show>
          </div>
        </Show>
        <Show when={preview()}>
          <div class="sb-overlay bl"><span classList={{ generated: binding().view === "generated" }}>{preview()?.label}</span></div>
          <div class="sb-overlay br">{preview()?.parts} pieces{steps() > 1 ? ` · step ${step()}/${steps()}` : ""}</div>
        </Show>
        <Show when={rendering()}><div class="sb-overlay tl"><span class="sb-busy" /> Rendering…</div></Show>
      </div>
      <Show when={renderError()}><div class="sb-banner" role="alert"><span class="grow">{renderError()}</span></div></Show>
      <Show when={preview()?.warnings.length}>
        <details class="sb-banner warn"><summary>{preview()!.warnings.length} missing library parts — incomplete preview</summary><For each={preview()!.warnings}>{(w) => <div class="mono">{w}</div>}</For></details>
      </Show>
    </div>

    <div class={`sb-split ${dragging() ? "drag" : ""}`} role="separator" aria-orientation="horizontal" aria-label="Resize dock" onPointerDown={startDrag} />

    {/* Dock — Agents / Activity / Artifacts / Project */}
    <div class="sb-area sb-dock" style={{ height: `${dockHeight()}px` }}>
      <div class="sb-tabs" role="tablist" aria-label="Build details">
        <button class="sb-tab" role="tab" aria-selected={tab() === "agents"} onClick={() => setTab("agents")}>Agents<Show when={open().length}><span class={`count ${pending().length ? "hot" : ""}`}>{open().length}</span></Show></button>
        <button class="sb-tab" role="tab" aria-selected={tab() === "activity"} onClick={() => setTab("activity")}>Activity<Show when={activity().some((a) => a.status === "running")}><span class="sb-busy" /></Show></button>
        <button class="sb-tab" role="tab" aria-selected={tab() === "artifacts"} onClick={() => setTab("artifacts")}>Artifacts<Show when={state().artifacts.length}><span class="count">{state().artifacts.length}</span></Show></button>
        <button class="sb-tab" role="tab" aria-selected={tab() === "project"} onClick={() => setTab("project")}>Project</button>
      </div>
      <div class="sb-body" role="tabpanel">
        <Show when={lightbox()}>{(value) => <div class="sb-lightbox" onClick={() => setLightbox(undefined)}>
          <div class="sb-row"><span class="grow mono">{value().path}</span><button class="small" onClick={() => setLightbox(undefined)}>Close</button></div>
          <img src={value().data} alt={`Build artifact: ${name(value().path)}`} />
        </div>}</Show>

        <Show when={tab() === "agents"}>
          <h2>Agents</h2>
          <p class="sb-hint">Agents edit through proposals; nothing an agent does lands until you accept it. Accepting also accepts required dependencies.</p>
          <Show when={project().editorOpen}><p class="sb-sub warn" style={{ "margin-left": "0" }}>SuperBrick has this project open (PID {project().editorPID}). Inspect here; close it in the app before accepting or rejecting.</p></Show>
          <Show when={!users().length}>
            <p>No proposals yet. Agents connect with <code>sb mcp --user NAME</code> or run <code>sb PROJECT.sb --user NAME TOOL '{"{…}"}'</code>.</p>
            <p class="sb-hint">External generators show up under Activity and Artifacts until they are proposed to this project.</p>
          </Show>
          <For each={users()}>{(group) => {
            const isOpen = () => !collapsed()[group.user];
            return <div>
              <button class={`sb-collapse ${isOpen() ? "open" : ""}`} onClick={() => setCollapsed((c) => ({ ...c, [group.user]: isOpen() }))}>
                <span class="tri" />{group.user}<span class="weak small">{group.live.length ? `${group.live.length} open` : "no open proposals"}</span>
              </button>
              <Show when={isOpen()}>
                <div class="sb-indent">
                  <For each={group.live}>{(draft) => <DraftRow draft={draft} />}</For>
                  <Show when={group.recent.length}>
                    <div class="sb-hint" style={{ margin: "6px 0 2px" }}>Recent decisions</div>
                    <For each={group.recent}>{(draft) => <DraftRow draft={draft} />}</For>
                  </Show>
                </div>
              </Show>
            </div>;
          }}</For>
          <Show when={open().length}>
            <div class="sb-row" style={{ "margin-top": "8px" }}>
              <button disabled={!pending().length} onClick={() => setSelected(pending().map((d) => d.id))}>Check all pending</button>
              <button disabled={!selected().length} onClick={() => setSelected([])}>Clear</button>
              <span class="grow" />
              <button disabled={!selected().length || locked()} onClick={() => { setNote(""); setRejecting(undefined); setBulk({ action: "reject", ids: [...selected()], revision: project().revision }); }}>Reject checked</button>
              <button class="on" disabled={!selected().length || locked() || !selected().every((id) => pending().some((d) => d.id === id))} onClick={() => { setRejecting(undefined); setBulk({ action: "accept", ids: [...selected()], revision: project().revision }); }}>Accept checked ({selected().length})</button>
            </div>
          </Show>
          <Show when={bulk()}>{(request) => <div class="sb-confirm">
            <div class="strong">{request().action === "accept" ? "Accept" : "Reject"} {request().ids.map((id) => `#${id}`).join(", ")}?</div>
            <div class="sb-hint">{request().action === "accept" ? "Accepted geometry becomes shared main." : "Dependent proposals may become blocked."}</div>
            <Show when={request().action === "reject"}><textarea placeholder="Optional feedback for the builder" value={note()} onInput={(e) => setNote(e.currentTarget.value)} /></Show>
            <Show when={request().revision !== project().revision}><div class="sb-sub warn" style={{ "margin-left": "0" }}>The project changed since you checked these. Review and try again.</div></Show>
            <div class="sb-row">
              <button class={request().action === "accept" ? "on" : "danger"} disabled={locked() || request().revision !== project().revision} onClick={() => void decide(request().action, request().ids, request().revision, note())}>Confirm {request().action}</button>
              <button onClick={() => setBulk(undefined)}>Cancel</button>
            </div>
          </div>}</Show>
        </Show>

        <Show when={tab() === "activity"}>
          <p class="sb-hint">Tool calls in this session, newest first. Activity is not proof a part was placed or a check passed.</p>
          <Show when={activityError()}><p class="sb-sub warn" style={{ "margin-left": "0" }}>{activityError()}</p></Show>
          <For each={props.background()}>{(task) => <div class="sb-row"><span class="sb-busy" /><span>Background: {task}</span></div>}</For>
          <Show when={!activity().length}><p class="weak">Waiting for this session's next tool call…</p></Show>
          <div class="sb-log">
            <For each={[...activity()].reverse()}>{(entry) => <>
              <span class="t">{time(entry.started)}</span>
              <span class="tool"><span class={`dot ${entry.status}`} />{entry.tool}</span>
              <span class="what" title={entry.summary}>{entry.summary}<span class="faint">{entry.ended ? ` · ${((entry.ended - entry.started) / 1_000).toFixed(1)}s` : ""}{entry.agent ? ` · ${entry.agent}` : ""}</span></span>
              <Show when={entry.detail || entry.images.length || entry.paths.length}>
                <div class="extra">
                  <Show when={entry.detail}><div class="err">{entry.detail}</div></Show>
                  <For each={entry.images}>{(src) => <img src={src} alt="Tool result — an attempt or diagnostic, not necessarily accepted geometry" />}</For>
                  <For each={entry.paths}>{(path) => <span class="mono">{path}</span>}</For>
                </div>
              </Show>
            </>}</For>
          </div>
        </Show>

        <Show when={tab() === "artifacts"}>
          <p class="sb-hint">Files from the run folder and tool paths. Click a model to follow it in the viewport (generated, never proposed automatically); click a render to enlarge.</p>
          <Show when={!state().artifacts.length}><p class="weak">Nothing yet. Choose a run folder under Project to watch generators and renders outside the .sb file.</p></Show>
          <div class="sb-grid">
            <For each={[...state().artifacts].sort((a, b) => b.modified - a.modified)}>{(artifact) => {
              const active = () => artifact.kind === "model" && binding().view === "generated" && binding().generated === artifact.path;
              return <button class={`sb-tile ${active() ? "active" : ""}`} disabled={working()} title={`${artifact.path}\n${time(artifact.modified)}`}
                onClick={() => artifact.kind === "image" ? showImage(artifact.path, artifact.modified) : follow(artifact)}>
                <div class="sb-thumb">
                  <Show when={artifact.kind === "image"} fallback={<BrickGlyph />}>
                    <Show when={thumbs()[`${artifact.path}@${artifact.modified}`]} fallback={<span class="faint small">render</span>}>
                      <img src={thumbs()[`${artifact.path}@${artifact.modified}`]} alt="" />
                    </Show>
                  </Show>
                </div>
                <div class="name"><span>{name(artifact.path)}</span><i class={`kind ${artifact.kind}`} /></div>
              </button>;
            }}</For>
          </div>
        </Show>

        <Show when={tab() === "project"}>
          <h2>Project</h2>
          <p class="sb-hint">Builder must match the agent's existing <code>sb --user</code> identity (often <code>claude</code>). This panel never changes your agent or MCP setup.</p>
          <form class="sb-form" onSubmit={(event) => { event.preventDefault(); void act(async () => { await configure(form()); if (form().project || form().generated) setTab("agents"); }); }}>
            <label for="sb-project">Project</label>
            <input id="sb-project" type="text" placeholder="/Users/you/projects/build.sb" value={form().project} onInput={(e) => field("project", e.currentTarget.value)} />
            <button type="button" onClick={() => void choose("project")}>Browse…</button>
            <label for="sb-builder">Builder</label>
            <input id="sb-builder" type="text" value={form().builder} onInput={(e) => field("builder", e.currentTarget.value)} />
            <span />
            <Show when={project().builders.length}>
              <span /><span class="sb-chips"><span class="weak small">In this project:</span><For each={project().builders}>{(b) => <button type="button" classList={{ on: form().builder === b }} onClick={() => field("builder", b)}>{b}</button>}</For></span>
            </Show>
            <label for="sb-run">Run folder</label>
            <input id="sb-run" type="text" placeholder="runs/design/my_build" value={form().runDirectory} onInput={(e) => field("runDirectory", e.currentTarget.value)} />
            <button type="button" onClick={() => void choose("directory")}>Browse…</button>
            <label for="sb-generated">Generated</label>
            <input id="sb-generated" type="text" placeholder="Optional .ldr/.mpd, or newest in run folder" value={form().generated} onInput={(e) => field("generated", e.currentTarget.value)} />
            <button type="button" onClick={() => void choose("model")}>Browse…</button>
            <span />
            <span class="sb-row"><button class="on" disabled={working() || !props.local()}>Connect</button><button type="button" onClick={() => setForm({ ...binding() })}>Revert</button></span>
            <span />
          </form>
          <div class="sb-kv">
            <span>Project</span><span class="mono">{binding().project || "—"}</span>
            <span>Revision</span><span class="mono">{project().revision || "—"}</span>
            <span>Builders</span><span>{project().builders.join(", ") || "—"}</span>
            <span>Native app</span><span>{project().editorOpen ? `open (PID ${project().editorPID})` : "closed"}</span>
            <span>Run folder</span><span class="mono">{binding().runDirectory || "—"}</span>
          </div>
        </Show>
      </div>
    </div>

    {/* Status bar */}
    <div class="sb-status">
      <span>{binding().project ? name(binding().project) : "no project"}</span>
      <span>{preview() ? `${preview()!.parts} pieces` : "no preview"}</span>
      <span classList={{ warn: pending().length > 0 }}>{open().length} open proposals</span>
      <Show when={project().editorOpen}><span class="warn">Native app has the project — decisions disabled</span></Show>
      <Show when={!project().editorOpen && binding().project}><span>Decisions enabled</span></Show>
    </div>
  </section>;
}
