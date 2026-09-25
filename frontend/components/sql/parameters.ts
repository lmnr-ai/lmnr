import { format, startOfToday, subDays } from "date-fns";
import { isDate, isNil } from "lodash";

export type SQLParameterType = "date" | "string" | "number";

export type SQLParameter = {
  name: string;
  /** ClickHouse type exactly as written in the query (`DateTime64`, `Array(UUID)`, …). */
  declaredType?: string;
} & ({ type: "date"; value?: Date } | { type: "string"; value?: string } | { type: "number"; value?: number });

/** Durable name → value map. Outlives the query text so deleting and retyping a placeholder keeps its value. */
export type ParameterValues = Record<string, Date | string | number | undefined>;

export interface ParameterRef {
  name: string;
  declaredType: string;
  from: number;
  to: number;
}

export interface DerivedParameters {
  parameters: SQLParameter[];
  /** Names declared with more than one type in the same query. The first declaration wins. */
  conflicts: Record<string, string[]>;
}

export const BUILT_IN_PARAMETERS: Record<
  string,
  { declaredType: string; description: string; defaultValue: () => Date | string | number }
> = {
  start_time: {
    declaredType: "DateTime64",
    description: "Start of the time window the query filters on.",
    defaultValue: () => subDays(startOfToday(), 7),
  },
  end_time: {
    declaredType: "DateTime64",
    description: "End of the time window the query filters on.",
    defaultValue: () => startOfToday(),
  },
  interval_unit: {
    declaredType: "String",
    description: "Time-series bucket unit — HOUR, DAY, MINUTE, WEEK or MONTH.",
    defaultValue: () => "HOUR",
  },
};

export const defaultParameterValues = (): ParameterValues =>
  Object.fromEntries(Object.entries(BUILT_IN_PARAMETERS).map(([name, spec]) => [name, spec.defaultValue()]));

// One line only; the type may hold parens, commas, spaces and quotes (`DateTime64(9, 'UTC')`) but never a brace.
const PLACEHOLDER_PATTERN = String.raw`\{[ \t]*([A-Za-z_]\w*)[ \t]*:[ \t]*([^{}\n]+?)[ \t]*\}`;

/**
 * Blanks strings, quoted identifiers and comments to spaces of equal length, so a scan can't match
 * inside `'%{a:b}%'` or `-- {x:String}` while offsets still index the original text.
 */
const maskNonCode = (sql: string): string => {
  const out = sql.split("");
  let i = 0;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < sql.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < sql.length) {
    const char = sql[i];

    if (char === "'" || char === '"' || char === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === char) {
          // A doubled quote escapes itself in ClickHouse ('it''s').
          if (sql[j + 1] === char) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      blank(i, j + 1);
      i = j + 1;
      continue;
    }

    if (char === "-" && sql[i + 1] === "-") {
      let j = i;
      while (j < sql.length && sql[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }

    if (char === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    i++;
  }

  return out.join("");
};

/** Every `{name:Type}` placeholder in the query, in document order, duplicates included. */
export const findParameterRefs = (sql: string): ParameterRef[] => {
  if (!sql.includes("{")) return [];

  const masked = maskNonCode(sql);
  const pattern = new RegExp(PLACEHOLDER_PATTERN, "g");
  const exact = new RegExp(`^${PLACEHOLDER_PATTERN}$`);
  const refs: ParameterRef[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    // The mask only says WHERE; re-read the type off the original or its quoted part comes back blanked.
    const original = sql.slice(from, to).match(exact);
    refs.push({ name: match[1], declaredType: original?.[2] ?? match[2], from, to });
  }

  return refs;
};

/** Maps a declared ClickHouse type onto the input control the parameter gets. */
export const inferParameterType = (declaredType: string): SQLParameterType => {
  let base = declaredType.replace(/\s+/g, "").toLowerCase();
  const wrapper = base.match(/^(?:nullable|lowcardinality)\((.*)\)$/);
  if (wrapper) base = wrapper[1];

  if (base.startsWith("date")) return "date";
  if (/^(?:u?int\d*|float\d*|decimal\d*)\b/.test(base)) return "number";
  return "string";
};

/** Retyping `{start_time:DateTime64}` as `{start_time:String}` should carry the date over, not blank it. */
const coerceValue = (type: SQLParameterType, value: ParameterValues[string]): SQLParameter["value"] => {
  if (isNil(value)) return undefined;

  if (type === "date") return isDate(value) ? value : undefined;

  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
    return undefined;
  }

  if (isDate(value)) return formatDateParameter(value);
  return String(value);
};

/** The parameters the query asks for, in the order they first appear, paired with their current values. */
export const deriveParameters = (query: string, values: ParameterValues): DerivedParameters => {
  const parameters: SQLParameter[] = [];
  const conflicts: Record<string, string[]> = {};
  const seen = new Map<string, string>();

  for (const ref of findParameterRefs(query)) {
    const firstType = seen.get(ref.name);
    if (firstType !== undefined) {
      // ClickHouse binds one value per name, so a second type is a bug in the query — surface it.
      if (firstType !== ref.declaredType && !conflicts[ref.name]?.includes(ref.declaredType)) {
        conflicts[ref.name] = [...(conflicts[ref.name] ?? [firstType]), ref.declaredType];
      }
      continue;
    }

    seen.set(ref.name, ref.declaredType);
    const type = inferParameterType(ref.declaredType);
    parameters.push({
      name: ref.name,
      declaredType: ref.declaredType,
      type,
      value: coerceValue(type, values[ref.name]),
    } as SQLParameter);
  }

  return { parameters, conflicts };
};

/** The exact literal ClickHouse receives. `undefined` means the parameter has no value to send. */
export const formatParameterValue = (parameter: SQLParameter): string | number | undefined => {
  if (isNil(parameter.value)) return undefined;
  if (isDate(parameter.value)) return formatDateParameter(parameter.value);
  if (parameter.type === "number") return Number(parameter.value);
  return parameter.value;
};

export const formatParameters = (parameters: SQLParameter[]): Record<string, string | number> =>
  parameters.reduce<Record<string, string | number>>((formatted, parameter) => {
    const value = formatParameterValue(parameter);
    if (!isNil(value)) formatted[parameter.name] = value;
    return formatted;
  }, {});

export const isParameterUnset = (parameter: SQLParameter): boolean => isNil(parameter.value);

/**
 * Chip-facing and deliberately terse — three full timestamps overflow the toolbar row on a laptop.
 * The popover keeps the full precision.
 */
export const formatParameterDisplay = (parameter: SQLParameter): string | null => {
  if (isNil(parameter.value)) return null;
  if (!isDate(parameter.value)) return String(parameter.value);

  const date = parameter.value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  const atMidnight = date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  if (atMidnight) return format(date, thisYear ? "MMM d" : "MMM d, yyyy");
  return format(date, thisYear ? "MMM d, HH:mm" : "MMM d yyyy, HH:mm");
};

function formatDateParameter(date: Date): string {
  return format(date, "yyyy-MM-dd HH:mm:ss.SSS");
}

// --- Persistence -------------------------------------------------------------
// A user-level preference (the window you work in), not part of the saved query, so it stays local.

const STORAGE_KEY = "sql-editor-parameter-values";

type StoredValue = { kind: SQLParameterType; value: string | number };

export const loadParameterValues = (): ParameterValues => {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const stored = JSON.parse(raw) as Record<string, StoredValue>;
    const values: ParameterValues = {};

    for (const [name, entry] of Object.entries(stored ?? {})) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.kind === "date") {
        const date = new Date(entry.value);
        if (!Number.isNaN(date.getTime())) values[name] = date;
      } else if (entry.kind === "number") {
        if (typeof entry.value === "number" && Number.isFinite(entry.value)) values[name] = entry.value;
      } else if (typeof entry.value === "string") {
        values[name] = entry.value;
      }
    }

    return values;
  } catch {
    return {};
  }
};

export const saveParameterValues = (values: ParameterValues) => {
  if (typeof window === "undefined") return;

  try {
    const stored: Record<string, StoredValue> = {};
    for (const [name, value] of Object.entries(values)) {
      if (isNil(value)) continue;
      if (isDate(value)) stored[name] = { kind: "date", value: value.toISOString() };
      else if (typeof value === "number") stored[name] = { kind: "number", value };
      else stored[name] = { kind: "string", value };
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Full or unavailable localStorage must not break the editor; values just won't survive a reload.
  }
};
