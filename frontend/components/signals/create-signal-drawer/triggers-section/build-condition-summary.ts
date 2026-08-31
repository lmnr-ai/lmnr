import { getTriggerKind, getTriggerSpanNames, TRIGGER_KIND } from "@/components/signals/trigger-filter-field";
import { type Filter } from "@/lib/actions/common/filters";
import { Operator } from "@/lib/actions/common/operators";

export type SummaryPart = { type: "text"; text: string } | { type: "name"; value: string };

const listValues = (value: Filter["value"]): string[] =>
  (Array.isArray(value) ? value : [value])
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const joinOr = (names: string[]): SummaryPart[] => {
  if (names.length === 1) return [{ type: "name", value: names[0] }];
  const parts: SummaryPart[] = [];
  names.forEach((name, i) => {
    if (i > 0) {
      parts.push({ type: "text", text: i === names.length - 1 ? " or " : ", " });
    }
    parts.push({ type: "name", value: name });
  });
  return parts;
};

const formatNumber = (value: string): string => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : value;
};

const isExclude = (operator: Filter["operator"]): boolean =>
  operator === Operator.NotIncludes || operator === Operator.Ne;

const describeFilter = (filter: Filter): SummaryPart[] | null => {
  const values = listValues(filter.value);
  switch (filter.column) {
    case "total_token_count": {
      const n = formatNumber(values[0] ?? "");
      const phrase: Partial<Record<Operator, string>> = {
        [Operator.Gt]: `has more than ${n} tokens`,
        [Operator.Gte]: `has at least ${n} tokens`,
        [Operator.Lt]: `has fewer than ${n} tokens`,
        [Operator.Lte]: `has at most ${n} tokens`,
        [Operator.Eq]: `has exactly ${n} tokens`,
        [Operator.Ne]: `does not have exactly ${n} tokens`,
      };
      const text = phrase[filter.operator];
      return text ? [{ type: "text", text }] : null;
    }
    case "status": {
      const status = values[0];
      if (filter.operator === Operator.Eq && status === "error") {
        return [{ type: "text", text: "has an error status" }];
      }
      if (filter.operator === Operator.Eq && status === "success") {
        return [{ type: "text", text: "has a success status" }];
      }
      if (filter.operator === Operator.Ne && status === "error") {
        return [{ type: "text", text: "does not have an error status" }];
      }
      if (filter.operator === Operator.Ne && status === "success") {
        return [{ type: "text", text: "does not have a success status" }];
      }
      return null;
    }
    case "span_names": {
      if (values.length === 0) return null;
      const verb = isExclude(filter.operator) ? "does not include " : "includes ";
      return [{ type: "text", text: verb }, ...joinOr(values)];
    }
    case "tags": {
      if (values.length === 0) return null;
      const verb = isExclude(filter.operator) ? "has none of the tags " : "has any of the tags ";
      return [{ type: "text", text: verb }, ...joinOr(values)];
    }
    default:
      return null;
  }
};

/** One-sentence recap. Null while a span-name trigger has no names yet. */
export const buildConditionSummary = (conditions: Filter[], filters: Filter[]): SummaryPart[] | null => {
  const kind = getTriggerKind(conditions);
  const parts: SummaryPart[] = [{ type: "text", text: "This signal will run " }];

  if (kind === TRIGGER_KIND.SPAN_NAME) {
    const names = getTriggerSpanNames(conditions).filter((n) => n.trim() !== "");
    if (names.length === 0) return null;
    if (names.length === 1) {
      parts.push(
        { type: "text", text: "when " },
        { type: "name", value: names[0] },
        { type: "text", text: " finishes" }
      );
    } else {
      parts.push({ type: "text", text: "when any of the spans " }, ...joinOr(names), {
        type: "text",
        text: " finishes",
      });
    }
  } else {
    parts.push({ type: "text", text: "when the trace finishes" });
  }

  const filterParts = (filters ?? []).map(describeFilter).filter((p): p is SummaryPart[] => p !== null);
  if (filterParts.length > 0) {
    parts.push({ type: "text", text: ", if the trace " });
    filterParts.forEach((fp, i) => {
      if (i > 0) parts.push({ type: "text", text: " and " });
      parts.push(...fp);
    });
  }

  parts.push({ type: "text", text: "." });
  return parts;
};
