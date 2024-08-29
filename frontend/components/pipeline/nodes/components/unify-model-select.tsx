import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UnifyNode, UnifyThreshold } from '@/lib/flow/types';
import { X } from 'lucide-react';
import { useState } from 'react';

const TYPE_MANUALLY = '– type manually –';
const selectableModelNames = ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'codellama-34b-instruct', 'codellama-13b-instruct', 'codellama-7b-instruct', 'deepseek-coder-33b-instruct', 'gemma-7b-it', 'gemma-2b-it', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'llama-3-70b-chat', 'llama-3-8b-chat', 'llama-2-70b-chat', 'llama-2-13b-chat', 'llama-2-7b-chat', 'mistral-large', 'mistral-medium', 'mistral-small', 'mistral-7b-instruct-v0.2', 'mistral-7b-instruct-v0.1', 'mixtral-8x22b-instruct-v0.1', 'mixtral-8x7b-instruct-v0.1', 'pplx-70b-chat', 'pplx-7b-chat', 'yi-34b-chat'];
const selectableProviders = ['lowest-input-cost', 'lowest-output-cost', 'lowest-itl', 'lowest-ttft', 'highest-tks-per-sec', 'anthropic', 'anyscale', 'aws-bedrock', 'deepinfra', 'fireworks-ai', 'lepton-ai', 'mistral-ai', 'octoai', 'openai', 'perplexity-ai', 'replicate', 'together-ai'];
const dynamicProviders = ['lowest-input-cost', 'lowest-output-cost', 'lowest-itl', 'lowest-ttft', 'highest-tks-per-sec'];

interface ModelSelectProps {
  savedUploadedBy: string,
  savedModelName: string,
  savedProviderName: string,
  savedMetrics: UnifyThreshold[]
  onModelChange: (model: UnifyNode) => void
}

export default function UnifyModelSelect({ savedUploadedBy, savedModelName, savedProviderName, savedMetrics, onModelChange }: ModelSelectProps) {
  const [uploadedBy, setUploadedBy] = useState(savedUploadedBy);

  const [selectedModelName, setSelectedModelName] = useState(selectableModelNames.includes(savedModelName) ? savedModelName : TYPE_MANUALLY);
  const [typedModelName, setTypedModelName] = useState(selectableModelNames.includes(savedModelName) ? '' : savedModelName);

  const [selectedProvider, setSelectedProvider] = useState(savedProviderName);
  const [typedProvider, setTypedProvider] = useState(savedProviderName);

  const [metrics, setMetrics] = useState(savedMetrics);

  return (
    <div className="flex flex-col space-y-2">
      <Label>Model</Label>
      <Select
        value={selectedModelName}
        onValueChange={(value) => {
          setSelectedModelName(value);
          if (value !== TYPE_MANUALLY) {
            setTypedModelName('');
            onModelChange({ modelName: value } as UnifyNode);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue>{selectedModelName}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem key={-1} value={TYPE_MANUALLY}>
            {TYPE_MANUALLY}
          </SelectItem>
          {
            selectableModelNames.map((model, i) => (
              <SelectItem key={`model-select-${i}`} value={model}>
                {model}
              </SelectItem>
            ))
          }
        </SelectContent>
      </Select>
      {(selectedModelName === TYPE_MANUALLY) && (
        <Input
          placeholder="Enter model name"
          value={typedModelName}
          onChange={(e) => {
            setTypedModelName(e.target.value);
            onModelChange({ modelName: e.target.value } as UnifyNode);
          }}
        />
      )}

      <Label>Provider</Label>
      <Select
        value={selectedProvider}
        onValueChange={(value) => {
          setSelectedProvider(value);
          if (value !== TYPE_MANUALLY) {
            setTypedProvider('');
            onModelChange({ providerName: value } as UnifyNode);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue>{selectedProvider}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem key={-1} value={TYPE_MANUALLY}>
            {TYPE_MANUALLY}
          </SelectItem>
          {
            selectableProviders.map((provider, i) => (
              <SelectItem className={dynamicProviders.includes(provider) ? "font-bold" : ""} key={`provider-select-${i}`} value={provider}>
                {provider}
              </SelectItem>
            ))
          }
        </SelectContent>
      </Select>
      {(selectedProvider === TYPE_MANUALLY) && (
        <Input
          placeholder="Enter provider name"
          value={typedProvider}
          onChange={(e) => {
            setTypedProvider(e.target.value);
            onModelChange({ providerName: e.target.value } as UnifyNode);
          }}
        />
      )}

      <Label>Uploaded by (Optional)</Label>
      <Input
        autoFocus
        placeholder="Enter uploader"
        value={uploadedBy}
        onChange={(e) => {
          setUploadedBy(e.target.value);
          onModelChange({ uploadedBy: e.target.value } as UnifyNode);
        }}
      />

      <Label>Thresholds</Label>
      <div className="flex flex-col space-y-2">
        {
          metrics.map((metric, i) => (
            <div key={`metric-${i}`} className='flex h-10 rounded bg-secondary p-2 border group items-center'>
              <Input
                type='number'
                value={metric.float}
                onChange={(e) => {
                  const newMetrics = [...metrics];
                  newMetrics[i].float = parseFloat(e.target.value);
                  setMetrics(newMetrics);
                  onModelChange({ metrics: newMetrics } as UnifyNode);
                }}
              />
              <Input
                value={metric.metric}
                onChange={(e) => {
                  const newMetrics = [...metrics];
                  newMetrics[i].metric = e.target.value;
                  setMetrics(newMetrics);
                  onModelChange({ metrics: newMetrics } as UnifyNode);
                }}
              />
              <button className='ml-1'
                onClick={() => {
                  const newMetrics = metrics.filter((_, index) => index !== i);
                  setMetrics(newMetrics);
                  onModelChange({
                    metrics: newMetrics
                  } as UnifyNode);
                }}
              >
                <X size={14} />
              </button>
            </div>
          ))
        }
      </div>
      <Button variant={'secondary'} onClick={() => {
        setMetrics([...metrics, { float: 0.5, metric: 'input-cost' } as UnifyThreshold]);
        onModelChange({
          metrics: metrics
        } as UnifyNode);
      }}>
        Add threshold
      </Button>
    </div >
  )
}