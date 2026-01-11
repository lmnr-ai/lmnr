import { isNil } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { type KeyboardEventHandler, memo, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

const SearchEvaluationInput = ({ className }: { className?: string }) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const posthog = usePostHog();

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");

  const submit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (isNil(inputRef?.current?.value)) {
      params.delete("search");
    } else {
      params.set("search", inputRef?.current?.value);
    }

    // Always search in all fields
    if (params.has("searchIn")) {
      params.delete("searchIn");
    }
    // Include all search fields
    params.append("searchIn", "data");
    params.append("searchIn", "target");
    params.append("searchIn", "scores");
    params.append("searchIn", "span_input");
    params.append("searchIn", "span_output");

    router.push(`${pathName}?${params.toString()}`);
    inputRef.current?.blur();
    if (isFeatureEnabled(Feature.POSTHOG)) {
      posthog.capture("evaluation_results_searched", {
        searchParams: searchParams.toString(),
      });
    }
  }, [pathName, posthog, router, searchParams]);

  const handleKeyPress: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e?.key === "Enter") {
        submit();
      }
    },
    [submit]
  );

  const handleClearInput = useCallback(() => {
    if (inputRef.current) {
      if (inputRef.current?.value !== "") {
        setInputValue("");
        inputRef.current.value = "";
        submit();
      }
    }
  }, [submit]);

  return (
    <div className="flex flex-1 relative">
      <div className={cn("flex items-center gap-x-1 border px-2 h-7 rounded-md w-full bg-secondary", className)}>
        <Search size={14} className="text-secondary-foreground" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          className="focus-visible:ring-0 border-none max-h-8 px-1 text-xs placeholder:text-xs bg-transparent"
          type="text"
          placeholder="Search in data, targets, scores and spans..."
          onKeyDown={handleKeyPress}
          ref={inputRef}
          onBlur={submit}
          onChange={(e) => setInputValue(e.target.value)}
        />
        {inputValue && (
          <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
            <X size={16} className="text-secondary-foreground cursor-pointer" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default memo(SearchEvaluationInput);
