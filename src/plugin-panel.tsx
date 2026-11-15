import type { Context, PanelProps } from "@opencode/plugin/gui";
import type { Activity } from "./model";
import { Bridge } from "./contract";
import { ActivityRPC } from "./rpc";
import { BuildUI } from "./panel";

export function BuildPanel(props: { context: Context; panel: PanelProps }) {
  const bridge = props.context.main(Bridge);
  return <BuildUI
    bridge={bridge}
    scope={() => ({
      key: props.panel.session.key, serverID: props.panel.session.server.id,
      sessionID: props.panel.session.id, directory: props.panel.session.directory,
    })}
    local={() => props.panel.session.server.builtin}
    background={() => props.panel.session.background.map((task) => task.label)}
    activity={async (scope, signal) => {
      const client = props.panel.session.server.client.rpc(ActivityRPC);
      const value = await client.list(
        { sessionID: scope.sessionID }, { signal, location: { directory: scope.directory } },
      );
      return JSON.parse(String(value)) as Activity[];
    }}
    insert={(text) => { props.panel.screen.composer.insert(text); props.panel.screen.composer.focus(); }}
  />;
}
