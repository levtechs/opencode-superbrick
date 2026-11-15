import type { MainContext } from "@opencode/plugin/gui/main";
import { dialog } from "electron";
import { spawn } from "node:child_process";
import { BindingSchema, Bridge } from "./contract";
import { Build } from "./backend/build";
import { PartsLibrary } from "./backend/library";
import { defaultBinding } from "./model";
import type { Scope } from "./model";
import { digest, findBinary, findPython } from "./backend/project";

export async function setupMain(ctx: MainContext): Promise<void> {
  const sb = await findBinary(process.env.SUPERBRICK_PLUGIN_SB);
  const python = await findPython(process.env.SUPERBRICK_PLUGIN_PYTHON);
  const library = new PartsLibrary({ libraryPath: process.env.SUPERBRICK_PLUGIN_LIBRARY });
  const builds = new Map<string, { build: Build; windows: Set<number>; idle?: ReturnType<typeof setTimeout> }>();

  const check = (scope: Scope): void => {
    if (scope.key !== `${scope.serverID}\n${scope.sessionID}`) throw new Error("Invalid session scope");
    if (!ctx.serverEndpoints.get(scope.serverID)?.sameMachine) {
      throw new Error("SuperBrick integration requires this desktop's local OpenCode server; remote paths are not local files.");
    }
  };
  const store = (scope: Scope) => ctx.storage.store(`binding:${digest(scope.key)}`, {
    schema: BindingSchema, initial: defaultBinding(),
  });
  const get = (scope: Scope): Build => {
    check(scope);
    let item = builds.get(scope.key);
    if (!item) {
      const windows = new Set<number>();
      const build = new Build(scope, { ...store(scope).value }, { sb, python, library, signal: ctx.signal }, () => {
        for (const window of windows) provider.emit("updated", { key: scope.key }, window);
      });
      item = { build, windows };
      builds.set(scope.key, item);
    }
    item.build.scope.directory = scope.directory;
    return item.build;
  };
  const release = (key: string, window: number): void => {
    const item = builds.get(key);
    if (!item) return;
    item.windows.delete(window);
    if (item.windows.size || item.idle) return;
    // Brief tab switches should not kill an in-flight export or a user decision.
    item.idle = setTimeout(() => {
      builds.delete(key);
      void item.build.close();
    }, 60_000);
    item.idle.unref?.();
  };
  const provider = ctx.provide(Bridge, {
    watch(scope, caller) {
      const build = get(scope);
      const item = builds.get(scope.key)!;
      clearTimeout(item.idle);
      item.idle = undefined;
      item.windows.add(caller.window);
      build.start();
      return JSON.stringify(build.state);
    },
    release(scope, caller) { release(scope.key, caller.window); },
    status: (scope) => JSON.stringify(get(scope).state),
    async configure({ scope, binding }) {
      const build = get(scope);
      await build.configure({ ...binding });
      store(scope).set(build.state.binding);
      return JSON.stringify(build.state);
    },
    async refresh(scope) { await get(scope).refresh(true); },
    preview: (scope) => JSON.stringify(get(scope).snapshot() ?? null),
    async choose({ scope, kind }, caller) {
      check(scope);
      const window = ctx.windows.get(caller.window);
      if (!window) throw new Error("Window closed");
      const result = await dialog.showOpenDialog(window, {
        title: kind === "project" ? "Choose a local SuperBrick project" : kind === "model" ? "Choose a generated LDraw preview" : "Choose a build run folder",
        defaultPath: get(scope).state.binding.project || scope.directory,
        properties: [kind === "directory" ? "openDirectory" : "openFile"],
        ...(kind === "directory" ? {} : { filters: [{ name: kind === "project" ? "SuperBrick" : "LDraw", extensions: kind === "project" ? ["sb"] : ["ldr", "mpd"] }] }),
      });
      return result.canceled ? "" : result.filePaths[0] || "";
    },
    async open(scope) {
      const path = get(scope).state.binding.project;
      if (!path) throw new Error("Choose a project first");
      await new Promise<void>((done, fail) => {
        const child = spawn(sb, [path], { detached: true, stdio: "ignore" });
        child.once("error", fail);
        child.once("spawn", () => { child.unref(); done(); });
      });
    },
    decide: ({ scope, action, ids, note, revision }) => get(scope).decide(action, ids, note, revision),
    discover: ({ scope, paths }) => get(scope).discover(paths),
    image: ({ scope, path }) => get(scope).image(path),
  });
  ctx.windows.on("close", (window) => {
    for (const key of builds.keys()) release(key, window.id);
  });
  ctx.onCleanup(async () => {
    provider.dispose();
    for (const item of builds.values()) clearTimeout(item.idle);
    await Promise.allSettled([...builds.values()].map((item) => item.build.close()));
    library.close();
  });
}
