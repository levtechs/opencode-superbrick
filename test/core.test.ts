import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoadingManager } from "three";
import { LDrawLoader } from "three/addons/loaders/LDrawLoader.js";
import { LDrawConditionalLineMaterial } from "three/addons/materials/LDrawConditionalLineMaterial.js";
import { ActivityLog, artifactPaths, concise, resultFailed } from "../src/activity";
import { decisionAllowed } from "../src/backend/build";
import { embeddedFiles, normalized, PartsLibrary, references } from "../src/backend/library";
import { cloudProject, findPython, readProject } from "../src/backend/project";
import { run } from "../src/backend/process";
import { ReadonlyZip } from "../src/backend/zip";
import { defaultBinding, emptyProject, validBuilder } from "../src/model";
import type { BuildState } from "../src/model";

test("builder identity and path safety", () => {
  assert.ok(validBuilder("opencode-1"));
  for (const value of ["human", "", "a b", "../x", "x".repeat(33)]) assert.ok(!validBuilder(value));
  assert.ok(cloudProject("/Users/me/Library/Mobile Documents/com~apple~CloudDocs/a.sb"));
  assert.ok(!cloudProject("/Users/me/projects/a.sb"));
  assert.equal(normalized("s\\3001S01.dat"), "s/3001s01.dat");
  for (const value of ["/etc/passwd", "../a.dat", "https://bad/a.dat", "a/../../a.dat"]) assert.throws(() => normalized(value));
  assert.deepEqual(references("1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 0 0 0 0 1 0 0 0 1 0 0 0 1 s\\sub.dat"), ["3001.dat", "s/sub.dat"]);
  assert.deepEqual([...embeddedFiles("0 FILE Main.ldr\n0 FILE Child.ldr")], ["main.ldr", "child.ldr"]);
});

test("activity paths, failures and descendant sessions are bounded and truthful", () => {
  assert.deepEqual(artifactPaths({ command: 'sb render "runs/my house/out.png" && cat runs/a.ldr', secret: "/secret.png" }), ["runs/my house/out.png", "runs/a.ldr"]);
  assert.deepEqual(artifactPaths("https://example.com/private/model.ldr"), []);
  assert.deepEqual(artifactPaths({ action: "open", path: "house.sb", create: true }), ["house.sb"]);
  assert.deepEqual(artifactPaths("see /tmp/a.sbx and ./b.sb."), ["./b.sb"]);
  assert.equal(concise({ label: "Wall clump", command: "huge script" }), "Wall clump");
  assert.ok(resultFailed({ content: '{"ok":false,"text":"collision"}' }));
  assert.ok(resultFailed({ metadata: { exitCode: 1 } }));
  assert.ok(!resultFailed({ content: "UNVERIFIED — no detected errors" }));
  const log = new ActivityLog();
  log.parent("child", "parent");
  const event = { id: "t1", sessionID: "child", agent: "builder", tool: "edit", input: { label: "Roof" } };
  log.before(event);
  assert.equal(log.list("parent")[0].status, "running");
  log.after({ ...event, status: "completed", result: { content: '{"ok":false,"text":"collision"}' } });
  assert.equal(log.list("parent")[0].status, "error");
  assert.match(log.list("parent")[0].detail, /collision/);
  assert.equal(log.list("unrelated").length, 0);
});

test("decisions require explicit current eligible proposals and no native editor", () => {
  const state: BuildState = {
    binding: { ...defaultBinding(), project: "/local.sb" }, project: { ...emptyProject(), revision: "r1", drafts: [
      { id: 1, user: "opencode", label: "Walls", state: "pending", created: 10, modified: 0, removed: 0, dependencies: [], reason: "", note: "" },
      { id: 2, user: "opencode", label: "Roof", state: "blocked", created: 5, modified: 0, removed: 0, dependencies: [1], reason: "", note: "" },
    ] }, previewRevision: "", previewSource: "", busy: false, error: "", updated: 0, artifacts: [],
  };
  decisionAllowed(state, [1], "r1", "accept");
  decisionAllowed(state, [2], "r1", "reject");
  assert.throws(() => decisionAllowed(state, [2], "r1", "accept"), /eligible/);
  assert.throws(() => decisionAllowed(state, [1], "old", "accept"), /changed/);
  assert.throws(() => decisionAllowed(state, [], "r1", "accept"), /specific/);
  assert.throws(() => decisionAllowed(state, [NaN], "r1", "accept"), /specific/);
  state.project.editorOpen = true;
  assert.throws(() => decisionAllowed(state, [1], "r1", "accept"), /Close this project/);
});

test("metadata reader sees WAL, normalizes nulls and never updates agent notifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "superbrick-reader-test-"));
  const path = join(directory, "fixture.sb");
  const python = await findPython();
  const create = String.raw`
import sqlite3,json,sys,os
c=sqlite3.connect(sys.argv[1]); c.executescript("""
PRAGMA journal_mode=WAL;
CREATE TABLE meta(key TEXT,value TEXT);
INSERT INTO meta VALUES('schema','1');
CREATE TABLE working(branch TEXT,tree TEXT,seq INT);
INSERT INTO working VALUES('main','hash',1);
CREATE TABLE drafts(id INT,branch TEXT,json TEXT);
CREATE TABLE leases(branch TEXT,pid INT,renewed REAL);
CREATE TABLE prefs(key TEXT,value TEXT);
INSERT INTO prefs VALUES('user:opencode:told','[]');
""")
d=dict(id=7,session='opencode',label=None,state='pending',touched=dict(created=[1,2]),dependencies=[],note=None,reason=None)
c.execute("INSERT INTO drafts VALUES(7,'main',?)",(json.dumps(d),))
c.execute("INSERT INTO leases VALUES('main',?,0)",(int(sys.argv[2]),)); c.commit()
c.execute("PRAGMA wal_checkpoint(TRUNCATE)"); c.close()
`;
  try {
    await run(python, ["-c", create, path, String(process.pid)]);
    const before = await readFile(path);
    const info = await readProject(path, python);
    assert.equal(info.drafts[0].created, 2);
    assert.equal(info.drafts[0].note, "");
    assert.equal(info.drafts[0].label, "");
    assert.ok(info.editorOpen);
    assert.deepEqual(await readFile(path), before);
    // Keep a WAL connection alive while a separate process reads its committed change.
    const wal = await run(python, ["-c", String.raw`
import sqlite3,sys,subprocess
c=sqlite3.connect(sys.argv[1]); c.execute("UPDATE working SET seq=2"); c.commit()
assert __import__('os').path.getsize(sys.argv[1]+'-wal')>0
print(subprocess.check_output([sys.executable,'-c',sys.argv[2],sys.argv[1]],text=True))
c.close()
`, path, (await import("../src/backend/project")).METADATA_SCRIPT]);
    assert.notEqual(JSON.parse(wal).revision, info.revision);
    assert.equal(await run(python, ["-c", "import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute('SELECT value FROM prefs').fetchone()[0])", path]), "[]\n");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("real library packs a preambled MPD, embedded submodel and missing part with no network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "superbrick-pack-test-"));
  const library = new PartsLibrary();
  try {
    const source = "\n0 Generated preview\n0 FILE Main.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 Child.ldr\n0 FILE Child.ldr\n1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n1 0 100 0 0 1 0 0 0 1 0 0 0 1 definitely_missing.dat\n";
    const path = join(directory, "main.mpd");
    await writeFile(path, source);
    const packed = await library.pack(source, path);
    assert.ok(packed.text.startsWith("0 FILE main.ldr\n"));
    assert.ok(packed.text.includes("0 FILE 3001.dat"));
    assert.equal(packed.warnings.length, 1);
    const manager = new LoadingManager();
    manager.setURLModifier(() => { throw new Error("Unexpected network dependency"); });
    const loader = new LDrawLoader(manager);
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    const group = await new Promise<import("three").Group>((done, fail) => loader.parse(packed.text, done, fail));
    let meshes = 0;
    group.traverse((node) => { if ((node as import("three").Mesh).isMesh) meshes++; });
    assert.ok(meshes > 0, "real brick geometry loaded");
  } finally { library.close(); await rm(directory, { recursive: true, force: true }); }
});

test("read-only ZIP adapter supports stored, deflated and ZIP64 libraries; rejects truncation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "superbrick-zip-test-"));
  const python = await findPython();
  try {
    await run(python, ["-c", String.raw`
import sys,zipfile,struct,pathlib
root=pathlib.Path(sys.argv[1]); path=root/'normal.zip'
with zipfile.ZipFile(path,'w') as z:
 z.writestr('ldraw/parts/Stored.dat','0 stored',compress_type=zipfile.ZIP_STORED)
 z.writestr('ldraw/p/8/curve.dat','0 deflated\n'*100,compress_type=zipfile.ZIP_DEFLATED)
data=path.read_bytes(); end=len(data)-22
count,size,offset=struct.unpack_from('<HII',data,end+10)
record=struct.pack('<IQHHIIQQQQ',0x06064b50,44,45,45,0,0,count,count,size,offset)
locator=struct.pack('<IIQI',0x07064b50,0,end,1)
eocd=bytearray(data[end:]); struct.pack_into('<HHII',eocd,8,0xffff,0xffff,0xffffffff,0xffffffff)
(root/'zip64.zip').write_bytes(data[:end]+record+locator+eocd)
(root/'broken.zip').write_bytes(data[:-10])
`, directory]);
    for (const file of ["normal.zip", "zip64.zip"]) {
      const zip = await ReadonlyZip.open(join(directory, file));
      try {
        assert.equal(await zip.read(zip.entries.get("parts/stored.dat")!), "0 stored");
        assert.equal(await zip.read(zip.entries.get("p/8/curve.dat")!), "0 deflated\n".repeat(100));
      } finally { zip.close(); }
    }
    await assert.rejects(ReadonlyZip.open(join(directory, "broken.zip")), /ZIP/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
