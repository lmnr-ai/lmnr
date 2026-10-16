import { Copy, Edit, Ellipsis, GripVertical, Pen, Trash2 } from "lucide-react";
import Link from "next/link";
import React, { type FocusEvent, type KeyboardEventHandler, useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { type DashboardChart, dragHandleKey, getChartsUrl, getDashboardsUrl } from "@/components/dashboards/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils";

interface ChartHeaderProps {
  name: string;
  id: string;
  projectId: string;
  dashboardId: string;
}

const deleteChart = async (chartsUrl: string, id: string) => {
  await fetch(`${chartsUrl}/${id}`, {
    method: "DELETE",
  });
};

const duplicateChart = async (chartsUrl: string, id: string) => {
  const res = await fetch(`${chartsUrl}/${id}/duplicate`, {
    method: "POST",
  });

  if (!res.ok) throw new Error("Failed to duplicate chart");
};

const updateChart = async (chartsUrl: string, id: string, name: string) => {
  await fetch(`${chartsUrl}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name,
    }),
  });
};

const ChartHeader = ({ name, id, projectId, dashboardId }: ChartHeaderProps) => {
  const chartsUrl = getChartsUrl(projectId, dashboardId);
  // The switcher's chart counts come from the dashboards list, so adding or
  // removing a chart has to revalidate it alongside the charts themselves.
  const dashboardsUrl = getDashboardsUrl(projectId);
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { mutate } = useSWRConfig();
  const handleDeleteChart = useCallback(async () => {
    try {
      await mutate<DashboardChart[]>(
        chartsUrl,
        async (currentData) => {
          await deleteChart(chartsUrl, id);
          return (currentData || []).filter((item) => item.id !== id);
        },
        {
          revalidate: false,
          populateCache: true,
          rollbackOnError: true,
          optimisticData: (currentData) => (currentData || []).filter((item) => item.id !== id),
        }
      );
      await mutate(dashboardsUrl);
      track("dashboards", "chart_deleted");
    } catch (e) {
      toast({
        title: "Failed to delete chart. Please try again.",
        variant: "destructive",
      });
    }
  }, [chartsUrl, dashboardsUrl, id, mutate, toast]);

  const handleDuplicateChart = useCallback(async () => {
    try {
      await duplicateChart(chartsUrl, id);
      // Refetch rather than appending the new chart: duplicating also shifts the
      // siblings it displaced, so the server holds the only complete layout.
      await Promise.all([mutate(chartsUrl), mutate(dashboardsUrl)]);
      track("dashboards", "chart_duplicated");
    } catch (e) {
      toast({
        title: "Failed to duplicate chart. Please try again.",
        variant: "destructive",
      });
    }
  }, [chartsUrl, dashboardsUrl, id, mutate, toast]);

  const handleUpdateChart = useCallback(
    async (newName: string) => {
      try {
        if (newName === name || name?.trim()?.length === 0) return;
        if (newName) {
          await mutate<DashboardChart[]>(
            chartsUrl,
            async (currentData) => {
              await updateChart(chartsUrl, id, newName);
              return (currentData || []).map((item) => (item.id === id ? { ...item, name: newName } : item));
            },
            {
              revalidate: false,
              populateCache: true,
              rollbackOnError: true,
              optimisticData: (currentData) =>
                (currentData || []).map((item) => (item.id === id ? { ...item, name: newName } : item)),
            }
          );
        }
      } catch (e) {
        toast({
          title: "Failed to update chart. Please try again.",
          variant: "destructive",
        });
      }
    },
    [chartsUrl, id, mutate, name, toast]
  );

  const handleOnBlur = async (e: FocusEvent<HTMLInputElement>) => {
    await handleUpdateChart(e.target.value);
    setIsEditing(false);
  };

  const handleKeyDown: KeyboardEventHandler<HTMLInputElement> = async (e) => {
    if (e.key === "Enter" && "value" in e.target) {
      await handleUpdateChart(e.target.value as string);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return (
    <div className="flex gap-2 items-center">
      <GripVertical className={cn("w-4 h-4 min-w-4 min-h-4 cursor-pointer text-muted-foreground", dragHandleKey)} />
      {isEditing ? (
        <Input
          ref={inputRef}
          type="text"
          defaultValue={name}
          onKeyDown={handleKeyDown}
          onBlur={handleOnBlur}
          className="w-full text-sm! bg-transparent"
          onClick={(e) => e.preventDefault()}
        />
      ) : (
        <span title={name} className="font-medium text-lg text-secondary-foreground truncate">
          {name}
        </span>
      )}
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="More options"
              variant="ghost"
              size="sm"
              className="h-6 w-6 text-muted-foreground p-0 ml-auto focus-visible:ring-0"
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="cursor-pointer"
            >
              <Pen className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <Link passHref href={`/project/${projectId}/dashboards/${dashboardId}/charts/${id}`}>
              <DropdownMenuItem className="cursor-pointer">
                <Edit className="size-3.5" />
                Edit
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDuplicateChart();
              }}
              className="cursor-pointer"
            >
              <Copy className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChart();
              }}
              variant="destructive"
              className="cursor-pointer"
            >
              <Trash2 className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default ChartHeader;
