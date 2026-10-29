"use client";

import { type StatusVariant } from "@/components/evaluation/columns/status-variant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { DEFAULT_CONFIG, type IdStyle, SCENARIOS, type SandboxConfig } from "./mock-data";

interface ControlsProps {
  config: SandboxConfig;
  scenarioId: string;
  onScenario: (id: string) => void;
  onChange: (patch: Partial<SandboxConfig>) => void;
}

type NumberKey = {
  [K in keyof SandboxConfig]: SandboxConfig[K] extends number ? K : never;
}[keyof SandboxConfig];
type BoolKey = { [K in keyof SandboxConfig]: SandboxConfig[K] extends boolean ? K : never }[keyof SandboxConfig];

const NUMBER_FIELDS: { key: NumberKey; label: string; min: number; max: number; step: number }[] = [
  { key: "seed", label: "Seed", min: 1, max: 9999, step: 1 },
  { key: "taskCount", label: "Tasks", min: 0, max: 2000, step: 1 },
  { key: "maxTrials", label: "Trials per task (max)", min: 1, max: 50, step: 1 },
  { key: "scoreCount", label: "Score columns", min: 0, max: 4, step: 1 },
  { key: "errorRate", label: "Error rate", min: 0, max: 1, step: 0.05 },
  { key: "pendingRate", label: "Pending rate", min: 0, max: 1, step: 0.05 },
  { key: "missingScoreRate", label: "Missing score rate", min: 0, max: 1, step: 0.05 },
  { key: "pageSize", label: "Page size (tasks)", min: 1, max: 200, step: 1 },
  { key: "fetchDelayMs", label: "Fetch delay (ms)", min: 0, max: 5000, step: 100 },
];

const BOOL_FIELDS: { key: BoolKey; label: string }[] = [
  { key: "variableTrials", label: "Random trial count (1..max)" },
  { key: "longText", label: "Long text (truncated cells)" },
  { key: "compare", label: "Compare against a 2nd run" },
  { key: "heatmap", label: "Score heatmap" },
  { key: "forceLoading", label: "Force loading skeleton" },
];

const STATUS_VARIANTS: { value: StatusVariant; label: string }[] = [
  { value: "counts", label: "Counts (✓ 2 ✗ 1)" },
  { value: "ring", label: "Pie ring" },
];

const ID_STYLES: IdStyle[] = ["readable", "uuid", "weird"];

export const SandboxControls = ({ config, scenarioId, onScenario, onChange }: ControlsProps) => (
  <div className="flex w-72 flex-none flex-col gap-4 overflow-y-auto border-r p-4 text-xs">
    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-secondary-foreground">Scenario</span>
      <div className="flex flex-wrap gap-1">
        {SCENARIOS.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant={s.id === scenarioId ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => onScenario(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>
    </div>

    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-secondary-foreground">Status variant</span>
      <Select value={config.statusVariant} onValueChange={(v) => onChange({ statusVariant: v as StatusVariant })}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_VARIANTS.map((v) => (
            <SelectItem key={v.value} value={v.value} className="text-xs">
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>

    <div className="flex flex-col gap-1.5">
      <span className="font-medium text-secondary-foreground">Task id style</span>
      <div className="flex gap-1">
        {ID_STYLES.map((style) => (
          <Button
            key={style}
            size="sm"
            variant={config.idStyle === style ? "default" : "outline"}
            className="h-6 px-2 text-xs"
            onClick={() => onChange({ idStyle: style })}
          >
            {style}
          </Button>
        ))}
      </div>
    </div>

    {NUMBER_FIELDS.map((f) => (
      <label key={f.key} className="flex items-center justify-between gap-2">
        <span className={cn(config[f.key] !== DEFAULT_CONFIG[f.key] && "font-medium text-primary")}>{f.label}</span>
        <Input
          type="number"
          className="h-7 w-20 text-xs"
          min={f.min}
          max={f.max}
          step={f.step}
          value={config[f.key]}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange({ [f.key]: Math.min(f.max, Math.max(f.min, v)) });
          }}
        />
      </label>
    ))}

    {BOOL_FIELDS.map((f) => (
      <label key={f.key} className="flex items-center justify-between gap-2">
        <span>{f.label}</span>
        <Switch checked={config[f.key]} onCheckedChange={(checked) => onChange({ [f.key]: checked })} />
      </label>
    ))}
  </div>
);
