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
            <span className="truncate">{current.name}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Dashboards</DropdownMenuLabel>
          <div className="max-h-72 overflow-y-auto">
            {dashboards.map((dashboard) => (
              <DropdownMenuItem key={dashboard.id} asChild className="cursor-pointer">
                <Link href={getDashboardHref(dashboard.id)}>
                  <Check className={dashboard.id === current.id ? "size-3.5" : "size-3.5 invisible"} />
                  <span className="truncate flex-1">{dashboard.name}</span>
                  <span className="text-xs text-muted-foreground">{dashboard.chartCount}</span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="cursor-pointer" onSelect={() => setDialog("create")}>
            <Plus className="size-3.5" />
            New dashboard
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" onSelect={() => setDialog("rename")}>
            <Pen className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            disabled={dashboards.length <= 1}
            onSelect={() => setDialog("delete")}
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
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
        description={`This permanently deletes the dashboard and its ${current.chartCount} chart(s).`}
        confirmText="Delete"
        onConfirm={() => deleteDashboard(current.id)}
      />
    </>
  );
};

export default DashboardSwitcher;
