"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Color pickers for every HSL semantic token (destructive, success, llm, tool, subagent, charts, ...).

import ColorCount from "./color-count";
import ColorPickerPopover from "./color-picker-popover";
import { useStyleContext } from "./style-context";
import { HSL_KEYS } from "./tokens";

export default function SemanticColorsSection() {
  const { state, setHsl } = useStyleContext();

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-foreground">Semantic colors</div>
      {HSL_KEYS.map((name) => (
        <div key={name} className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground">{name}</span>
          <div className="flex shrink-0 items-center gap-2">
            <ColorCount name={name.replace(/^--/, "")} />
            <ColorPickerPopover value={state.hsl[name]} onChange={(v) => setHsl(name, v)} />
          </div>
        </div>
      ))}
    </div>
  );
}
