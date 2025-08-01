import { Edit, EllipsisVertical, GripVertical, Trash2 } from "lucide-react";
import React, { FocusEvent, KeyboardEventHandler, useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { DashboardChart, dragHandleKey } from "@/components/dashboard/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ChartHeaderProps {
  name: string;
  id: string;
  projectId: string;
}

const deleteChart = async (id: string, projectId: string) => {
  await fetch(`/api/projects/${projectId}/dashboard-charts/${id}`, {
    method: "DELETE",
  });
};

const updateChart = async (id: string, projectId: string, name: string) => {
  await fetch(`/api/projects/${projectId}/dashboard-charts/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name,
    }),
  });
};

const ChartHeader = ({ name, id, projectId }: ChartHeaderProps) => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const { mutate } = useSWRConfig();
  const handleDeleteChart = useCallback(async () => {
    try {
      await mutate<DashboardChart[]>(
        `/api/projects/${projectId}/dashboard-charts`,
        async (currentData) => {
          await deleteChart(id, projectId);
          return (currentData || []).filter((item) => item.id !== id);
        },
        {
          revalidate: false,
          populateCache: true,
          rollbackOnError: true,
          optimisticData: (currentData) => (currentData || []).filter((item) => item.id !== id),
        }
      );
      await deleteChart(id, projectId);
    } catch (e) {
      toast({
        title: "Failed to delete chart. Please try again.",
        variant: "destructive",
      });
    }
  }, [id, mutate, projectId, toast]);

  const handleUpdateChart = useCallback(
    async (newName: string) => {
      try {
        if (newName === name || name?.trim()?.length === 0) return;
        if (newName) {
          await mutate<DashboardChart[]>(
            `/api/projects/${projectId}/dashboard-charts`,
            async (currentData) => {
              await updateChart(id, projectId, newName);
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
    [id, mutate, name, projectId, toast]
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
          className="w-full text-lg bg-transparent focus:ring-0 focus-visible:ring-0 p-0 h-fit"
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
              variant="ghost"
              size="sm"
              className="h-6 w-6 text-muted-foreground p-0 ml-auto focus-visible:ring-0 -mr-1"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="h-3 w-3" />
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
              <Edit className="h-3 w-3 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteChart();
              }}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default ChartHeader;
