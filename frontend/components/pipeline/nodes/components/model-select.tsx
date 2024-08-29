import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LANGUAGE_MODELS, LanguageModel } from '@/lib/pipeline/types';

import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ModelSelectProps {
  modelId: string;
  disabled?: boolean;
  onModelChange: (model: LanguageModel) => void
}

export default function LanguageModelSelect({ modelId, disabled, onModelChange }: ModelSelectProps) {
  const [selectedModelId, setSelectedModelId] = useState(modelId);
  const [model, setModel] = useState<LanguageModel | undefined>(LANGUAGE_MODELS.find(model => model.id === modelId));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setModel(LANGUAGE_MODELS.find(model => model.id === modelId))
  }, [modelId])

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" className='justify-between'>
          {model!.name}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height]">
        <Command className='w-full overflow-y-auto'>
          <CommandInput placeholder='provider:model-name' />
          <CommandEmpty> No model found </CommandEmpty>
          <ScrollArea className='md:h-[250px]'>
            <CommandGroup className='w-full'>
              {LANGUAGE_MODELS.map((model) => (
                <CommandItem key={model.id} value={model.id} onSelect={(value) => {
                  setSelectedModelId(value);
                  const newModel = LANGUAGE_MODELS.find(model => model.id === value)!
                  onModelChange(newModel)
                  setOpen(false);
                }}>
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedModelId === model.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {model.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </ScrollArea>
        </Command>
      </PopoverContent>
    </Popover>
  )
}