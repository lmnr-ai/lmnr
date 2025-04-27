import { isNil } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { KeyboardEventHandler, memo, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

const handleUpdateCheckboxParam = (type: "output" | "input", params: URLSearchParams, checked?: boolean) => {
  const current = params.getAll("searchIn");

  if (checked) {
    params.append("searchIn", type);
  } else {
    const updated = current.filter((v) => v !== type);
    params.delete("searchIn");
    updated.forEach((v) => params.set("searchIn", v));
  }
};

const SearchTracesInput = () => {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const posthog = usePostHog();

  const inputRef = useRef<HTMLInputElement>(null);
  const checkboxInputRef = useRef<HTMLButtonElement>(null);
  const checkboxOutputRef = useRef<HTMLButtonElement>(null);

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

    handleUpdateCheckboxParam("input", params, checkboxInputRef?.current?.ariaChecked === "true");
    handleUpdateCheckboxParam("output", params, checkboxOutputRef?.current?.ariaChecked === "true");

    router.push(`${pathName}?${params.toString()}`);
    inputRef.current?.blur();
    if (isFeatureEnabled(Feature.POSTHOG)) {
      posthog.capture("traces_list_searched", {
        searchParams: searchParams.toString(),
      });
    }
  }, [pathName, posthog, router, searchParams]);

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
        inputRef.current.value = "";
        submit();
      }
    }
  }, [submit]);

  return (
    <div className="flex flex-col flex-1 relative">
      <div className={cn("flex items-center gap-x-1 border px-2 rounded-md", { "ring-1": open })}>
        <Search size={18} className="text-secondary-foreground min-w-[18px]" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          className="focus-visible:ring-0 border-none max-h-8 px-1"
          type="text"
          placeholder="Search"
          onKeyDown={handleKeyPress}
          ref={inputRef}
          onBlur={handleBlur}
          onFocus={handleWindow(true)}
        />
        <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
          <X size={18} className="text-secondary-foreground cursor-pointer min-w-[18px]" />
        </Button>
      </div>
      <div
        className={cn(
          "absolute z-50 top-10 bg-background flex flex-col gap-4 w-full rounded transition-all duration-100 ease-linear",
          open ? "h-auto p-4 border" : "h-0 p-0 border-none opacity-0"
        )}
        onMouseDown={(e) => e.preventDefault()}
      >
        <span className="text-secondary-foreground text-xs">Search params</span>
        <div className="flex items-center space-x-2">
          <Checkbox
            defaultChecked={searchParams.getAll("searchIn").includes("input")}
            value="input"
            ref={checkboxInputRef}
            className="border-secondary"
          />
          <Label htmlFor="input">Span input</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox
            defaultChecked={searchParams.getAll("searchIn").includes("output")}
            value="output"
            ref={checkboxOutputRef}
            className="border-secondary"
          />
          <Label htmlFor="output">Span output</Label>
        </div>
      </div>
    </div>
  );
};

export default memo(SearchTracesInput);
