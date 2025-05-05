import { isNil } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { KeyboardEventHandler, memo, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

const SearchTracesInput = ({ className, filterBoxClassName }: { className?: string; filterBoxClassName?: string }) => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const posthog = usePostHog();

  const searchIn = searchParams.getAll("searchIn");
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<string>(searchIn?.length === 1 ? searchIn?.[0] : "all");
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");

  const handleWindow = useCallback(
    (open: boolean) => () => {
      setOpen(open);
    },
    []
  );

  const submit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (isNil(inputRef?.current?.value)) {
      params.delete("search");
    } else {
      params.set("search", inputRef?.current?.value);
    }

    if (params.get("searchIn")) {
      params.delete("searchIn");
    }

    if (value === "all") {
      params.append("searchIn", "input");
      params.append("searchIn", "output");
    } else {
      params.append("searchIn", value);
    }

    router.push(`${pathName}?${params.toString()}`);
    inputRef.current?.blur();
    if (isFeatureEnabled(Feature.POSTHOG)) {
      posthog.capture("traces_list_searched", {
        searchParams: searchParams.toString(),
      });
    }
  }, [pathName, posthog, router, searchParams, value]);

  const handleBlur = useCallback(() => {
    submit();
    handleWindow(false)();
  }, [handleWindow, submit]);

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
    <div className="flex flex-col flex-1 relative">
      <div className={cn("flex items-center gap-x-1 border px-2 h-7 rounded-md bg-secondary", className)}>
        <Search size={16} className="text-secondary-foreground" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          className="focus-visible:ring-0 border-none max-h-8 px-1"
          type="text"
          placeholder="Search"
          onKeyDown={handleKeyPress}
          ref={inputRef}
          onBlur={handleBlur}
          onFocus={handleWindow(true)}
          onChange={(e) => setInputValue(e.target.value)}
        />
        {inputValue && (
          <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
            <X size={16} className="text-secondary-foreground cursor-pointer" />
          </Button>
        )}
      </div>
      <div
        className={cn(
          "absolute z-50 top-10 bg-background flex flex-col gap-2 w-full rounded transition-all duration-100 ease-linear",
          open ? "h-auto p-2 border" : "h-0 p-0 border-none opacity-0 z-auto",
          filterBoxClassName
        )}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="text-secondary-foreground text-xs">Search in</span>
        <RadioGroup value={value} onValueChange={setValue} defaultValue="all">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all">All</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="input" id="input" />
            <Label htmlFor="input">Input</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="output" id="output" />
            <Label htmlFor="output">Output</Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
};

export default memo(SearchTracesInput);
