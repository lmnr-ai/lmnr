import { useCallback, useMemo, useState } from "react";

import { pickMode } from "@/components/ui/content-renderer/mode";
import { normalizeSpanPayload, type SpanTurn } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

import { type SectionKey } from "./build-rows";
import { SECTION_MODES, type SectionFormat } from "./section-header";

// Separate from ContentRenderer's `formatter-mode-*` keys, which store JSON/YAML/Text choices with no Messages mode.
const storageKey = (section: SectionKey, pathKey: string) => `span-turn-format-${section}-${pathKey}`;

const readMode = (section: SectionKey, pathKey: string) => {
  try {
    const stored = localStorage.getItem(storageKey(section, pathKey));
    // Keep a custom template chosen on the old Span Input / Span Output tabs (same template key) showing.
    const legacy = stored === null ? localStorage.getItem(`formatter-mode-${section}-${pathKey}`) : null;
    return pickMode(stored ?? (legacy === "custom" ? "custom" : null), SECTION_MODES, "messages");
  } catch {
    return "messages";
  }
};

const serialize = (data: unknown) => JSON.stringify(normalizeSpanPayload(data)) ?? "null";

// This call's new input entries, taken from the original payload so the copy is exactly what was sent. Falls back to
// the parsed messages when parsing changed the entry count and indices no longer line up.
const serializeNewInput = (inputData: unknown, turn: SpanTurn): string => {
  const newMessages = turn.input?.messages ?? [];
  const parsedCount = [turn.system, turn.task, turn.history, turn.previous, turn.input].reduce(
    (sum, part) => sum + (part?.messages.length ?? 0),
    0
  );
  const raw = normalizeSpanPayload(inputData);
  const entries =
    Array.isArray(raw) && raw.length === parsedCount ? raw.slice(raw.length - newMessages.length) : newMessages;
  return JSON.stringify(entries);
};

/** Per-section format (remembered per span path) plus the serialized payload each section copies and renders. */
export const useSectionFormats = (span: Span, turn: SpanTurn, pathKey: string): Record<SectionKey, SectionFormat> => {
  const [modes, setModes] = useState(() => ({
    input: readMode("input", pathKey),
    output: readMode("output", pathKey),
  }));

  const setMode = useCallback(
    (section: SectionKey, mode: string) => {
      setModes((prev) => ({ ...prev, [section]: mode }));
      try {
        localStorage.setItem(storageKey(section, pathKey), mode);
      } catch {}
    },
    [pathKey]
  );
  const setInputMode = useCallback((mode: string) => setMode("input", mode), [setMode]);
  const setOutputMode = useCallback((mode: string) => setMode("output", mode), [setMode]);

  const inputValue = useMemo(() => serialize(span.input), [span.input]);
  const outputValue = useMemo(() => serialize(span.output), [span.output]);
  const newCount = turn.input?.messages.length ?? 0;
  const copyNew = useMemo(
    () =>
      newCount > 0
        ? { label: `Copy new messages (${newCount})`, getText: () => serializeNewInput(span.input, turn) }
        : undefined,
    [newCount, span.input, turn]
  );

  return useMemo(
    () => ({
      input: {
        mode: modes.input,
        onModeChange: setInputMode,
        value: inputValue,
        templateKey: `input-${pathKey}`,
        copyExtra: copyNew,
      },
      output: { mode: modes.output, onModeChange: setOutputMode, value: outputValue, templateKey: `output-${pathKey}` },
    }),
    [modes, setInputMode, setOutputMode, inputValue, outputValue, pathKey, copyNew]
  );
};
