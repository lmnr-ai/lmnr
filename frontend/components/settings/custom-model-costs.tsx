"use client";

import { isEmpty } from "lodash";
import { AlertTriangle, Copy, Info, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

import { useProjectContext } from "@/contexts/project-context.tsx";
import { type CustomModelCost } from "@/lib/actions/custom-model-costs";
import { swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

const ALLOWED_COST_KEYS_DESCRIPTION = `Allowed cost keys:
  input_cost_per_token, output_cost_per_token,
  input_cost_per_token_batches, output_cost_per_token_batches,
  input_cost_per_token_above_{N}_tokens, output_cost_per_token_above_{N}_tokens,
  cache_read_input_token_cost, cache_read_input_token_cost_above_{N}_tokens,
  cache_creation_input_token_cost, cache_creation_input_token_cost_above_{N}_tokens,
  cache_creation_input_token_cost_above_1hr, cache_creation_input_token_cost_above_1hr_above_{N}_tokens,
  input_cost_per_audio_token, output_cost_per_audio_token,
  input_cost_per_audio_token_batches, output_cost_per_audio_token_batches,
  output_cost_per_reasoning_token, output_cost_per_reasoning_token_batches

Where {N} is an integer like 128000 or 200K.`;

const COST_KEY_PATTERN =
  /^(input_cost_per_token|output_cost_per_token|input_cost_per_token_batches|output_cost_per_token_batches|input_cost_per_token_above_\d+[Kk]?_tokens|output_cost_per_token_above_\d+[Kk]?_tokens|cache_read_input_token_cost|cache_read_input_token_cost_above_\d+[Kk]?_tokens|cache_creation_input_token_cost|cache_creation_input_token_cost_above_\d+[Kk]?_tokens|cache_creation_input_token_cost_above_1hr|cache_creation_input_token_cost_above_1hr_above_\d+[Kk]?_tokens|input_cost_per_audio_token|output_cost_per_audio_token|input_cost_per_audio_token_batches|output_cost_per_audio_token_batches|output_cost_per_reasoning_token|output_cost_per_reasoning_token_batches)$/;

function validateCostsJson(jsonStr: string): { valid: boolean; error?: string; costs?: Record<string, number> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return { valid: false, error: "Invalid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: "Costs must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  const costs: Record<string, number> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (!COST_KEY_PATTERN.test(key)) {
      return { valid: false, error: `Invalid cost key: "${key}"` };
    }
    if (typeof value !== "number" || isNaN(value)) {
      return { valid: false, error: `Value for "${key}" must be a number` };
    }
    costs[key] = value;
  }

  if (Object.keys(costs).length === 0) {
    return { valid: false, error: "At least one cost entry is required" };
  }

  return { valid: true, costs };
}

const EXAMPLE_COSTS = JSON.stringify(
  {
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
    cache_read_input_token_cost: 0.0000003,
  },
  null,
  2
);

function AddModelCostDialog({
  onAdd,
}: {
  onAdd: (provider: string | undefined, model: string, costs: Record<string, number>) => void;
}) {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [costsJson, setCostsJson] = useState("");
  const [validationError, setValidationError] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const handleSave = useCallback(() => {
    const result = validateCostsJson(costsJson);
    if (!result.valid) {
      setValidationError(result.error);
      return;
    }
    onAdd(provider || undefined, model, result.costs!);
    setProvider("");
    setModel("");
    setCostsJson("");
    setValidationError(undefined);
    setOpen(false);
  }, [provider, model, costsJson, onAdd]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setProvider("");
          setModel("");
          setCostsJson("");
          setValidationError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-fit">
          <Plus size={14} className="mr-1" />
          Add model cost
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Add custom model cost</DialogTitle>
          <DialogDescription>
            Define pricing for a specific model in this project. These override global model prices.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Provider (optional)</Label>
            <Input
              placeholder="e.g. openai, anthropic"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Model *</Label>
            <Input
              placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Costs (JSON)</Label>
            <Textarea
              className="font-mono text-xs min-h-32"
              placeholder={EXAMPLE_COSTS}
              value={costsJson}
              onChange={(e) => {
                setCostsJson(e.target.value);
                setValidationError(undefined);
              }}
            />
            {validationError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle size={12} />
                {validationError}
              </p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer flex items-center gap-1">
                <Info size={12} />
                Allowed cost keys
              </summary>
              <pre className="mt-1 whitespace-pre-wrap text-xs bg-secondary p-2 rounded">
                {ALLOWED_COST_KEYS_DESCRIPTION}
              </pre>
            </details>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!model.trim() || !costsJson.trim()} onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyModelCostsDialog({ onCopy }: { onCopy: (targetProjectId: string) => void }) {
  const { projects, project } = useProjectContext();
  const [targetProjectId, setTargetProjectId] = useState("");
  const [open, setOpen] = useState(false);

  const otherProjects = projects.filter((p) => p.id !== project?.id);

  if (otherProjects.length === 0) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) setTargetProjectId("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="w-fit">
          <Copy size={14} className="mr-1" />
          Copy to project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Copy model costs to another project</DialogTitle>
          <DialogDescription>
            This will replace all existing custom model costs in the target project with the costs from this project.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Target project</Label>
            <Select onValueChange={setTargetProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {otherProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>All existing custom model costs in the target project will be overwritten.</span>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!targetProjectId}
            onClick={() => {
              onCopy(targetProjectId);
              setOpen(false);
              setTargetProjectId("");
            }}
          >
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomModelCosts() {
  const { projectId } = useParams();
  const {
    data: customModelCosts,
    mutate,
    isLoading,
  } = useSWR<CustomModelCost[]>(`/api/projects/${projectId}/custom-model-costs`, swrFetcher);

  const upsertCost = async (provider: string | undefined, model: string, costs: Record<string, number>) => {
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, model, costs }),
    });
    if (res.ok) {
      mutate();
    }
  };

  const deleteCost = async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      mutate();
    }
  };

  const copyCosts = async (targetProjectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProjectId }),
    });
    if (res.ok) {
      mutate();
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Model Costs"
        description="Define custom model pricing for this project. Custom prices take priority over global model prices when calculating span costs."
      />
      <div className="flex gap-2">
        <AddModelCostDialog onAdd={upsertCost} />
        {!isEmpty(customModelCosts) && <CopyModelCostsDialog onCopy={copyCosts} />}
      </div>
      <SettingsTable
        isLoading={isLoading}
        isEmpty={isEmpty(customModelCosts)}
        emptyMessage="No custom model costs defined."
      >
        {customModelCosts?.map((cost) => (
          <SettingsTableRow key={cost.id}>
            <td className="px-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{cost.model}</span>
                {cost.provider && <span className="text-xs text-muted-foreground">{cost.provider}</span>}
              </div>
            </td>
            <td className="px-4">
              <span className="text-xs text-muted-foreground font-mono">
                {Object.entries(cost.costs as Record<string, number>)
                  .slice(0, 3)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}
                {Object.keys(cost.costs as Record<string, number>).length > 3 && " ..."}
              </span>
            </td>
            <td className="px-4">
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => deleteCost(cost.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>
    </SettingsSection>
  );
}
