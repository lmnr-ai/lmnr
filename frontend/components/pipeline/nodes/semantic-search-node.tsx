import { memo, useState } from 'react'
import useStore from '@/lib/flow/store'
import { type SemanticSearchNode } from '@/lib/flow/types'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from '@/components/ui/dialog'
import DatasetSelect from '@/components/ui/dataset-select'
import { Dataset } from '@/lib/dataset/types'
import { Button } from '@/components/ui/button'
import DefaultTextarea from '@/components/ui/default-textarea'
import { Database, X } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

const SemanticSearchNodeComponent = ({
  data
}: {
  data: SemanticSearchNode;
}) => {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const id = data.id;
  const updateNodeData = useStore((state) => state.updateNodeData);

  return (
    <>
      <div className='p-4 flex flex-col space-y-2 mt-2'>
        <Label htmlFor='threshold'>Threshold</Label>
        <div className='flex'>
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
            className='w-14 ml-2'
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
          id='limit'
          value={data.limit}
          onChange={(e) => {
            updateNodeData(id, {
              limit: Number.isNaN(Number(e.currentTarget.value)) ? 0 : Number(e.currentTarget.value)
            } as SemanticSearchNode);
          }}
        />
        <Label>Template</Label>
        <DefaultTextarea
          className='nodrag nowheel'
          value={data.template}
          onChange={(e) => {
            updateNodeData(id, {
              template: e.currentTarget.value
            } as SemanticSearchNode);
          }}
        />
        <Dialog open={dialogOpen} onOpenChange={(newDialogOpen) => {
          setSelectedDataset(null);
          setDialogOpen(newDialogOpen);
        }}>
          <DialogTrigger asChild>
            <Button variant={'secondary'} className='mt-2' onClick={
              () => setDialogOpen(true)
            }>Add datasource</Button>
          </DialogTrigger>
          <DialogContent className='md:max-w-[400px]'>
            <DialogHeader>
              <h1 className='text-lg font-semibold'>New datasource</h1>
            </DialogHeader>
            <Label>Dataset</Label>
            <DatasetSelect
              onDatasetChange={(dataset) => {
                setSelectedDataset(dataset)
              }}
            />
            <DialogFooter>
              <Button
                disabled={!selectedDataset}
                className='mt-2'
                onClick={() => {
                  updateNodeData(id, {
                    datasets: data.datasets.concat(selectedDataset!)
                  } as SemanticSearchNode);
                  setDialogOpen(false)
                }}
              >
                Add dataset
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div>
          {
            data.datasets?.map((dataset, i) => (
              <div key={i} className='mt-2 flex h-10 items-center space-x-2 rounded bg-secondary p-2 border group'>
                <Database size={14} />
                <Label className='truncate'>{(dataset as Dataset).name}</Label>
                <div className='flex-grow'></div>
                <button
                  className='hidden group-hover:block'
                  onClick={() => {
                    updateNodeData(id, {
                      datasets: data.datasets.filter((_, index) => index !== i)
                    } as SemanticSearchNode);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))
          }
        </div>
      </div>
    </>
  );
};

export default memo(SemanticSearchNodeComponent);
