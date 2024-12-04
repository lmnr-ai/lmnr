import { AlertTriangle } from 'lucide-react';

import DatasetSelect from '@/components/ui/dataset-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import useStore from '@/lib/flow/store';
import { LLMNode } from '@/lib/flow/types';

interface SemanticCacheFieldsProps {
  data: LLMNode;
}

export default function SemanticCacheFields({
  data
}: SemanticCacheFieldsProps) {
  const { updateNodeData } = useStore();

  return (
    <div>
      <div className="flex items-center">
        <div className="flex items-center py-1">
          <Label className="mr-2">Semantic cache</Label>
          <Switch
            checked={data.semanticCacheEnabled}
            onCheckedChange={(enabled) => {
              updateNodeData(data.id, {
                semanticCacheEnabled: enabled
              } as LLMNode);
            }}
          />
          {data.semanticCacheEnabled &&
            (!data.semanticCacheDatasetId || !data.semanticCacheDataKey) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <AlertTriangle className="text-red-500 group-hover:text-red-400 h-4" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Dataset and output data key are not selected</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      {data.semanticCacheEnabled && (
        <div className="p-2 border rounded">
          <Label className="my-10">
            Threshold: {data.semanticSimilarityThreshold ?? 0.9}
          </Label>
          <Slider
            className="my-2"
            max={1}
            step={0.01}
            value={[data.semanticSimilarityThreshold ?? 0.9]}
            onValueChange={(value) => {
              updateNodeData(data.id, {
                semanticSimilarityThreshold: value[0]
              } as LLMNode);
            }}
          />
          <Label>Cache dataset</Label>
          <DatasetSelect
            selectedDatasetId={data.semanticCacheDatasetId}
            onDatasetChange={(dataset) => {
              updateNodeData(data.id, {
                semanticCacheDatasetId: dataset.id
              } as LLMNode);
            }}
          />
          {/* TODO: replace the below with column select.
              Iterating through entire dataset to do that here is overkill,
              so simply a text input for now*/}
          {data.semanticCacheDatasetId && (
            <>
              <Label>Data output key</Label>
              <Input
                value={data.semanticCacheDataKey}
                onChange={(e) => {
                  updateNodeData(data.id, {
                    semanticCacheDataKey: e.currentTarget.value
                  } as LLMNode);
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
