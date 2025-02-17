import { Check, ChevronsUpDown } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectContext } from "@/contexts/project-context";
import { Provider, providers } from "@/lib/pipeline/types";
import { ProviderApiKey } from "@/lib/settings/types";
import { swrFetcher } from "@/lib/utils";

interface ModelSelectProps {
  value: string;
  disabled?: boolean;
  onChange: (id: `${Provider}:${string}`) => void;
}

const LLMSelect = ({ value, disabled, onChange }: ModelSelectProps) => {
  const model = useMemo(() => providers.flatMap((provider) => provider.models).find((v) => v.id === value), [value]);
  const [open, setOpen] = useState(false);

  const { projectId } = useProjectContext();
  const { data: providerApiKeys } = useSWR<ProviderApiKey[]>(
    `/api/projects/${projectId}/provider-api-keys`,
    swrFetcher
  );

  const isProviderKeySet = (provider: string) =>
    providerApiKeys?.some((key) => key.name.toLowerCase().includes(provider.toLowerCase()));

  return (
    <>
      {model && !isProviderKeySet(model.id.split(":")[0]) && (
        <div className="mt-2 text-destructive text-sm">
          API key for {model.id} is not set. Please set it in the{" "}
          <Link href={`/project/${projectId}/settings`} className="underline">
            settings
          </Link>
          .
        </div>
      )}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild disabled={disabled}>
          <Button variant="outline" className="justify-between">
            {model?.name ?? "-"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height]">
          <Command className="w-full overflow-y-auto">
            <CommandInput placeholder="provider:model-name" />
            <CommandList>
              <CommandEmpty> No model found </CommandEmpty>
              <CommandGroup>
                {providers.map((provider) =>
                  provider.models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={() => {
                        onChange(model.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={value === model.id ? "opacity-100" : "opacity-0"} />
                      {provider.provider}:{model.name}
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
};

export default LLMSelect;
