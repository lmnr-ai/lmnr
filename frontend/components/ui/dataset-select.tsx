import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import CreateDatasetDialog from "@/components/datasets/create-dataset-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Dataset, type DatasetInfo } from "@/lib/dataset/types";
import { type PaginatedResponse } from "@/lib/types";
import { cn, swrFetcher } from "@/lib/utils";

interface DatasetSelectProps {
  className?: string;
  onChange: (dataset: Dataset) => void;
  value?: string;
}

export default function DatasetSelect({ onChange, value, className }: DatasetSelectProps) {
  const { projectId } = useParams();
  const { data, isLoading, mutate } = useSWR<PaginatedResponse<Dataset>>(
    `/api/projects/${projectId}/datasets`,
    swrFetcher
  );

  const onValueChange = useCallback(
    (id: string | null) => {
      if (id == null) return;
      const dataset = data?.items?.find((dataset) => dataset.id === id);
      if (dataset) onChange(dataset);
    },
    [data?.items, onChange]
  );

  const onDatasetCreated = useCallback(
    (dataset: DatasetInfo) => {
      mutate(
        (current) => {
          if (!current) return current;
          return {
            ...current,
            items: [dataset as Dataset, ...current.items],
            totalCount: (current.totalCount ?? current.items.length) + 1,
          };
        },
        { revalidate: false }
      );
      onChange(dataset as Dataset);
    },
    [mutate, onChange]
  );

  return (
    <Select disabled={isLoading} value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("font-medium focus:ring-0", className)}>
        <SelectValue placeholder="Select dataset" />
      </SelectTrigger>
      <SelectContent>
        {(data?.items || []).map((dataset) => (
          <SelectItem key={dataset.id} value={dataset.id!}>
            {dataset.name}
          </SelectItem>
        ))}
        <CreateDatasetDialog onUpdate={onDatasetCreated}>
          <Button
            variant="ghost"
            className="relative flex h-auto w-full cursor-pointer justify-start rounded-sm py-1.5 pl-2 pr-8 text-sm font-normal hover:bg-secondary"
          >
            <Plus className="w-3 h-3 mr-2" />
            <span className="text-xs">Create new dataset</span>
          </Button>
        </CreateDatasetDialog>
      </SelectContent>
    </Select>
  );
}
