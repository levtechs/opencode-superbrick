import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import * as effect from "effect";
import * as solid from "solid-js";

test("shared GUI bundle evaluates without renderer Node globals or a main-process DOM", async () => {
  const code = await readFile(new URL("../dist/gui-experimental.cjs", import.meta.url), "utf8");
  const require = createRequire(import.meta.url);
  const exports: { default?: { main?: unknown; setup?: unknown } } = {};
  const gui = {
    Plugin: { define: (spec: unknown) => spec },
    Ipc: { define: (spec: { methods: object }) => {
      for (const reserved of ["state", "on", "spec"]) assert.ok(!(reserved in spec.methods), `Reserved IPC client method: ${reserved}`);
      return spec;
    } },
  };
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (name === "@opencode/plugin/gui") return gui;
      if (name === "@opencode/plugin/rpc") return { Rpc: { define: (spec: unknown) => spec } };
      if (name === "effect") return effect;
      if (name === "solid-js") return solid;
      if (name === "solid-js/web") return new Proxy({}, { get: () => () => {} });
      if (name === "electron") return {};
      return require(name);
    },
    console,
    // Deliberately no process, Buffer, window or document.
  }, { timeout: 5_000 });
  assert.equal(typeof exports.default?.main, "function");
  assert.equal(typeof exports.default?.setup, "function");
});
