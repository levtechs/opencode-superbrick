# Install and setup

## Requirements

- opencode Desktop **2.2.5** (the plugin uses its experimental GUI plugin API)
- Node 20.19+ or 22.12+
- Python 3
- The [SuperBrick app](https://github.com/levtechs/SuperBrick/releases/latest), with its MCP
  server connected to opencode (`sb mcp --user <agent name>`; see
  [SuperBrick's setup guide](https://github.com/levtechs/SuperBrick/blob/main/docs/SETUP.md))

## Install

```sh
git clone https://github.com/levtechs/opencode-superbrick
cd opencode-superbrick
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci
npm run build
```

Add the folder to the `plugins` array in `~/.config/opencode/opencode.jsonc`, keeping any
existing entries:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-superbrick"]
}
```

In a session, open the side panel's **+ → SuperBrick**, or run **SuperBrick: watch build** from
the command palette. **Settings → Extensions → Plugins** turns the panel on or off.

## Settings

These are on the panel's **Project** tab and are kept per opencode session.

| Setting | What it is |
|---|---|
| **Project** | The `.sb` project to watch. Filled in automatically from the agent's tool calls. |
| **Builder** | The agent's `sb --user` name (for example `claude`). It picks whose proposals you see. |
| **Run folder** | Optional. A folder to watch for models and renders the agent writes before proposing them. |
| **Generated** | Optional. The `.ldr` or `.mpd` file **Show → Generated** draws. By default, the newest one in the run folder. |

**Connect** applies changes, **Revert** discards them, and **Re-export** refreshes the view from
the project.

Keep projects out of iCloud Drive and other synced folders. The plugin refuses them, because
syncing a live SQLite file can corrupt it.

## Environment overrides

| Variable | What it sets |
|---|---|
| `SUPERBRICK_PLUGIN_SB` | The `sb` executable |
| `SUPERBRICK_PLUGIN_PYTHON` | The Python 3 interpreter |
| `SUPERBRICK_PLUGIN_LIBRARY` | The LDraw parts library zip |

SuperBrick's own `SB_LDRAW_ZIP`, `BENCH_LDRAW_ZIP`, `BENCH_LDRAW_EXTRA`, `SB_SUPPORT_DIR` and
`SB_NO_LEOCAD` are respected too.

## Development

```sh
npm run check     # type-check
npm test          # build, then unit and integration tests on temporary projects
npm run dev       # rebuild the GUI bundle on change
npm run preview   # browser harness at http://127.0.0.1:4318 with a temporary fixture project
```

Server-side changes need the opencode server plugin reloaded, not just a GUI rebuild.

| File | What |
|---|---|
| `src/server.ts`, `activity.ts`, `rpc.ts` | Tool activity, including sub-agent sessions |
| `src/main.ts`, `contract.ts` | Desktop main-process IPC, per-session settings, launching SuperBrick |
| `src/backend/project.ts` | Short read-only SQLite snapshots of the `.sb` project |
| `src/backend/build.ts` | File watching, exports through `sb`, guarded accept and reject |
| `src/backend/library.ts` | Local LDraw zip lookup and MPD packing (no downloads) |
| `src/viewport.ts`, `viewcube.tsx`, `panel.tsx` | The Three.js view and the Solid UI |

Exports of the accepted model run `sb` without `--user`, so they are read-only. The panel's
accept and reject clicks run as the person, with `SB_ALLOW_HUMAN`.
