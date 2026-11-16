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
  background:var(--view); color:var(--text);
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

.sb-seg { display:inline-flex; gap:2px; }
.sb-seg button { background:transparent; }
.sb-seg button:not(.on):hover:not(:disabled) { background:var(--w-hover); border-color:transparent; }

/* Drawer tabs (egui_dock) */
.sb-tabs { display:flex; align-items:flex-end; gap:2px; padding:4px 6px 0; background:var(--extreme); min-height:27px; flex:none;
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

/* Stage: the build, full bleed, with a few floating controls */
.sb-stage { position:relative; flex:1 1 auto; min-height:120px; overflow:hidden; background:var(--view); }
.sb-canvas, .sb-canvas canvas { position:absolute; inset:0; width:100%; height:100%; display:block; touch-action:none; }
.sb-canvas canvas:focus { outline:none; }
.sb-hud { position:absolute; display:flex; align-items:center; gap:10px; color:#a9b0b8; font-size:12.5px; }
.sb-hud.tl { top:9px; left:10px; }
.sb-hud.br { right:12px; bottom:9px; pointer-events:auto; }
.sb-hud .count { color:#8d939a; }
.sb-hud button { background:#1b1b1bcc; border-color:#ffffff14; }
.sb-hud input[type=checkbox] { background:#1b1b1bcc; box-shadow:inset 0 0 0 1px #ffffff1a; }
.sb-busy { display:inline-block; width:11px; height:11px; border-radius:50%; border:1.5px solid #ffffff30;
  border-top-color:var(--sel-text); animation:sb-spin .8s linear infinite; vertical-align:-1px; flex:none; }
@keyframes sb-spin { to { transform:rotate(360deg); } }
.sb-step { display:inline-flex; align-items:center; gap:6px; }
.sb-step .mono { color:#8d939a; }
.sb-step input[type=range] { width:110px; }
.sb-empty { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
  text-align:center; padding:24px; color:#9aa1aa; }
.sb-empty img { width:52px; height:52px; opacity:.85; }
.sb-empty .title { color:var(--strong); font-size:15px; }

/* View cube (CAD navigation cube, SuperBrick's Z-up axes) */
.sb-cube-wrap { position:absolute; top:6px; right:6px; width:120px; height:120px; }
.sb-cube-wrap { cursor:grab; touch-action:none; user-select:none; }
.sb-cube-wrap:active { cursor:grabbing; }
.sb-cube { position:absolute; left:50%; top:50%; width:0; height:0; transform-style:preserve-3d; }
.sb .sb-cube .face { position:absolute; left:-24px; top:-24px; width:48px; height:48px; min-height:0; padding:0; display:grid; place-items:center;
  font:600 10.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; color:#3a4048; letter-spacing:0;
  background:rgba(222,227,233,.86); border:1px solid rgba(255,255,255,.7); border-radius:9px;
  box-shadow:inset 0 0 7px rgba(40,50,60,.28); backface-visibility:hidden; cursor:pointer; }
.sb .sb-cube .face:hover { background:rgba(170,212,255,.95); color:#0b2a44; border-color:#fff; }
.sb-cube .front { transform:translateZ(24px); }
.sb-cube .back { transform:rotateY(180deg) translateZ(24px); }
.sb-cube .right { transform:rotateY(90deg) translateZ(24px); }
.sb-cube .left { transform:rotateY(-90deg) translateZ(24px); }
.sb-cube .top { transform:rotateX(90deg) translateZ(24px); }
.sb-cube .bottom { transform:rotateX(-90deg) translateZ(24px); }
.sb-axes { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; overflow:visible; }
.sb-axes text { font:600 11px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; }

/* Pull tab that opens the drawer */
.sb .sb-pull { position:absolute; left:50%; bottom:0; transform:translateX(-50%); display:flex; align-items:center; gap:5px;
  height:18px; min-height:0; padding:0 14px; border-radius:7px 7px 0 0; background:#1b1b1bd9; border:1px solid var(--line2);
  border-bottom:none; color:var(--weak); }
.sb .sb-pull:hover:not(:disabled) { background:var(--panel); color:var(--strong); border-color:#5a5a5a; }
.sb-pull svg { width:12px; height:8px; }
.sb-pull .badge { font-size:10.5px; line-height:13px; padding:0 5px; border-radius:7px; background:var(--w); color:var(--text); }
.sb-pull.hot .badge { background:var(--sel); color:var(--sel-text); }
.sb-pull .dot { width:6px; height:6px; border-radius:50%; background:var(--sel-text); animation:sb-pulse 1s ease-in-out infinite; }

/* Toasts */
.sb-toast { position:absolute; left:50%; transform:translateX(-50%); max-width:min(80%,520px); display:flex; align-items:center; gap:8px;
  padding:4px 6px 4px 10px; font-size:12px; border-radius:3px; background:#1b1b1bee; border:1px solid var(--line2); }
.sb-toast.err { top:44px; color:#f0b0b0; background:#2a1d1dee; border-color:#4a2a2a; }
.sb-toast.note { bottom:28px; color:var(--sel-text); padding-right:10px; }
.sb-toast .grow { overflow-wrap:anywhere; }
.sb-toast svg { width:9px; height:9px; }

/* Drawer */
.sb-drawer { position:relative; flex:none; display:flex; flex-direction:column; min-height:0; background:var(--panel); border-top:1px solid var(--line2); }
.sb-grip { position:absolute; left:0; right:0; top:-4px; height:7px; cursor:row-resize; z-index:2; }
.sb-grip:hover, .sb-drawer.drag .sb-grip { background:linear-gradient(transparent 3px,var(--sel-text) 3px,var(--sel-text) 4px,transparent 4px); }
.sb .icon { display:inline-grid; place-items:center; padding:0; width:22px; }
/* Drawer content */
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
.sb details summary { cursor:default; }

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

@container (max-width:520px) {
  .sb-step input[type=range] { width:70px; }
  .sb-draft .actions { opacity:1; }
}
`;
