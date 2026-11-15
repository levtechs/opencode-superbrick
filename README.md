# SuperBrick companion for OpenCode

A local OpenCode Desktop plugin with an orbitable LEGO viewport, live SuperBrick proposals, actual agent/tool activity, and generated-file previews. **No SuperBrick modifications or agent-workflow changes required.**

## Use

1. Open a session's side-panel **+ → SuperBrick**, or run **SuperBrick: watch build** from the command palette.
2. Click **Project**, choose the exact `.sb` project, and set **Builder** to the identity used by `sb --user …` (for the existing Claude setup, `claude`). Click **Connect**.
3. Choose **Accepted main**, **Builder**, or **Generated • not proposed**. Drag to orbit, right-drag to pan, scroll to zoom. Ordinary model updates preserve the camera.
4. Optionally choose a run folder to follow `.ldr`/`.mpd` files and renders generated before proposals reach SuperBrick. Pick a specific model in **Artifacts**, or leave the generated-file field empty to follow the newest model.

Bindings are persisted separately for each OpenCode server/session. The full canonical project path is available in the path row's tooltip and Project settings; same-named projects in different folders are not interchangeable.

### Proposals and safety

- Selection and explicit confirmation are required for accept/reject. Reject supports feedback notes; “Ask agent” only inserts text into the composer.
- Decisions are disabled while the native SuperBrick editor holds this project's lease. Its current conflict fallback can overwrite external changes. Close that project in SuperBrick before deciding here, and **do not open it or run another human writer while saving**. This guard is not an atomic cross-process lock.
- Proposals remain separate per builder. The viewport never merges all agents' drafts into an invented authoritative model.
- A generated preview is **not yet proposed**. Viewing it does not import, approve, or validate anything.
- Validation results remain in the original tool conversation/artifacts. Successful execution, missing error overlays, and rendered geometry are not proof of build legality.
- Live cloud-synced SQLite projects are rejected; use local project storage.

### Activity and limitations

The server plugin captures real tool start/finish/error events, including descendant-agent sessions. The panel also shows background task labels and discovers local model/render paths from tool inputs/results. It does not fabricate placement animation or progress percentages. If an agent generates an entire model externally and imports it at the end, the preview changes only when the generated file or project actually changes.

Activity is bounded, in-memory, and starts when this plugin loads; it is not a replay of older session history. Ordinary external PNG/JPEG/WebP artifacts are shown from the selected run folder or discovered tool paths. Some tools' inline images may not be exposed in the standard tool-result format.

This is a **viewer, not the native editor embedded**. It uses Three.js and the installed LDraw library, so appearance can differ from SuperBrick. There is no stable-ID brick picking, native editor panel, remote-project support, or new agent orchestration/MCP routing. The builder setting does not change the agent's MCP identity.

## Install / develop

Targets OpenCode **2.2.5** and its experimental GUI plugin API. Requires Node 20.19+/22.12+, installed SuperBrick, Python 3 (standard `sqlite3` module), and the same local LDraw ZIP/extras used by SuperBrick.

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run check
npm test
npm run build
```

Add this package's absolute directory to the **global** `~/.config/opencode/opencode.jsonc` `plugins` array, preserving existing entries:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-superbrick"]
}
```

OpenCode watches plugin configuration. `npm run dev` watches/rebuilds the GUI bundle. Server-source changes require reloading the server plugin, not just rebuilding the GUI. Settings → Extensions → Plugins controls GUI enablement.

Optional environment overrides (inherited by OpenCode Desktop):

- `SUPERBRICK_PLUGIN_SB`: installed `sb` executable.
- `SUPERBRICK_PLUGIN_PYTHON`: Python executable.
- `SUPERBRICK_PLUGIN_LIBRARY`: LDraw ZIP.
- Existing `SB_LDRAW_ZIP`, `BENCH_LDRAW_ZIP`, `BENCH_LDRAW_EXTRA`, `SB_SUPPORT_DIR` and `SB_NO_LEOCAD` library conventions are respected.

`npm run preview` runs a development-only browser harness at `http://127.0.0.1:4318` with a **temporary fixture**, not your project. It disables native launching and human decisions. Stop with Ctrl+C to clean up.

## Architecture

- `src/server.ts`, `activity.ts`, `rpc.ts`: bounded tool activity and parent-session aggregation; no new agent tools or instructions.
- `src/main.ts`, `contract.ts`: typed desktop main/window IPC, per-session settings, native chooser and installed-app launching.
- `src/backend/project.ts`: short read-only SQLite snapshots including WAL, without consuming agent feedback or camera preferences.
- `src/backend/build.ts`: file watchers plus reconciliation, coalesced exports, stale-result rejection, guarded explicit decisions.
- `src/backend/library.ts`: lazy local ZIP lookup and self-contained MPD packing; no HTTP part downloads.
- `src/viewport.ts`, `panel.tsx`: interactive Three.js viewport and Solid UI.

Existing `sb PROJECT --user BUILDER export -o …` provides the builder's effective model without calling the agent tool dispatcher or consuming decision notifications. Initializing that existing export path can initialize observation hashes; it is not a new strictly read-only SuperBrick API. Accepted-only export avoids that path. All temporary exports belong to the plugin and are removed when their session view closes.

Tests use temporary SQLite/SuperBrick projects only: WAL visibility, unchanged feedback preferences, proposal guards, accepted/builder exports, real explicit reject/accept, generated refresh, MPD/subpart loading without network, artifact extraction and child-agent activity.
