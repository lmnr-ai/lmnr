import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import { SyntheticEvent, useEffect, useState } from "react";

import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

import { Input } from "./input";

export default function TextSearchFilter({ className }: { className?: string }) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const [inputValue, setInputValue] = useState<string>("");
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const posthog = usePostHog();

  const handleKeyPress = (e: SyntheticEvent | any) => {
    if (e?.key === "Enter" || e?.keyCode === 13 || e?.code === "Enter" || e?.which === 13) {
      if (!inputValue || inputValue === "") {
        searchParams.delete("search");
      } else {
        searchParams.set("search", inputValue);
      }

      router.push(`${pathName}?${searchParams.toString()}`);
      if (isFeatureEnabled(Feature.POSTHOG)) {
        posthog.capture("traces_list_searched", {
          searchParams: searchParams.toString(),
        });
      }
    }
  };

  useEffect(() => {
    setInputValue(searchParams.get("search") ?? "");
  }, []);

  return (
    <div className={cn("flex items-center gap-x-1 border px-2 h-7 rounded-md bg-secondary", className)}>
      <Search className="min-w-4 w-4 text-secondary-foreground" />
      <Input
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        placeholder="Search"
        type="text"
        className="focus-visible:ring-0 border-none max-h-8 px-1 text-xs"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyPress}
      />
      <X
        size={16}
        className="text-secondary-foreground cursor-pointer"
        onClick={() => {
          setInputValue("");
          searchParams.delete("search");
          router.push(`${pathName}?${searchParams.toString()}`);
        }}
      />
    </div>
  );
}
