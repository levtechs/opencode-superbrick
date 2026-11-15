export interface Binding {
  project: string;
  builder: string;
  view: "accepted" | "builder" | "generated";
  generated: string;
  runDirectory: string;
}

export interface Scope {
  key: string;
  serverID: string;
  sessionID: string;
  directory: string;
}

export interface Draft {
  id: number;
  user: string;
  label: string;
  state: string;
  created: number;
  modified: number;
  removed: number;
  dependencies: number[];
  reason: string;
  note: string;
}

export interface ProjectInfo {
  revision: string;
  drafts: Draft[];
  builders: string[];
  editorOpen: boolean;
  editorPID: number;
}

export interface Artifact {
  path: string;
  kind: "model" | "image";
  modified: number;
}

export interface Activity {
  id: string;
  sessionID: string;
  agent: string;
  tool: string;
  status: "running" | "completed" | "error";
  summary: string;
  detail: string;
  started: number;
  ended: number;
  paths: string[];
  images: string[];
}

export interface Preview {
  revision: string;
  source: string;
  label: string;
  packed: string;
  warnings: string[];
  parts: number;
  steps: number;
}

export interface BuildState {
  binding: Binding;
  project: ProjectInfo;
  previewRevision: string;
  previewSource: string;
  busy: boolean;
  error: string;
  updated: number;
  artifacts: Artifact[];
}

export const defaultBinding = (): Binding => ({
  project: "", builder: "opencode", view: "builder", generated: "", runDirectory: "",
});

export const emptyProject = (): ProjectInfo => ({
  revision: "", drafts: [], builders: [], editorOpen: false, editorPID: 0,
});

export function validBuilder(user: string): boolean {
  return /^[a-zA-Z0-9_.-]{1,32}$/.test(user) && user !== "human";
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
