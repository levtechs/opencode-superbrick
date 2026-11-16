import { render } from "solid-js/web";
import { BuildUI } from "../src/panel";

type Client = Parameters<typeof BuildUI>[0]["bridge"];
async function call<T = string>(method: string, data: unknown = {}, signal?: AbortSignal): Promise<T> {
  const down = "The preview server isn't running. Start it with `npm run preview`.";
  const response = await fetch(`/api/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal })
    .catch((error) => { if (signal?.aborted) throw error; throw new Error(down); });
  // A stopped (or restarting) dev server answers with an empty or non-JSON body.
  let result: { value?: T; error?: string };
  try { result = JSON.parse(await response.text()); } catch { throw new Error(down); }
  if (!response.ok) throw new Error(result.error || `Preview server error ${response.status}`);
  return result.value as T;
}
const bridge: Client = {
  watch: (_scope, options) => call("state", {}, options?.signal),
  release: async () => {},
  status: (_scope, options) => call("state", {}, options?.signal),
  preview: (_scope, options) => call("preview", {}, options?.signal),
  refresh: (_scope, options) => call<void>("refresh", {}, options?.signal),
  configure: (input, options) => call("configure", input, options?.signal),
  choose: (input, options) => call("choose", input, options?.signal),
  open: () => Promise.reject(new Error("Native app opening is disabled in this temporary UI demo")),
  decide: () => Promise.reject(new Error("Human decisions are tested in isolated integration tests, not this demo")),
  discover: (input, options) => call<void>("discover", input, options?.signal),
  image: (input, options) => call("image", input, options?.signal),
  on: () => () => {},
};
render(() => <BuildUI
  bridge={bridge}
  scope={() => ({ key: "demo\ndemo", sessionID: "demo", serverID: "demo", directory: "/" })}
  local={() => true}
  background={() => []}
  activity={async () => []}
  insert={(text) => console.info("Composer text (demo only):", text)}
/>, document.getElementById("app")!);
