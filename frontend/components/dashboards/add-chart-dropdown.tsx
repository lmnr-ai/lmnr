"use client";

import { ChartBar, ChartColumn, ChartLine, Pen, Table2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { CHART_PRESETS, type ChartPreset, type PresetTable } from "@/components/dashboards/chart-presets";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

const CHART_TYPE_ICONS: Record<string, typeof ChartLine> = {
  line: ChartLine,
  bar: ChartColumn,
  horizontalBar: ChartBar,
  table: Table2,
};

const TABLE_FILTERS: { label: string; value: PresetTable }[] = [
  { label: "Traces", value: "traces" },
  { label: "Spans", value: "spans" },
  { label: "Signals", value: "signals" },
];

const AddChartDropdown = ({ onChartCreated }: { onChartCreated?: () => void }) => {
  const { projectId } = useParams();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activeTable, setActiveTable] = useState<PresetTable>("traces");

  const filtered = useMemo(() => CHART_PRESETS.filter((p) => p.table === activeTable), [activeTable]);

  const handleSelect = useCallback(
    async (preset: ChartPreset) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/dashboard-charts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: preset.name,
            query: preset.query,
            config: preset.config,
            queryStructure: preset.queryStructure,
          }),
        });

        if (!res.ok) {
          const err = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({ variant: "destructive", title: err ?? "Failed to create chart" });
          return;
        }

        await mutate(`/api/projects/${projectId}/dashboard-charts`);
        setOpen(false);
        requestAnimationFrame(() => onChartCreated?.());
      } catch {
        toast({ variant: "destructive", title: "Something went wrong" });
      }
    },
    [projectId, mutate, toast, onChartCreated]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button icon="plus">Chart</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="p-1 border-b">
          <Link href={{ pathname: "dashboards/new" }} onClick={() => setOpen(false)}>
            <button className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">
              <Pen className="size-3.5 text-muted-foreground" />
              Custom
            </button>
          </Link>
        </div>
        <div className="px-1.5 py-1.5 border-b">
          <Tabs value={activeTable} onValueChange={(v) => setActiveTable(v as PresetTable)}>
            <TabsList className="w-full h-8">
              {TABLE_FILTERS.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value} className="text-xs">
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="p-1 max-h-64 overflow-y-auto">
          {filtered.map((preset) => {
            const Icon = CHART_TYPE_ICONS[preset.config.type] ?? ChartLine;
            return (
              <button
                key={preset.name}
                onClick={() => handleSelect(preset)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-left cursor-pointer"
              >
                <Icon className="size-3.5 text-muted-foreground shrink-0" />
                {preset.name}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddChartDropdown;
