import { debounce } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";

import { Button } from "@/components/ui/button.tsx";
import { useDataTableStore } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";

interface DataTableSearchProps {
  className?: string;
  placeholder?: string;
}

export const DataTableSearch = ({ className, placeholder = "Search in table..." }: DataTableSearchProps) => {
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

  const submit = useCallback(
    (searchValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const currentSearch = searchParams.get("search") ?? "";

      if (searchValue !== currentSearch) {
        if (!searchValue) {
          params.delete("search");
        } else {
          params.set("search", searchValue);
        }

        router.push(`${pathName}?${params.toString()}`);

        if (isFeatureEnabled(Feature.POSTHOG_IDENTIFY)) {
          posthog.capture(`${getStorageKey()}_list_searched`, {
            searchParams: params.toString(),
          });
        }
      }
    },
    [searchParams, pathName, router, posthog, getStorageKey]
  );

  const debouncedSubmit = useMemo(() => debounce(submit, 300), [submit]);

  const handleClearInput = () => {
    setInputValue("");
    debouncedSubmit.cancel();
  };

  useEffect(() => {
    debouncedSubmit(inputValue);

    return () => {
      debouncedSubmit.cancel();
    };
  }, [inputValue, debouncedSubmit]);

  return (
    <div className="flex flex-col flex-1 relative">
      <div
        className={cn(
          "flex items-center gap-x-1 border px-2 h-7 rounded-md bg-secondary focus-within:ring-border/50 focus-within:ring-[2px] box-border",
          className
        )}
      >
        <Search className="text-secondary-foreground size-3.5" />
        <Input
          value={inputValue}
          className="focus-visible:ring-0 border-none max-h-8 px-1 text-xs placeholder:text-xs bg-transparent"
          type="text"
          placeholder={placeholder}
          ref={inputRef}
          onChange={(e) => setInputValue(e.target.value)}
        />
        {inputValue && (
          <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
            <X className="text-secondary-foreground size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
