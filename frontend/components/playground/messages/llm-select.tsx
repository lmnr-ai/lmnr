import { Check, ChevronDown, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useLlmProfiles } from "@/components/playground/llm-profiles-context";
import { type LlmRoute } from "@/components/playground/utils";
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
import { Input } from "@/components/ui/input";
import { ProviderIcon } from "@/components/workspace/llm-profiles/provider-icon";
import { useProjectContext } from "@/contexts/project-context";
import { type LlmProfileOption } from "@/lib/actions/llm-profiles";
import { cn } from "@/lib/utils";

interface LlmSelectProps {
  value: LlmRoute;
  disabled?: boolean;
  onChange: (route: LlmRoute) => void;
  className?: string;
}

/** One submenu per workspace LLM profile listing its models. */
const LlmSelect = ({ disabled, onChange, value, className }: LlmSelectProps) => {
  const [query, setQuery] = useState("");
  const { settingsHref } = useProjectContext();
  const profiles = useLlmProfiles();

  const selected = profiles.find((p) => p.id === value.llmProfileId);

  const options = useMemo<LlmProfileOption[]>(() => {
    const lowerQuery = query.trim().toLowerCase();
    if (!lowerQuery) return profiles;
    return profiles.flatMap((profile) => {
      if (profile.name.toLowerCase().includes(lowerQuery)) return [profile];
      const models = profile.models.filter((m) => m.toLowerCase().includes(lowerQuery));
      return models.length > 0 ? [{ ...profile, models }] : [];
    });
  }, [profiles, query]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled} className={cn("focus-visible:ring-0 text-xs px-2", className)} variant="outline">
          {selected && <ProviderIcon provider={selected.provider} className="mr-1" />}
          <span className="truncate mr-1 py-0.5">
            {selected && value.llmModel ? `${selected.name} / ${value.llmModel}` : "Select model"}
          </span>
          <ChevronDown className="ml-auto w-3.5 h-3.5" size={16} />
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
          {options.length > 0 ? (
            options.map((profile) => (
              <DropdownMenuSub key={profile.id}>
                <DropdownMenuSubTrigger>
                  <ProviderIcon provider={profile.provider} className="mr-2" />
                  <span className="truncate">{profile.name}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {profile.models.map((model) => {
                      const isSelected = profile.id === value.llmProfileId && model === value.llmModel;
                      return (
                        <DropdownMenuItem
                          key={model}
                          onSelect={() => onChange({ llmProfileId: profile.id, llmModel: model })}
                        >
                          <span className="truncate mr-2">{model}</span>
                          <Check size={14} className={cn("ml-auto", { "opacity-0": !isSelected })} />
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            ))
          ) : (
            <DropdownMenuItem disabled>No models found</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <Link href={settingsHref("llm-profiles")} passHref>
            <DropdownMenuItem>
              <Settings2 size={12} className="mr-2" />
              Manage LLM profiles
            </DropdownMenuItem>
          </Link>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LlmSelect;
