import React, { PropsWithChildren, useState } from "react";

import { useChartBuilderStoreContext } from "@/components/chart-builder/chart-builder-store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const ExportChartDialog = ({ children }: PropsWithChildren) => {
  const [open, setOpen] = useState(false);

  const { chartConfig, setChartName, isValidChartConfiguration } = useChartBuilderStoreContext((state) => ({
    chartConfig: state.chartConfig,
    setChartName: state.setChartName,
    isValidChartConfiguration: state.isValidChartConfiguration,
  }));

  const handleExport = () => {
    const exportData = {
      name: chartConfig.name,
      config: chartConfig,
    };

    setOpen(false);
  };

  const isValid = isValidChartConfiguration() && (chartConfig.name?.trim().length || 0) > 0;

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
          value={chartConfig.name || ""}
          onChange={(e) => setChartName(e.target.value || undefined)}
          placeholder="Enter chart name"
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!isValid}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportChartDialog;
