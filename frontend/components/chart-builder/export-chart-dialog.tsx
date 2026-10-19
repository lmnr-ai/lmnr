import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { type PropsWithChildren, useState } from "react";
import useSWR from "swr";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import { type Dashboard, getChartsUrl, getDashboardsUrl } from "@/components/dashboards/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

const ExportChartDialog = ({ children }: PropsWithChildren) => {
  const { projectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>();
  const { data: dashboards = [] } = useSWR<Dashboard[]>(open ? getDashboardsUrl(projectId) : null, swrFetcher);
  const dashboardId = selectedDashboardId ?? dashboards[0]?.id;
  const dashboardName = dashboards.find((d) => d.id === dashboardId)?.name;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { query, chartConfig, setChartName, name, isValidChartConfiguration } = useChartBuilderStoreContext(
    (state) => ({
      query: state.query,
      chartConfig: state.chartConfig,
      name: state.name,
      setChartName: state.setChartName,
      isValidChartConfiguration: state.isValidChartConfiguration,
    })
  );

  const handleExport = async () => {
    if (!name || !dashboardId) {
      return;
    }

    if (!chartConfig.type || !chartConfig.x || !chartConfig.y) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(getChartsUrl(projectId, dashboardId), {
        method: "POST",
        body: JSON.stringify({
          query,
          name,
          config: chartConfig,
        }),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({
          variant: "destructive",
          title: "Error",
          description: errMessage ?? "Failed to export chart. Please try again.",
        });
        return;
      }

      setOpen(false);
      toast({
        title: "Success",
        description: (
          <span>
            Successfully exported chart to {dashboardName}.{" "}
            <Link className="text-primary" href={`/project/${projectId}/dashboards/${dashboardId}`}>
              Go to dashboard.
            </Link>
          </span>
        ),
      });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to export chart. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = isValidChartConfiguration() && (name?.trim().length || 0) > 0 && !!dashboardId;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left">Export Chart to Dashboard</DialogTitle>
        </DialogHeader>
        <Separator />
        <div className="grid gap-1">
          <Label htmlFor="chart-name" className="text-xs">
            Chart name
          </Label>
          <Input
            id="chart-name"
            value={name || ""}
            onChange={(e) => setChartName(e.target.value || undefined)}
            placeholder="Enter chart name"
          />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Dashboard</Label>
          <Select value={dashboardId} onValueChange={setSelectedDashboardId}>
            <SelectTrigger aria-label="Dashboard">
              <SelectValue placeholder="Select dashboard" />
            </SelectTrigger>
            <SelectContent>
              {dashboards.map((dashboard) => (
                <SelectItem key={dashboard.id} value={dashboard.id}>
                  {dashboard.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button handleEnter onClick={handleExport} disabled={!isValid || isLoading}>
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportChartDialog;
