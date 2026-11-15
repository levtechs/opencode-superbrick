import { Plugin } from "@opencode/plugin";
import { ActivityLog } from "./activity";
import { ActivityRPC } from "./rpc";

export default Plugin.define({
  id: "superbrick",
  async setup(ctx) {
    const activity = new ActivityLog();
    const parents = new Map<string, Promise<void>>();
    ctx.tool.hook("execute.before", async (event) => {
      if (!parents.has(event.sessionID)) {
        if (parents.size > 400) parents.delete(parents.keys().next().value!);
        parents.set(event.sessionID, ctx.session.get({ sessionID: event.sessionID }).then((session) => {
          if (session.parentID) activity.parent(session.id, session.parentID);
        }).catch(() => {}));
      }
      await parents.get(event.sessionID);
      activity.before(event);
    });
    ctx.tool.hook("execute.after", (event) => { activity.after(event); });
    await ctx.rpc.register(ActivityRPC, {
      list: async (input) => {
        const { sessionID } = input as { sessionID: string };
        return JSON.stringify(activity.list(sessionID));
      },
    });
  },
});
