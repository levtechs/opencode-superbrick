import { createServer as httpServer } from "node:http";
import { createServer as viteServer } from "vite";
import solid from "vite-plugin-solid";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Build } from "../src/backend/build";
import { PartsLibrary } from "../src/backend/library";
import { findBinary, findPython } from "../src/backend/project";
import { run } from "../src/backend/process";
import { defaultBinding } from "../src/model";
import type { Binding } from "../src/model";

// Local, development-only UI harness. Uses the real backend and an isolated demo project.
// No OS file chooser, launching native apps, human decisions, or arbitrary filesystem endpoint.
const directory = await mkdtemp(join(tmpdir(), "superbrick-ui-demo-"));
const project = join(directory, "demo.sb");
const sb = await findBinary();
const python = await findPython();
const library = new PartsLibrary();
const root = join(import.meta.dirname);
const model = [
  "0 Demo base",
  "1 4 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat",
  "1 1 0 -24 0 1 0 0 0 1 0 0 0 1 3001.dat",
].join("\n");
await writeFile(join(directory, "base.ldr"), model);
await run(sb, ["--new", project, "--import", join(directory, "base.ldr")]);
await run(sb, [project, "--user", "opencode", "--no-images", "edit", JSON.stringify({
  label: "Yellow roof course", step: true, ops: [{ op: "add", part: "3001.dat", color: 14, pos: [0, -48, 0] }],
})]);
const build = new Build(
  { key: "demo\ndemo", serverID: "demo", sessionID: "demo", directory },
  { ...defaultBinding(), project, runDirectory: directory },
  { sb, python, library },
);
build.start();
const vite = await viteServer({ configFile: false, root, plugins: [solid()], server: { middlewareMode: true } });
const server = httpServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    // Block cross-origin requests to even the development loopback endpoint.
    const origin = request.headers.origin;
    if (origin && origin !== `http://${request.headers.host}`) { response.writeHead(403).end(); return; }
    let bytes = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 100_000) request.destroy();
      else chunks.push(chunk);
    });
    request.on("end", () => void (async () => {
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        let value: unknown;
        switch (request.url) {
          case "/api/state": value = JSON.stringify(build.state); break;
          case "/api/preview": value = JSON.stringify(build.snapshot() ?? null); break;
          case "/api/refresh": await build.refresh(true); break;
          case "/api/configure": await build.configure(data.binding as Binding); value = JSON.stringify(build.state); break;
          case "/api/discover": await build.discover(data.paths); break;
          case "/api/image": value = await build.image(data.path); break;
          case "/api/choose": value = ""; break;
          default: throw new Error("Not supported in development preview");
        }
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ value }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
    })());
  } else vite.middlewares(request, response);
});
server.listen(4318, "127.0.0.1", () => console.log("SuperBrick UI demo: http://127.0.0.1:4318 (temporary fixture only)"));
async function close() {
  server.close();
  await vite.close();
  await build.close();
  library.close();
  await rm(directory, { recursive: true, force: true });
  process.exit(0);
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
