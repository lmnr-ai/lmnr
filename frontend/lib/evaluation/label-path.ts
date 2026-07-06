// Pure, isomorphic (no server-only imports) — used both by the label-field
// server action (validating an LLM-picked path against samples) and by client
// components (resolving the same path against loaded rows). Keep it that way.

export const FIELD_PATH_ROOTS = ["data", "metadata", "target"] as const;
export type FieldPathRoot = (typeof FIELD_PATH_ROOTS)[number];

interface PathSegment {
  key?: string;
  index?: number;
}

const SEGMENT_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)(\[(\d+)\])?$/;

/**
 * Grammar: root(.key)* where each key may be immediately followed by [n].
 * e.g. "data", "data.question", "metadata.tags[0]", "target.items[0].name".
 */
export function parseFieldPath(path: string): { root: FieldPathRoot; segments: PathSegment[] } | null {
  const parts = path.split(".");
  const root = parts[0];
  if (!FIELD_PATH_ROOTS.includes(root as FieldPathRoot)) return null;

  const segments: PathSegment[] = [];
  for (const part of parts.slice(1)) {
    const match = SEGMENT_RE.exec(part);
    if (!match) return null;
    segments.push({ key: match[1] });
    if (match[3] !== undefined) segments.push({ index: Number(match[3]) });
  }
  return { root: root as FieldPathRoot, segments };
}

// data/metadata/target ride the wire as JSON strings (possibly truncated to
// 200 chars for table rows). A parse failure is NOT always corruption: bare
// string datapoints (`data = "What's the weather?"`) are stored unquoted, so
// the raw string IS the value — return it. Nested segments on a string still
// resolve to null (a string has no keys), so truncated JSON can't fake a hit.
function parseRootValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Compiles a field path into a ClickHouse expression over the physical
 * `data`/`metadata`/`target` columns, so the label resolves server-side on the
 * UNTRUNCATED value (table rows only carry `substring(data, 1, 200)`, which
 * breaks client-side JSON.parse for any large payload). String leaves come out
 * unescaped via JSONExtractString; numbers/bools via the raw fallback. Misses
 * yield '' — callers treat empty as "no label".
 * Safe to inline: `parseFieldPath` restricts keys to [a-zA-Z0-9_] and indices
 * to digits (ClickHouse JSON paths are 1-based, hence index + 1).
 */
export function labelPathToSql(fieldPath: string): string | null {
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) return null;
  const args = parsed.segments.map((s) => (s.index !== undefined ? String(s.index + 1) : `'${s.key}'`));
  const path = [parsed.root, ...args].join(", ");
  // Bare root ("data"): a non-JSON stored value is a bare string — fall back
  // to the raw column, mirroring parseRootValue. Nested paths fall to ''.
  const fallback = args.length === 0 ? parsed.root : "''";
  return `coalesce(nullIf(JSONExtractString(${path}), ''), nullIf(toString(JSONExtractRaw(${path})), ''), ${fallback})`;
}

/** Resolves `fieldPath` against one row's `data`/`metadata`/`target`. Null on any miss (root absent, path invalid, truncated JSON, or a non-scalar leaf). */
export function resolveLabelPath(row: Record<string, unknown>, fieldPath: string | null | undefined): string | null {
  if (!fieldPath) return null;
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) return null;

  let current: unknown = parseRootValue(row[parsed.root]);
  for (const segment of parsed.segments) {
    if (current == null) return null;
    if (segment.index !== undefined) {
      if (!Array.isArray(current)) return null;
      current = current[segment.index];
    } else {
      if (typeof current !== "object") return null;
      current = (current as Record<string, unknown>)[segment.key!];
    }
  }

  if (current == null || typeof current === "object") return null;
  const str = String(current).trim();
  return str || null;
}
