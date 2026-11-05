"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderIcon } from "@/components/workspace/llm-profiles/provider-icon";
import { type LlmProfile } from "@/lib/actions/llm-profiles/schema";

import { type RouteTarget } from "./utils";

const UNSET = "__unset__";
// Profile ids are UUIDs, so the first separator splits even when a model name contains one.
const SEPARATOR = "|";

const encode = (target: RouteTarget) => `${target.llmProfileId}${SEPARATOR}${target.model}`;

const decode = (value: string): RouteTarget | null => {
  if (value === UNSET) return null;
  const at = value.indexOf(SEPARATOR);
  return { llmProfileId: value.slice(0, at), model: value.slice(at + SEPARATOR.length) };
};

interface RouteSelectProps {
  profiles: LlmProfile[];
  /** `undefined` while the group's rows disagree ("Mixed"). */
  value: RouteTarget | null | undefined;
  disabled: boolean;
  onChange: (target: RouteTarget | null) => void;
}

export default function RouteSelect({ profiles, value, disabled, onChange }: RouteSelectProps) {
  const selected = value === undefined ? "" : value === null ? UNSET : encode(value);
  const selectedProfile = value ? profiles.find((p) => p.id === value.llmProfileId) : undefined;

  return (
    <Select value={selected} disabled={disabled} onValueChange={(v) => onChange(decode(v))}>
      <SelectTrigger className="h-8 w-64 text-sm">
        <SelectValue placeholder="Mixed">
          {value === null ? (
            <span className="text-muted-foreground">Unset</span>
          ) : (
            value && (
              <span className="flex min-w-0 items-center gap-2">
                {selectedProfile && <ProviderIcon provider={selectedProfile.provider} />}
                <span className="truncate">
                  {selectedProfile?.name ?? "Unknown profile"} / {value.model}
                </span>
              </span>
            )
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNSET}>
          <span className="text-muted-foreground">Unset</span>
        </SelectItem>
        {profiles.map((profile) => (
          <SelectGroup key={profile.id}>
            <SelectSeparator />
            <SelectLabel className="flex items-center gap-2 text-xs text-muted-foreground">
              <ProviderIcon provider={profile.provider} />
              {profile.name}
            </SelectLabel>
            {profile.models.map((model) => (
              <SelectItem key={model} value={encode({ llmProfileId: profile.id, model })}>
                {model}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
