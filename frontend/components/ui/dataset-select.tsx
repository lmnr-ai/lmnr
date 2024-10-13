import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { useProjectContext } from '@/contexts/project-context';
import { Dataset } from '@/lib/dataset/types';
import { PaginatedResponse } from '@/lib/types';

interface DatasetSelectProps {
  onDatasetChange: (dataset: Dataset) => void
  selectedDatasetId?: string
}

export default function DatasetSelect({ onDatasetChange, selectedDatasetId }: DatasetSelectProps) {

  const { projectId } = useProjectContext();
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/datasets`)
      .then(res => res.json())
      .then((datasets: PaginatedResponse<Dataset>) => {
        setDatasets(datasets.items);
      });
  }, []);

  return (
    <div className="align-middle space-x-2">
      <Select
        value={selectedDatasetId ?? undefined}
        onValueChange={(datasetId) => {
          const selectedDataset = datasets!.find((dataset) => dataset.id === datasetId)!;
          onDatasetChange(selectedDataset);
        }}
      >
        <SelectTrigger className="font-medium">
          <SelectValue placeholder="Select dataset" />
        </SelectTrigger>
        <SelectContent>
          {
            (datasets ?? []).map((dataset) => (
              <SelectItem key={dataset.id} value={dataset.id!}>
                {dataset.name}
              </SelectItem>
            ))
          }
        </SelectContent>
      </Select>
    </div>
  );
}
