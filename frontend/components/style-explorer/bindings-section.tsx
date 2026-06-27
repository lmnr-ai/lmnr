"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Per-token dropdowns rebinding semantic @theme tokens to a ramp stop.

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useStyleContext } from "./style-context";
import { BINDING_KEYS, STOP_GROUPS } from "./tokens";

export default function BindingsSection() {
  const { state, setBinding } = useStyleContext();

  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-medium text-foreground">Color bindings</div>
      {BINDING_KEYS.map((token) => (
        <div key={token} className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-[11px] text-muted-foreground">--color-{token}</span>
          <Select value={state.bindings[token]} onValueChange={(v) => setBinding(token, v)}>
            <SelectTrigger className="h-7 w-36 shrink-0 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {STOP_GROUPS.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.keys.map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {k}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
