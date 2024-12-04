import { Database, X } from 'lucide-react';
import Link from 'next/link';
import { memo, useState } from 'react';

import { Button } from '@/components/ui/button';
import DatasetSelect from '@/components/ui/dataset-select';
import DefaultTextarea from '@/components/ui/default-textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useProjectContext } from '@/contexts/project-context';
import { Dataset } from '@/lib/dataset/types';
import useStore from '@/lib/flow/store';
import { type SemanticSearchNode } from '@/lib/flow/types';

const SemanticSearchNodeComponent = ({
  data
}: {
  data: SemanticSearchNode;
}) => {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { projectId } = useProjectContext();

  const id = data.id;
  const updateNodeData = useStore((state) => state.updateNodeData);

  return (
    <>
      <div className="p-4 flex flex-col space-y-2 mt-2">
        <Label htmlFor="threshold">Threshold</Label>
        <div className="flex">
          <Slider
            className="my-2"
            max={1}
            step={0.01}
            value={[data.threshold ?? 0.5]}
            onValueChange={(value) => {
              updateNodeData(id, {
                threshold: value[0]
              } as SemanticSearchNode);
            }}
          />
          <Input
            className="w-14 ml-2"
            value={data.threshold}
            onChange={(e) => {
              updateNodeData(id, {
                threshold: parseFloat(e.currentTarget.value)
              } as SemanticSearchNode);
            }}
          />
        </div>
        <Label>Limit</Label>
        <Input
          id="limit"
          value={data.limit}
          onChange={(e) => {
            updateNodeData(id, {
              limit: Number.isNaN(Number(e.currentTarget.value))
                ? 0
                : Number(e.currentTarget.value)
            } as SemanticSearchNode);
          }}
        />
        <Label>Template</Label>
        <DefaultTextarea
          className="nodrag nowheel"
          value={data.template}
          onChange={(e) => {
            updateNodeData(id, {
              template: e.currentTarget.value
            } as SemanticSearchNode);
          }}
        />
        <Dialog
          open={dialogOpen}
          onOpenChange={(newDialogOpen) => {
            setSelectedDataset(null);
            setDialogOpen(newDialogOpen);
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant={'secondary'}
              className="mt-2"
              onClick={() => setDialogOpen(true)}
            >
              Add dataset
            </Button>
          </DialogTrigger>
          <DialogContent className="md:max-w-[400px]">
            <DialogTitle>New dataset</DialogTitle>
            <DialogDescription>
              Select dataset. Only indexed datasets are shown.
            </DialogDescription>
            <DatasetSelect
              onlyShowIndexed
              onDatasetChange={(dataset) => {
                setSelectedDataset(dataset);
              }}
            />
            <DialogFooter>
              <Button
                disabled={!selectedDataset}
                className="mt-2"
                onClick={() => {
                  updateNodeData(id, {
                    datasets: data.datasets.concat(selectedDataset!)
                  } as SemanticSearchNode);
                  setDialogOpen(false);
                }}
              >
                Add dataset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div>
          {data.datasets?.map((dataset, i) => (
            <div
              key={i}
              className="mt-2 flex h-10 items-center space-x-2 rounded bg-secondary p-2 border group"
            >
              <Database size={14} />
              <Label className="truncate">
                <Link href={`/project/${projectId}/datasets/${dataset.id}`}>{dataset.name}</Link>
              </Label>
              <Label className="text-xs text-muted-foreground">
                indexed on {`'${dataset.indexedOn}'`}
              </Label>
              <div className="flex-grow"></div>
              <Button
                variant={'ghost'}
                className="hidden group-hover:block"
                onClick={() => {
                  updateNodeData(id, {
                    datasets: data.datasets.filter((_, index) => index !== i)
                  } as SemanticSearchNode);
                }}
              >
                <X size={14} />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default memo(SemanticSearchNodeComponent);
