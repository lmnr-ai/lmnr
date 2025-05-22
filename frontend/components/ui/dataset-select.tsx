import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import CreateDatasetDialog from "@/components/datasets/create-dataset-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dataset } from "@/lib/dataset/types";
import { PaginatedResponse } from "@/lib/types";
import { cn, swrFetcher } from "@/lib/utils";

interface DatasetSelectProps {
  className?: string;
  onChange: (dataset: Dataset) => void;
  value?: string;
}

export default function DatasetSelect({ onChange, value, className }: DatasetSelectProps) {
  const { projectId } = useParams();
  const { data, isLoading } = useSWR<PaginatedResponse<Dataset>>(`/api/projects/${projectId}/datasets`, swrFetcher);

  const onValueChange = useCallback(
    (id: string) => {
      const dataset = data?.items?.find((dataset) => dataset.id === id);
      if (dataset) onChange(dataset);
    },
    [data?.items, onChange]
  );

  return (
    <Select disabled={isLoading} value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("font-medium", className)}>
        <SelectValue placeholder="Select dataset" />
      </SelectTrigger>
      <SelectContent>
        {(data?.items || []).map((dataset) => (
          <SelectItem key={dataset.id} value={dataset.id!}>
            {dataset.name}
          </SelectItem>
        ))}
        <CreateDatasetDialog>
          <div className="relative flex w-full cursor-pointer hover:bg-secondary items-center rounded-sm py-1.5 pl-2 pr-8 text-sm">
            <Plus className="w-3 h-3 mr-2" />
            <span className="text-xs">Create new dataset</span>
          </div>
        </CreateDatasetDialog>
      </SelectContent>
    </Select>
  );
}
