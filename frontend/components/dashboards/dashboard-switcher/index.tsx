"use client";

import { Check, ChevronsUpDown, Pen, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import DashboardNameDialog from "./dashboard-name-dialog";
import { useDashboardActions } from "./use-dashboard-actions";

type DialogState = "create" | "rename" | "delete" | null;

const DashboardSwitcher = () => {
  const { dashboards, current, isLoading, getDashboardHref, createDashboard, renameDashboard, deleteDashboard } =
    useDashboardActions();
  const [dialog, setDialog] = useState<DialogState>(null);

  if (isLoading || !current) {
    return <Skeleton className="h-7 w-28" />;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-7 px-2 gap-1 text-sm font-medium max-w-64">
            <span className="truncate text-base">{current.name}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 rounded-lg p-0">
          <div className="p-1">
            <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground font-normal">
              Dashboards
            </DropdownMenuLabel>
            <ScrollArea className="max-h-72 [&>div]:max-h-72 [&>div>div]:block!">
              {dashboards.map((dashboard) => (
                <DropdownMenuItem key={dashboard.id} asChild className="cursor-pointer">
                  <Link href={getDashboardHref(dashboard.id)}>
                    <Check className={dashboard.id === current.id ? "size-3.5" : "size-3.5 invisible"} />
                    <span className="truncate flex-1">{dashboard.name}</span>
                    <span className="tabular-nums text-muted-foreground">{dashboard.chartCount}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          </div>
          <DropdownMenuSeparator className="m-0" />
          <div className="p-1">
            <DropdownMenuItem className="cursor-pointer" onSelect={() => setDialog("create")}>
              <Plus className="size-3.5" />
              New dashboard
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onSelect={() => setDialog("rename")}>
              <Pen className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="cursor-pointer"
              disabled={dashboards.length <= 1}
              onSelect={() => setDialog("delete")}
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <DashboardNameDialog
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        title="New dashboard"
        submitText="Create"
        onSubmit={createDashboard}
      />
      <DashboardNameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        title="Rename dashboard"
        submitText="Save"
        initialName={current.name}
        onSubmit={(name) => renameDashboard(current.id, name)}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Delete "${current.name}"?`}
        description={`This permanently deletes the dashboard and its ${current.chartCount} ${current.chartCount === 1 ? "chart" : "charts"}.`}
        confirmText="Delete"
        onConfirm={() => deleteDashboard(current.id)}
      />
    </>
  );
};

export default DashboardSwitcher;
