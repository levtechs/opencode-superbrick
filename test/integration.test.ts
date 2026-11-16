import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Build } from "../src/backend/build";
import { PartsLibrary } from "../src/backend/library";
import { findBinary, findPython } from "../src/backend/project";
import { run } from "../src/backend/process";
import { defaultBinding } from "../src/model";

// Fixtures stand in for a person's own base model; sb treats a piped (non-terminal) import as an agent's draft.
const fixtureEnv = { ...process.env, SB_ALLOW_HUMAN: "1" };

test("installed SuperBrick: drafts, accepted/builder preview, explicit decisions and generated refresh", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "superbrick-integration-"));
  const project = join(directory, "test.sb");
  const sb = await findBinary();
  const python = await findPython();
  const library = new PartsLibrary();
  const binding = { ...defaultBinding(), project };
  const build = new Build({ key: "local\nfixture", sessionID: "fixture", serverID: "local", directory }, binding, { sb, python, library });
  try {
    const base = join(directory, "base.ldr");
    await writeFile(base, "0 Fixture\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n");
    await run(sb, ["--new", project, "--import", base], { timeout: 60_000, env: fixtureEnv });
    const proposed = JSON.parse(await run(sb, [project, "--user", "opencode", "--no-images", "edit",
      JSON.stringify({ label: "Second brick", step: true, ops: [{ op: "add", part: "3001.dat", color: 14, pos: [0, -24, 0] }] }),
    ], { timeout: 60_000 }));
    assert.ok(proposed.ok, proposed.text);
    const prefs = () => run(python, ["-c", "import sqlite3,sys; print(sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True).execute('SELECT key,hex(value) FROM prefs ORDER BY key').fetchall())", project]);
    const beforePreview = await prefs();
    await build.refresh();
    assert.equal(await prefs(), beforePreview, "preview exports do not consume feedback or save camera preferences");
    assert.equal(build.state.error, "");
    assert.equal(build.state.project.drafts.filter((d) => d.state === "pending").length, 1);
    assert.equal(build.snapshot()?.parts, 2, "builder sees pending second brick");
    const proposal = build.state.project.drafts.find((d) => d.state === "pending")!;
    await build.configure({ ...binding, view: "accepted" });
    assert.equal(build.snapshot()?.parts, 1, "accepted view excludes drafts");
    await assert.rejects(build.decide("accept", [proposal.id], "", "outdated"), /changed/);
    await build.decide("reject", [proposal.id], "Try a different roof", build.state.project.revision);
    assert.equal(build.state.project.drafts.find((d) => d.id === proposal.id)?.state, "rejected");
    const second = JSON.parse(await run(sb, [project, "--user", "opencode", "--no-images", "edit",
      JSON.stringify({ label: "Yellow brick", ops: [{ op: "add", part: "3001.dat", color: 14, pos: [0, -24, 0] }] }),
    ], { timeout: 60_000 }));
    assert.ok(second.ok, second.text);
    await build.refresh();
    const pending = build.state.project.drafts.find((d) => d.state === "pending")!;
    await build.decide("accept", [pending.id], "", build.state.project.revision);
    assert.equal(build.snapshot()?.parts, 2, "accepted main changes after an explicit approval");
    const generated = join(directory, "generated.ldr");
    await writeFile(generated, "0 Generated\n1 2 200 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n");
    await build.configure({ ...binding, view: "generated", generated, runDirectory: directory });
    const revision = build.state.previewRevision;
    assert.match(build.snapshot()!.label, /not proposed/);
    await writeFile(generated, "0 Generated\n1 2 200 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 1 200 -24 0 1 0 0 0 1 0 0 0 1 3001.dat\n");
    await build.refresh();
    assert.notEqual(build.state.previewRevision, revision);
    assert.equal(build.snapshot()?.parts, 2);
    // The backend canonicalizes paths (macOS tmpdir /var -> /private/var).
    const canonical = await realpath(generated);
    assert.ok(build.state.artifacts.some((a) => a.path === canonical));
  } finally {
    await build.close();
    library.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("connects by itself to the .sb project the agent creates", { timeout: 120_000 }, async () => {
  const workspace = await mkdtemp(join(tmpdir(), "superbrick-adopt-"));
  const folder = join(workspace, "house");
  const project = join(folder, "house.sb");
  const sb = await findBinary();
  const python = await findPython();
  const library = new PartsLibrary();
  const bound: string[] = [];
  const build = new Build({ key: "local\nadopt", sessionID: "adopt", serverID: "local", directory: workspace },
    defaultBinding(), { sb, python, library, onBind: (b) => bound.push(b.project) });
  try {
    // The agent mentions the project before it exists: keep waiting.
    await build.discover(["house/house.sb"]);
    await build.refresh();
    assert.equal(build.state.binding.project, "");
    await mkdir(folder);
    const base = join(folder, "base.ldr");
    await writeFile(base, "0 Fixture\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n");
    await run(sb, ["--new", project, "--import", base], { timeout: 60_000, env: fixtureEnv });
    await build.refresh();
    for (let i = 0; i < 100 && !build.snapshot(); i++) await new Promise((done) => setTimeout(done, 100));
    const canonical = await realpath(project);
    assert.equal(build.state.binding.project, canonical);
    assert.equal(build.state.binding.runDirectory, await realpath(folder), "follows the agent's working folder");
    assert.deepEqual(bound, [canonical]);
    assert.equal(build.snapshot()?.parts, 1);
  } finally {
    await build.close();
    library.close();
    await rm(workspace, { recursive: true, force: true });
  }
});
