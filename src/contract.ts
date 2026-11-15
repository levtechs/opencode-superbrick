import { Schema } from "effect";
import { Ipc } from "@opencode/plugin/gui";

export const ScopeSchema = Schema.Struct({
  key: Schema.String,
  serverID: Schema.String,
  sessionID: Schema.String,
  directory: Schema.String,
});

export const BindingSchema = Schema.Struct({
  project: Schema.String,
  builder: Schema.String,
  view: Schema.Literals(["accepted", "builder", "generated"]),
  generated: Schema.String,
  runDirectory: Schema.String,
});

export const Bridge = Ipc.define({
  id: "superbrick.build",
  methods: {
    watch: { input: ScopeSchema, output: Schema.String },
    release: { input: ScopeSchema },
    status: { input: ScopeSchema, output: Schema.String },
    configure: {
      input: Schema.Struct({ scope: ScopeSchema, binding: BindingSchema }),
      output: Schema.String,
    },
    refresh: { input: ScopeSchema },
    preview: { input: ScopeSchema, output: Schema.String },
    choose: {
      input: Schema.Struct({ scope: ScopeSchema, kind: Schema.Literals(["project", "model", "directory"]) }),
      output: Schema.String,
    },
    open: { input: ScopeSchema },
    decide: {
      input: Schema.Struct({
        scope: ScopeSchema,
        action: Schema.Literals(["accept", "reject"]),
        ids: Schema.Array(Schema.Number),
        note: Schema.String,
        revision: Schema.String,
      }),
      output: Schema.String,
    },
    discover: {
      input: Schema.Struct({ scope: ScopeSchema, paths: Schema.Array(Schema.String) }),
    },
    image: {
      input: Schema.Struct({ scope: ScopeSchema, path: Schema.String }),
      output: Schema.String,
    },
  },
  events: { updated: Schema.Struct({ key: Schema.String }) },
});
