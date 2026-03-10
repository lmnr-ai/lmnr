"use client";

import { isEmpty } from "lodash";
import { AlertTriangle, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { useProjectContext } from "@/contexts/project-context.tsx";
import { type CustomModelCost } from "@/lib/actions/custom-model-costs";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import { ConfirmDialog } from "../ui/confirm-dialog";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

const COST_FIELDS: readonly { key: string; label: string; required?: boolean }[] = [
  { key: "input_cost_per_token", label: "Input", required: true },
  { key: "output_cost_per_token", label: "Output", required: true },
];

const PER_MILLION = 1_000_000;

/** Convert per-token DB values to per-million for display */
function toPerMillion(costs: Record<string, number>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const { key } of COST_FIELDS) {
    if (key in costs && costs[key] !== undefined) {
      result[key] = String(parseFloat((costs[key] * PER_MILLION).toPrecision(12)));
    }
  }
  return result;
}

/** Convert per-million input values to per-token for DB storage. Only includes non-empty fields. */
function toPerToken(values: Record<string, string>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const { key } of COST_FIELDS) {
    const v = values[key];
    if (v !== undefined && v !== "") {
      const num = parseFloat(v);
      if (!isNaN(num)) {
        result[key] = num / PER_MILLION;
      }
    }
  }
  return result;
}

/** Format a per-million cost value for display */
function formatCostDisplay(costs: Record<string, number>): string {
  const parts: string[] = [];
  for (const { key, label } of COST_FIELDS) {
    if (key in costs) {
      parts.push(`${label}: $${(costs[key] * PER_MILLION).toFixed(2)}`);
    }
  }
  return parts.join(", ");
}

function ModelCostDialog({
  mode,
  id,
  initialProvider,
  initialModel,
  initialCosts,
  onSave,
  trigger,
}: {
  mode: "add" | "edit";
  id?: string;
  initialProvider?: string;
  initialModel?: string;
  initialCosts?: Record<string, number>;
  onSave: (params: {
    id?: string;
    provider: string | undefined;
    model: string;
    costs: Record<string, number>;
    previousModel?: string;
    previousProvider?: string;
  }) => Promise<boolean>;
  trigger: React.ReactNode;
}) {
  const emptyFields = (): Record<string, string> => ({});

  const [provider, setProvider] = useState(initialProvider ?? "");
  const [model, setModel] = useState(initialModel ?? "");
  const [costValues, setCostValues] = useState<Record<string, string>>(
    mode === "edit" && initialCosts ? toPerMillion(initialCosts) : emptyFields()
  );
  const [validationError, setValidationError] = useState<string | undefined>();
  const [open, setOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const costs = toPerToken(costValues);

    if (!("input_cost_per_token" in costs) && !("output_cost_per_token" in costs)) {
      setValidationError("At least input or output cost is required");
      return;
    }

    const modelChanged = mode === "edit" && initialModel && model !== initialModel;
    const providerChanged = mode === "edit" && (provider || undefined) !== (initialProvider || undefined);
    const isRekey = modelChanged || providerChanged;
    setIsSaving(true);
    const ok = await onSave({
      id: mode === "edit" ? id : undefined,
      provider: provider || undefined,
      model,
      costs,
      previousModel: isRekey ? initialModel : undefined,
      previousProvider: isRekey ? initialProvider : undefined,
    });
    setIsSaving(false);
    if (!ok) return;
    if (mode === "add") {
      setProvider("");
      setModel("");
      setCostValues(emptyFields());
    }
    setValidationError(undefined);
    setOpen(false);
  };

  const updateField = (key: string, value: string) => {
    setCostValues((prev) => ({ ...prev, [key]: value }));
    setValidationError(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) {
          if (mode === "edit") {
            setProvider(initialProvider ?? "");
            setModel(initialModel ?? "");
            setCostValues(initialCosts ? toPerMillion(initialCosts) : emptyFields());
          }
          setValidationError(undefined);
        } else {
          if (mode === "add") {
            setProvider("");
            setModel("");
            setCostValues(emptyFields());
          }
          setValidationError(undefined);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit custom model cost" : "Add custom model cost"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update pricing for this model. Changes override global model prices."
              : "Define pricing for a specific model in this project. These override global model prices."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 overflow-y-auto pr-2">
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
          <div className="flex flex-col gap-3">
            <div>
              <Label>Costs per 1M tokens ($)</Label>
              <p className="text-xs text-muted-foreground mt-1">Enter prices in dollars per million tokens.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {COST_FIELDS.map(({ key, label, required }) => (
                <div key={key} className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground">
                    {label}
                    {required && " *"}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder={required ? "0.00" : "—"}
                    value={costValues[key] ?? ""}
                    onChange={(e) => updateField(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
          {validationError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle size={12} />
              {validationError}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button disabled={!model.trim() || isSaving} onClick={handleSave}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyModelCostsDialog({ onCopy }: { onCopy: (targetProjectId: string) => Promise<boolean> }) {
  const { projects, project } = useProjectContext();
  const [targetProjectId, setTargetProjectId] = useState("");
  const [open, setOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

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
          <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 p-3 rounded-md">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>All existing custom model costs in the target project will be overwritten.</span>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            disabled={!targetProjectId || isCopying}
            onClick={async () => {
              setIsCopying(true);
              const ok = await onCopy(targetProjectId);
              setIsCopying(false);
              if (!ok) return;
              setOpen(false);
              setTargetProjectId("");
            }}
          >
            {isCopying ? "Copying..." : "Copy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomModelCosts() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    data: customModelCosts,
    mutate,
    isLoading,
  } = useSWR<CustomModelCost[]>(`/api/projects/${projectId}/custom-model-costs`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; model: string } | null>(null);

  const upsertCost = async (params: {
    id?: string;
    provider: string | undefined;
    model: string;
    costs: Record<string, number>;
    previousModel?: string;
    previousProvider?: string;
  }): Promise<boolean> => {
    const { id, provider, model, costs, previousModel, previousProvider } = params;
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, provider, model, costs, previousModel, previousProvider }),
    });
    if (res.ok) {
      mutate();
      toast({ title: id ? `Model cost updated for ${model}` : `Model cost saved for ${model}` });
      return true;
    }
    if (res.status === 409) {
      const body = await res.json();
      toast({ variant: "destructive", title: body.error ?? "A cost entry for this provider and model already exists" });
      return false;
    }
    toast({ variant: "destructive", title: "Failed to save model cost" });
    return false;
  };

  const deleteCost = async (id: string) => {
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs?id=${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      mutate();
      toast({ title: "Model cost deleted" });
    } else {
      toast({ variant: "destructive", title: "Failed to delete model cost" });
    }
  };

  const copyCosts = async (targetProjectId: string): Promise<boolean> => {
    const res = await fetch(`/api/projects/${projectId}/custom-model-costs/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProjectId }),
    });
    if (res.ok) {
      mutate();
      toast({ title: "Model costs copied to project" });
      return true;
    } else {
      toast({ variant: "destructive", title: "Failed to copy model costs" });
      return false;
    }
  };

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Model Costs"
        description="Define custom model pricing for this project. Custom prices take priority over global model prices when calculating span costs. Provider and model names should match the corresponding values in your span attributes."
      />
      <div className="flex gap-2">
        <ModelCostDialog
          mode="add"
          onSave={upsertCost}
          trigger={
            <Button variant="outline" className="w-fit">
              <Plus size={14} className="mr-1" />
              Add model cost
            </Button>
          }
        />
        {!isEmpty(customModelCosts) && <CopyModelCostsDialog onCopy={copyCosts} />}
      </div>
      <SettingsTable
        headers={["Model", "Costs", "Created", "Updated", ""]}
        isLoading={isLoading}
        isEmpty={isEmpty(customModelCosts)}
        emptyMessage="No custom model costs defined."
      >
        {customModelCosts?.map((cost) => {
          const costObj = cost.costs as Record<string, number>;
          const display = formatCostDisplay(costObj);
          return (
            <SettingsTableRow key={cost.id}>
              <td className="px-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{cost.model}</span>
                  {cost.provider && <span className="text-xs text-muted-foreground">{cost.provider}</span>}
                </div>
              </td>
              <td className="px-4">
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground font-mono cursor-default line-clamp-2">
                        {display.length > 60 ? display.slice(0, 60) + "..." : display}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-md">
                      <div className="text-xs font-mono space-y-0.5">
                        {COST_FIELDS.filter(({ key }) => key in costObj).map(({ key, label }) => (
                          <div key={key}>
                            {label}: ${(costObj[key] * PER_MILLION).toFixed(2)} / 1M tokens
                          </div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </td>
              <td className="px-4">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(cost.createdAt).toLocaleString()}
                </span>
              </td>
              <td className="px-4">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(cost.updatedAt).toLocaleString()}
                </span>
              </td>
              <td className="px-4">
                <div className="flex justify-end gap-1">
                  <ModelCostDialog
                    mode="edit"
                    id={cost.id}
                    initialProvider={cost.provider || undefined}
                    initialModel={cost.model}
                    initialCosts={costObj}
                    onSave={upsertCost}
                    trigger={
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Pencil size={14} />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setDeleteTarget({ id: cost.id, model: cost.model })}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </td>
            </SettingsTableRow>
          );
        })}
      </SettingsTable>
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete model cost"
        description={`Are you sure you want to delete the custom cost for "${deleteTarget?.model}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            deleteCost(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </SettingsSection>
  );
}
