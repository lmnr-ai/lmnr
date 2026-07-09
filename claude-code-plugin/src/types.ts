// Transcript rows are dynamic JSON objects whose exact shape is internal to
// Claude Code, so we treat them as loosely-typed records (mirrors the Python
// `Dict[str, Any]`). `Json` is any parsed JSON value.
export type Row = Record<string, any>;
export type Json = any;
