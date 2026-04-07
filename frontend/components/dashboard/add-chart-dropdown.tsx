"use client";

import { Pen, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { type ChartPreset, CHART_PRESETS } from "@/components/dashboard/chart-presets";
import { type DashboardChart } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";

const AddChartDropdown = () => {
  const { projectId } = useParams();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      search.trim()
        ? CHART_PRESETS.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
        : CHART_PRESETS,
    [search]
  );

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
          }),
        });

        if (!res.ok) {
          const err = await res.json().then((d) => d?.error).catch(() => null);
          toast({ variant: "destructive", title: err ?? "Failed to create chart" });
          return;
        }

        await mutate(`/api/projects/${projectId}/dashboard-charts`);
        setOpen(false);
        setSearch("");
      } catch {
        toast({ variant: "destructive", title: "Something went wrong" });
      }
    },
    [projectId, mutate, toast]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button icon="plus">Chart</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search charts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>
        <div className="p-1 border-b">
          <Link href={{ pathname: "dashboard/new" }} onClick={() => setOpen(false)}>
            <button className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent cursor-pointer">
              <Pen className="size-3.5 text-muted-foreground" />
              Custom
            </button>
          </Link>
        </div>
        <div className="p-1 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No matching charts</p>
          ) : (
            filtered.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleSelect(preset)}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-accent text-left cursor-pointer"
              >
                <Plus className="size-3.5 text-muted-foreground shrink-0" />
                {preset.name}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddChartDropdown;
