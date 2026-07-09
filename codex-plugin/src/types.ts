// Rollout rows are dynamic JSON objects whose exact shape is internal to
// Codex, so we treat them as loosely-typed records. `Json` is any parsed JSON value.
export type Row = Record<string, any>;
export type Json = any;
