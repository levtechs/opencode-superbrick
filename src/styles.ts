// SuperBrick is an egui app with egui's dark visuals. These tokens mirror them
// (panel 27, widgets 60/70/55, text 140/180/240, selection #005c80) so the panel reads
// as a piece of SuperBrick inside OpenCode. Inline CSS keeps the GUI artifact one CJS file.
export const styles = `
.sb {
  --panel:#1b1b1b; --dock:#121212; --extreme:#0a0a0a; --line:#303030; --line2:#3c3c3c;
  --w:#3c3c3c; --w-hover:#464646; --w-active:#373737;
  --text:#b4b4b4; --weak:#8c8c8c; --faint:#6a6a6a; --strong:#f0f0f0;
  --sel:#005c80; --sel-text:#c0deff; --link:#5aaaff; --warn:#ff8f00; --err:#ff6060; --ok:#3fae5a;
  --pending:#3c82e6; --stale:#c48a10; --blocked:#ff5050; --accepted:#28a050;
  --view:#252a2e; --tab-line:#3c3c3c;
  position:relative; display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden;
  background:var(--panel); color:var(--text);
  font:13px/1.35 "Ubuntu","Ubuntu Light",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
  letter-spacing:.005em; container-type:inline-size; user-select:none; -webkit-font-smoothing:antialiased;
}
.sb * { box-sizing:border-box; }
.sb :focus-visible { outline:1px solid var(--sel-text); outline-offset:1px; }
.sb code, .sb .mono { font-family:"Hack","SF Mono",Menlo,ui-monospace,monospace; font-size:11.5px; }
.sb .weak { color:var(--weak); } .sb .faint { color:var(--faint); } .sb .strong { color:var(--strong); }
.sb .small { font-size:11px; }
.sb .grow { flex:1; min-width:0; }
.sb .sep { width:1px; align-self:stretch; background:var(--line2); margin:2px 4px; flex:none; }

/* egui buttons */
.sb button { font:inherit; color:var(--text); background:var(--w); border:1px solid transparent; border-radius:2px;
  padding:1px 6px; min-height:20px; cursor:default; white-space:nowrap; }
.sb button:hover:not(:disabled) { background:var(--w-hover); color:var(--strong); border-color:#7d7d7d; }
.sb button:active:not(:disabled) { background:var(--w-active); }
.sb button:disabled { opacity:.42; }
.sb button.frameless { background:transparent; }
.sb button.frameless:hover:not(:disabled) { background:var(--w-hover); border-color:transparent; }
.sb button.on, .sb button[aria-pressed=true] { background:var(--sel); color:var(--sel-text); border-color:transparent; }
.sb button.small { min-height:16px; padding:0 4px; font-size:12px; }
.sb button.link { background:none; border:none; color:var(--link); padding:0; min-height:0; }
.sb button.link:hover { text-decoration:underline; background:none; }

/* egui checkbox */
.sb label.check { display:inline-flex; align-items:center; gap:5px; white-space:nowrap; }
.sb input[type=checkbox] { appearance:none; margin:0; width:14px; height:14px; border-radius:2px; background:var(--w);
  display:inline-grid; place-content:center; flex:none; }
.sb input[type=checkbox]:hover { background:var(--w-hover); }
.sb input[type=checkbox]:checked::after { content:""; width:7px; height:3.5px; border:solid var(--strong);
  border-width:0 0 1.6px 1.6px; transform:translateY(-1px) rotate(-45deg); }
.sb input[type=checkbox]:disabled { opacity:.4; }

/* egui text edit / combo / slider */
.sb input[type=text], .sb select { font:inherit; color:var(--strong); background:var(--extreme); border:1px solid transparent;
  border-radius:2px; padding:2px 5px; min-width:0; min-height:21px; user-select:text; }
.sb input[type=text]:hover { border-color:var(--line2); }
.sb input[type=text]:focus { outline:none; border-color:var(--sel); }
.sb input::placeholder { color:var(--faint); }
.sb select { background:var(--w); color:var(--text); appearance:none; padding-right:16px;
  background-image:linear-gradient(45deg,transparent 50%,var(--text) 50%),linear-gradient(135deg,var(--text) 50%,transparent 50%);
  background-position:calc(100% - 9px) 9px, calc(100% - 5px) 9px; background-size:4px 4px; background-repeat:no-repeat; }
.sb select:hover { background-color:var(--w-hover); }
.sb input[type=range] { appearance:none; height:14px; background:transparent; min-width:60px; }
.sb input[type=range]::-webkit-slider-runnable-track { height:4px; background:var(--w); border-radius:2px; }
.sb input[type=range]::-webkit-slider-thumb { appearance:none; width:12px; height:12px; margin-top:-4px; border-radius:50%;
  background:#a0a0a0; border:1px solid #c8c8c8; }
.sb input[type=range]:hover::-webkit-slider-thumb { background:var(--strong); }

/* Top menu bar (SuperBrick toolbar) */
.sb-menubar { display:flex; align-items:center; gap:4px; padding:5px 8px; background:var(--panel);
  border-bottom:1px solid var(--line); flex-wrap:wrap; row-gap:4px; }
.sb-brand { display:flex; align-items:center; gap:6px; margin-right:4px; color:var(--strong); font-weight:600; font-size:14px; }
.sb-brand img { width:20px; height:20px; display:block; }
.sb-seg { display:inline-flex; gap:2px; }
.sb-seg button { background:transparent; }
.sb-seg button:not(.on):hover:not(:disabled) { background:var(--w-hover); border-color:transparent; }

/* Dock areas (egui_dock) */
.sb-area { display:flex; flex-direction:column; min-height:0; background:var(--panel); margin:0 3px; overflow:hidden; }
.sb-main { flex:1 1 auto; margin-top:3px; }
.sb-tabs { display:flex; align-items:flex-end; gap:2px; padding:3px 3px 0; background:var(--extreme); min-height:27px; flex:none;
  box-shadow:inset 0 -1px 0 var(--tab-line); overflow-x:auto; scrollbar-width:none; }
.sb-tabs::-webkit-scrollbar { display:none; }
.sb .sb-tab { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; color:var(--weak); white-space:nowrap;
  background:var(--dock); border:1px solid var(--tab-line); border-bottom:none; border-radius:4px 4px 0 0; min-height:0;
  font-size:13.5px; cursor:default; }
.sb .sb-tab:hover:not(:disabled) { color:var(--text); background:#161616; border-color:var(--tab-line); }
.sb .sb-tab[aria-selected=true], .sb .sb-tab[aria-selected=true]:hover { color:#dcdcdc; background:var(--panel); position:relative; z-index:1;
  box-shadow:0 1px 0 var(--panel); }
.sb-tab .count { font-size:11px; color:var(--weak); }
.sb-tab .count.hot { color:var(--sel-text); background:var(--sel); border-radius:7px; padding:0 5px; line-height:15px; }
.sb .sb-tab .x { display:grid; place-items:center; width:16px; height:16px; min-height:0; padding:0; margin-right:-4px; background:none;
  border:none; color:var(--weak); }
.sb .sb-tab .x:hover { color:var(--strong); background:none; border:none; }
.sb-tab .x svg { width:10px; height:10px; }

/* Viewport */
.sb-viewbar { display:flex; align-items:center; gap:3px; padding:4px 6px; background:var(--panel); flex-wrap:wrap; row-gap:3px; flex:none; }
.sb-viewbar .check { margin-left:6px; }
.sb .icon { display:inline-grid; place-items:center; padding:0; width:22px; }
.sb .icon svg { width:11px; height:11px; }
.sb .push { margin-left:auto; }
.sb-step + .icon { margin-left:6px; }
.sb-step { display:inline-flex; align-items:center; gap:4px; margin-left:auto; }
.sb-step .mono { min-width:44px; text-align:right; color:var(--weak); }
.sb-viewport { position:relative; flex:1; min-height:140px; background:var(--view); margin:0 3px 3px; overflow:hidden; }
.sb-canvas, .sb-canvas canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
.sb-canvas canvas:focus { outline:none; }
.sb-overlay { position:absolute; pointer-events:none; color:#8d939a; font-size:12.5px; }
.sb-overlay.br { right:10px; bottom:8px; text-align:right; }
.sb-overlay.bl { left:10px; bottom:8px; max-width:60%; }
.sb-overlay.tl { left:10px; top:8px; }
.sb-overlay .generated { color:#ffc861; }
.sb-busy { display:inline-block; width:11px; height:11px; border-radius:50%; border:1.5px solid #ffffff30;
  border-top-color:var(--sel-text); animation:sb-spin .8s linear infinite; vertical-align:-1px; }
@keyframes sb-spin { to { transform:rotate(360deg); } }
.sb-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  text-align:center; padding:24px; color:#9aa1aa; }
.sb-empty img { width:56px; height:56px; opacity:.9; }
.sb-empty .title { color:var(--strong); font-size:16px; }

/* Splitter between viewport and dock */
.sb-split { height:5px; margin:0 3px; cursor:row-resize; flex:none; position:relative; }
.sb-split::after { content:""; position:absolute; left:45%; right:45%; top:2px; height:1px; background:var(--line2); }
.sb-split:hover::after, .sb-split.drag::after { background:var(--sel-text); left:0; right:0; }

/* Dock content */
.sb-dock { flex:none; margin-bottom:3px; }
.sb-body { overflow:auto; padding:8px 10px 12px; flex:1; min-height:0; user-select:text; }
.sb-body h2 { font-size:18px; font-weight:400; color:var(--strong); margin:0 0 2px; letter-spacing:0; }
.sb-body p { margin:4px 0; }
.sb-hint { font-size:11px; color:var(--weak); margin:0 0 6px; }
.sb-row { display:flex; align-items:center; gap:6px; min-height:22px; flex-wrap:wrap; }
.sb-row + .sb-row { margin-top:2px; }
.sb .sb-collapse { display:flex; align-items:center; gap:5px; cursor:default; color:var(--strong); font-weight:600; padding:3px 0;
  background:none; border:none; min-height:0; width:100%; text-align:left; }
.sb .sb-collapse:hover:not(:disabled) { background:none; border-color:transparent; color:#fff; }
.sb-collapse .tri { width:0; height:0; border:4px solid transparent; border-left:6px solid currentColor; border-right:0; transition:transform .1s; }
.sb-collapse.open .tri { transform:rotate(90deg); }
.sb-indent { padding-left:16px; border-left:1px solid var(--line); margin-left:4px; }
.sb-draft { display:flex; align-items:center; gap:6px; min-height:22px; padding:1px 0; }
.sb-draft .label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sb-draft .who { margin-left:6px; font-size:11px; color:var(--weak); }
.sb-nocheck { width:14px; flex:none; }
.sb-all { margin:0 0 4px; }
.sb-bulk { margin:6px 0 2px; padding-top:6px; border-top:1px solid var(--line); }
.sb .sb-collapse { margin-top:8px; font-weight:400; color:var(--text); }
.sb-draft .label.pending { color:var(--pending); } .sb-draft .label.stale { color:var(--stale); }
.sb-draft .label.blocked { color:var(--blocked); } .sb-draft .label.accepted { color:var(--accepted); }
.sb-draft .label.rejected, .sb-draft .label.withdrawn { color:var(--weak); }
.sb-draft .delta { font-family:"Hack","SF Mono",Menlo,monospace; font-size:11px; color:var(--weak); }
.sb-draft .actions { display:flex; gap:3px; opacity:.45; transition:opacity .08s; }
.sb-draft:hover .actions, .sb-draft:focus-within .actions { opacity:1; }
.sb-sub { font-size:11px; color:var(--weak); margin:-1px 0 3px 20px; }
.sb-body > .sb-sub { margin-left:0; }
.sb-sub.warn { color:#c9a65a; }

.sb button.danger { background:#6e2323; color:#ffd6d6; }
.sb button.danger:hover:not(:disabled) { background:#8a2c2c; border-color:#b04848; }
.sb textarea { font:inherit; color:var(--strong); background:var(--extreme); border:1px solid transparent; border-radius:2px;
  padding:4px 6px; width:100%; min-height:48px; resize:vertical; user-select:text; }
.sb textarea:focus { outline:none; border-color:var(--sel); }
.sb-confirm { display:flex; flex-direction:column; gap:5px; margin:4px 0 8px; padding:7px 8px; background:#202020;
  border:1px solid var(--line2); border-radius:3px; }
.sb-body { position:relative; }
.sb-banner summary { cursor:default; }
details.sb-banner { display:block; }

/* Notices */
.sb-banner { display:flex; align-items:center; gap:8px; padding:4px 10px; margin:3px 3px 0; font-size:12px; background:#232323; color:var(--text);
  border:1px solid var(--line); border-radius:2px; }
.sb-banner.err { background:#2a1d1d; color:#f0b0b0; border-color:#4a2a2a; }
.sb-banner .grow { overflow-wrap:anywhere; }
.sb-banner button.small { flex:none; }
.sb-banner svg { width:9px; height:9px; }

/* Activity (egui-style log) */
.sb-log { display:grid; grid-template-columns:auto auto 1fr; column-gap:8px; row-gap:1px; align-items:baseline; }
.sb-log .t { color:var(--faint); font-family:"Hack","SF Mono",Menlo,monospace; font-size:11px; }
.sb-log .tool { color:var(--strong); white-space:nowrap; }
.sb-log .tool .dot { display:inline-block; width:7px; height:7px; border-radius:50%; margin-right:5px; background:var(--faint); vertical-align:1px; }
.sb-log .tool .dot.running { background:var(--sel-text); animation:sb-pulse 1s ease-in-out infinite; }
.sb-log .tool .dot.completed { background:var(--ok); } .sb-log .tool .dot.error { background:var(--err); }
@keyframes sb-pulse { 50% { opacity:.3; } }
.sb-log .what { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text); }
.sb-log .extra { grid-column:2 / 4; margin:1px 0 5px; display:flex; flex-direction:column; gap:3px; }
.sb-log .extra .err { color:var(--err); font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; }
.sb-log .extra img { max-width:min(100%,320px); border-radius:3px; background:#e8ebf0; }
.sb-log .extra .mono { color:var(--weak); overflow-wrap:anywhere; }

/* Artifacts: the Parts panel's thumbnail grid */
.sb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); gap:8px; }
.sb .sb-tile { display:flex; flex-direction:column; gap:4px; min-width:0; background:none; border:none; padding:0; text-align:left; }
.sb .sb-tile:hover:not(:disabled) { background:none; border-color:transparent; }
.sb-thumb { aspect-ratio:1; border-radius:6px; background:#e8ebf0; display:grid; place-items:center; overflow:hidden;
  border:2px solid transparent; }
.sb-tile:hover .sb-thumb { border-color:var(--w-hover); }
.sb-tile.active .sb-thumb { border-color:var(--sel); }
.sb-thumb img { width:100%; height:100%; object-fit:contain; }
.sb-thumb svg { width:46%; height:46%; }
.sb-tile .name { display:flex; align-items:center; gap:4px; color:var(--text); }
.sb-tile .name span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.sb-tile .kind { width:12px; height:12px; border:1px solid var(--weak); border-radius:1px; flex:none; }
.sb-tile .kind.model { border-color:#ffc861; }
.sb-lightbox { position:absolute; inset:0; z-index:5; background:#000c; display:flex; flex-direction:column; padding:14px; gap:8px; }
.sb-lightbox img { flex:1; min-height:0; object-fit:contain; background:#e8ebf0; border-radius:4px; width:100%; }

/* Project settings (egui Grid) */
.sb-form { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:5px 8px; align-items:center; margin:8px 0; }
.sb-form > label { color:var(--weak); text-align:right; }
.sb-chips { display:flex; flex-wrap:wrap; gap:2px 10px; grid-column:2 / 4; }
.sb-chips button { background:transparent; padding:0 2px; }
.sb-kv { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; font-size:12px; margin-top:10px; }
.sb-kv > :nth-child(odd) { color:var(--weak); }

/* Status bar */
.sb-status { display:flex; align-items:center; gap:0; padding:3px 8px; min-height:22px; background:var(--panel);
  border-top:1px solid var(--line); color:var(--text); font-size:12.5px; white-space:nowrap; overflow:hidden; flex:none; }
.sb-status > span { overflow:hidden; text-overflow:ellipsis; }
.sb-status > span + span::before { content:""; display:inline-block; width:1px; height:12px; background:var(--line2); margin:0 9px; vertical-align:-1px; }
.sb-status .note { color:var(--sel-text); }
.sb-status > span.grow::before, .sb-status > span.grow + span::before { display:none; }

/* Focus mode: just the build, controls float over it */
.sb.focus > :not(.sb-main):not(style) { display:none; }
.sb.focus .sb-main { margin:0; }
.sb.focus .sb-main > :not(.sb-viewport) { display:none; }
.sb.focus .sb-viewport { margin:0; }
.sb-float { position:absolute; display:flex; align-items:center; gap:3px; padding:3px; background:#1b1b1bd9; border:1px solid var(--line);
  border-radius:3px; opacity:0; transition:opacity .15s; }
.sb-viewport:hover .sb-float, .sb-float:focus-within { opacity:1; }
.sb-float.top { top:8px; right:8px; }
.sb-float.bottom { bottom:8px; left:50%; transform:translateX(-50%); padding:3px 8px; }
.sb-float .sb-step { margin:0; }
.sb.fullscreen .sb-float button[title="Fill the whole screen"] { display:none; }

@container (max-width:520px) {
  .sb-brand span { display:none; }
  .sb-step input[type=range] { width:70px; }
  .sb-draft .actions { opacity:1; }
}
`;
