import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { PropsWithChildren, useState } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/lib/hooks/use-toast";

const ExportChartDialog = ({ children }: PropsWithChildren) => {
  const { projectId } = useParams();
  const [open, setOpen] = useState(false);
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
    if (!name) {
      return;
    }

    if (!chartConfig.type || !chartConfig.x || !chartConfig.y) {
      return;
    }

    setIsLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/dashboard-charts`, {
        method: "PUT",
        body: JSON.stringify({
          query,
          name,
          config: chartConfig,
        }),
      });

      setOpen(false);
      toast({
        title: "Success",
        description: (
          <span>
            Successfully exported chart to dashboard.{" "}
            <Link className="text-primary" href={`/project/${projectId}/dashboard`}>
              Go to dashboard.
            </Link>
          </span>
        ),
      });
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: "Failed to export chart. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const isValid = isValidChartConfiguration() && (name?.trim().length || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-left">Export Chart to Dashboard</DialogTitle>
        </DialogHeader>
        <Separator />
        <Input
          id="chart-name"
          value={name || ""}
          onChange={(e) => setChartName(e.target.value || undefined)}
          placeholder="Enter chart name"
        />
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
