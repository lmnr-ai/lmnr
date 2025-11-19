import { isNil } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { KeyboardEventHandler, useRef, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { Input } from "@/components/ui/input";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

interface DataTableSearchProps {
  className?: string;
  searchColumns?: string[];
  placeholder?: string;
}

export const DataTableSearch = ({
  className,
  searchColumns = [],
  placeholder = "Search in table...",
}: DataTableSearchProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const posthog = usePostHog();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");

  const store = useDataTableStore();
  const { getStorageKey } = useStore(store, (state) => ({
    getStorageKey: state.getStorageKey,
  }));

  const submit = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (isNil(inputRef?.current?.value)) {
      params.delete("search");
    } else {
      params.set("search", inputRef?.current?.value);
    }

    params.delete("searchIn");
    searchColumns.forEach((column) => {
      params.append("searchIn", column);
    });

    router.push(`${pathName}?${params.toString()}`);
    inputRef.current?.blur();
    if (isFeatureEnabled(Feature.POSTHOG)) {
      posthog.capture(`${getStorageKey()}_list_searched`, {
        searchParams: searchParams.toString(),
      });
    }
  };

  const handleKeyPress: KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e?.key === "Enter") {
      submit();
    }
  };

  const handleClearInput = () => {
    if (inputRef.current) {
      if (inputRef.current?.value !== "") {
        setInputValue("");
        inputRef.current.value = "";
        submit();
      }
    }
  };

  return (
    <div className="flex flex-col flex-1 relative">
      <div className={cn("flex items-center gap-x-1 border px-2 h-7 rounded-md bg-secondary", className)}>
        <Search size={16} className="text-secondary-foreground" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          className="focus-visible:ring-0 border-none max-h-8 px-1 text-xs placeholder:text-xs bg-transparent"
          type="text"
          placeholder={placeholder}
          onKeyDown={handleKeyPress}
          ref={inputRef}
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
