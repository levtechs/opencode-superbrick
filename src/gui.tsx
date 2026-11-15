import { Command, MenuItem, Panel, Plugin } from "@opencode/plugin/gui";
import { setupMain } from "./main";
import { BuildPanel } from "./plugin-panel";

export default Plugin.define({
  main: setupMain,
  setup(ctx) {
    const tab = { id: "build", title: "SuperBrick" };
    const open = () => {
      const session = ctx.sessions.current();
      if (session) ctx.layout.open(`${ctx.id}:build`, session);
    };
    ctx.add(Panel, {
      id: "build", region: "side", wide: true,
      list: ({ open }) => open.includes("build") ? [tab] : [],
      render: (props) => <BuildPanel context={ctx} panel={props} />,
    });
    ctx.add(Command, {
      id: "open", title: "SuperBrick: watch build", description: "Live LEGO preview, proposals, activity and generated artifacts",
      group: "SuperBrick", section: "session", run: open,
    });
    ctx.add(MenuItem, { id: "open", menu: "session.panel", title: "SuperBrick", run: open });
  },
});
