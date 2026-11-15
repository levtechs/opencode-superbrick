import { Rpc } from "@opencode/plugin/rpc";

// Portable JSON Schema: the contract is importable by both the service and GUI bundle.
export const ActivityRPC = Rpc.define({
  id: "superbrick.activity",
  methods: {
    list: {
      input: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"], additionalProperties: false,
      },
      output: { type: "string" },
    },
  },
  events: {},
});
