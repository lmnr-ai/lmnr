import { isEmpty } from "lodash";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { apiKeyToProvider, Provider, providers } from "@/components/playground/types";
import { providerIconMap, providerNameMap } from "@/components/playground/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconAnthropic, IconGemini, IconOpenAI } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { EnvVars } from "@/lib/env/utils";
import { ProviderApiKey } from "@/lib/settings/types";
import { cn } from "@/lib/utils";

interface LlmSelectNewProps {
  value: string;
  disabled?: boolean;
  onChange: (id: `${Provider}:${string}`) => void;
  apiKeys: ProviderApiKey[];
  className?: string;
}

const LlmSelect = ({ apiKeys, disabled, onChange, value, className }: LlmSelectNewProps) => {
  const [query, setQuery] = useState("");
  const params = useParams();
  const options = useMemo<typeof providers>(
    () =>
      providers
        .filter((provider) => apiKeys.map((key) => apiKeyToProvider?.[key.name as EnvVars]).includes(provider.provider))
        .map(({ provider, models }) => {
          const lowerQuery = query.toLowerCase();
          const providerMatches = provider.toLowerCase().includes(lowerQuery);
          const filteredModels = models.filter(({ label }) => label.toLowerCase().includes(lowerQuery));
          return providerMatches || filteredModels.length > 0
            ? { provider, models: providerMatches ? models : filteredModels }
            : null;
        })
        .filter(Boolean) as typeof providers,
    [apiKeys, query]
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger value={value} asChild>
        <Button disabled={disabled} className={cn("focus-visible:ring-0", className)} variant="outline">
          <span className="mr-2">{providerIconMap[value.split(":")[0] as Provider]}</span>
          <span className="truncate mr-2 py-0.5">
            {providers.flatMap((p) => p.models).find((m) => m.id === value)?.label ?? "Select model"}
          </span>
          <ChevronDown className="ml-auto" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <div className="flex items-center px-2" onKeyDown={(e) => e.stopPropagation()}>
          <Search size={12} />
          <Input
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search model..."
            className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {!isEmpty(options) ? (
            options.map((provider) => (
              <DropdownMenuSub key={provider.provider}>
                <DropdownMenuSubTrigger>
                  <span className="mr-2">{providerIconMap[provider.provider]}</span>{" "}
                  {providerNameMap[provider.provider]}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {provider.models.map((model) => (
                      <DropdownMenuItem key={model.id} onSelect={() => onChange(model.id)}>
                        <span title={model.id} className="mr-2">
                          {providerIconMap[provider.provider]}
                        </span>
                        <span className="truncate mr-2">{model.label}</span>
                        <Check size={14} className={cn("ml-auto", { "opacity-0": value !== model.id })} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))
          ) : (
            <DropdownMenuSub>
              <DropdownMenuItem disabled>No models found</DropdownMenuItem>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Link href={`/project/${params?.projectId}/settings`} passHref>
            <DropdownMenuItem>
              <div className="flex items-center mr-auto">
                <Plus size={12} className="mr-2" />
                More providers
              </div>
              <div className="flex overflow-hidden">
                <span className="flex items-center justify-center bg-background size-5 -mr-2 border rounded-full">
                  <IconOpenAI className="size-3" />
                </span>
                <span className="flex items-center justify-center bg-background size-5 -mr-2 border rounded-full">
                  <IconAnthropic className="size-3" />
                </span>
                <span className="flex items-center justify-center bg-background size-5 border rounded-full">
                  <IconGemini className="size-3" />
                </span>
              </div>
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LlmSelect;
