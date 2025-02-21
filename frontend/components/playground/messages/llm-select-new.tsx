import { isEmpty } from "lodash";
import { ChevronDown, Search } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

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
import {
  IconAmazonBedrock,
  IconAnthropic,
  IconAzure,
  IconGemini,
  IconGroq,
  IconMistral,
  IconOpenAI,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Provider, providers } from "@/lib/pipeline/types";

const providerIconMap: Record<Provider, ReactNode> = {
  openai: <IconOpenAI className="mr-2" />,
  anthropic: <IconAnthropic className="mr-2" />,
  gemini: <IconGemini className="mr-2" />,
  groq: <IconGroq className="mr-2" />,
  mistral: <IconMistral className="mr-2" />,
  bedrock: <IconAmazonBedrock className="mr-2" />,
  "openai-azure": <IconAzure className="mr-2" />,
};

const providerNameMap: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistal",
  bedrock: "Amazon Bedrock",
  "openai-azure": "Azure",
};

const LlmSelectNew = () => {
  const [query, setQuery] = useState("");
  const options = useMemo<typeof providers>(
    () =>
      providers
        .map(({ provider, models }) => {
          const lowerQuery = query.toLowerCase();
          const providerMatches = provider.toLowerCase().includes(lowerQuery);
          const filteredModels = models.filter(({ name }) => name.toLowerCase().includes(lowerQuery));
          return providerMatches || filteredModels.length > 0
            ? { provider, models: providerMatches ? models : filteredModels }
            : null;
        })
        .filter(Boolean) as typeof providers,
    [query]
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="w-64 py-4" variant="outline">
          <span>Provider</span>
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
                  {providerIconMap[provider.provider]} {providerNameMap[provider.provider]}
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {provider.models.map((model) => (
                      <DropdownMenuItem key={model.id} onSelect={(e) => e.preventDefault()}>
                        {providerIconMap[provider.provider]} {model.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))
          ) : (
            <DropdownMenuSub>
              <DropdownMenuItem disabled>Not models found</DropdownMenuItem>
            </DropdownMenuSub>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LlmSelectNew;
