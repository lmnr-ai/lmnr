"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ColumnsMenu } from "@/components/ui/columns-menu";
import DateRangeFilter from "@/components/ui/date-range-filter";
import DataTableFilter from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AUDIT_EXPORT_MAX_ROWS } from "@/lib/actions/audit-log/types";

import { columnLabels } from "./columns";
import { auditLogFilters } from "./constants";

interface AuditLogTableControlsProps {
  /** CSV of the events matching the current filters and time range. */
  exportHref: string;
}

// Filters and the time range live in the URL (the filter is uncontrolled), so the page reads them back from there.
export function AuditLogTableControls({ exportHref }: AuditLogTableControlsProps) {
  return (
    <div className="flex flex-1 w-full h-full flex-wrap gap-2 pt-1">
      <DataTableFilter columns={auditLogFilters} />
      <ColumnsMenu columnLabels={columnLabels} />
      <DateRangeFilter />
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" asChild className="ml-auto">
              <a href={exportHref} download>
                <Download className="mr-1.5 size-3.5" />
                Export CSV
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Exports events matching the current filters and time range, newest first, up to{" "}
            {AUDIT_EXPORT_MAX_ROWS.toLocaleString("en-US")} rows.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
