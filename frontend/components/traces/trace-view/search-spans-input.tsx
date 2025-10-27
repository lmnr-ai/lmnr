import { Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { KeyboardEventHandler, memo, PropsWithChildren, useCallback, useRef, useState } from "react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button";
import { useFiltersContextProvider } from "@/components/ui/datatable-filter/context.tsx";
import { DatatableFilter } from "@/components/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const SearchSpansInput = ({
  submit,
  className,
  filterBoxClassName,
}: PropsWithChildren<{
  submit: (search: string, searchIn: string[], filters: DatatableFilter[]) => Promise<void>;
  className?: string;
  filterBoxClassName?: string;
}>) => {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const searchInQuery = searchParams.getAll("searchIn");
  const [searchIn, setSearchIn] = useState<string>(searchInQuery?.length === 1 ? searchInQuery?.[0] : "all");
  const { value: filters } = useFiltersContextProvider();

  const { value, onChange } = useTraceViewStoreContext((state) => ({
    value: state.search,
    onChange: state.setSearch,
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  const handleWindow = useCallback(
    (open: boolean) => () => {
      setOpen(open);
    },
    []
  );

  const handleSubmit = useCallback(() => {
    submit(value, searchIn === "all" ? ["input", "output"] : [value], filters);
    inputRef?.current?.blur();
  }, [filters, searchIn, submit, value]);

  const handleKeyPress: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e?.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleClearInput = useCallback(() => {
    onChange("");
    submit("", ["input", "output"], []);
  }, [onChange, submit]);

  return (
    <div className="flex flex-col top-0 sticky bg-background z-40 box-border">
      <div
        className={cn(
          "flex items-center gap-x-1 border px-2 rounded-md text-secondary-foreground min-w-[18px] py-[3.5px] box-border",
          { "ring-1": open },
          className
        )}
      >
        <Search size={18} className="text-secondary-foreground min-w-[18px]" />
        <Input
          className="focus-visible:ring-0 border-none max-h-8 px-1 bg-transparent"
          type="text"
          placeholder="Search"
          value={value}
          onKeyDown={handleKeyPress}
          ref={inputRef}
          onBlur={handleWindow(false)}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleWindow(true)}
        />
        {value && (
          <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
            <X size={18} className="text-secondary-foreground min-w-[18px]" />
          </Button>
        )}
      </div>
      {open && (
        <div
          className={cn(
            "absolute z-40 top-10 bg-secondary flex flex-col gap-2 flex-1 mx-2 w-[calc(100%-16px)] rounded transition-all duration-100 ease-linear p-2 border border-t-0 rounded-t-none",
            filterBoxClassName
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-secondary-foreground text-xs">Search in</span>
          <RadioGroup value={searchIn} onValueChange={setSearchIn} defaultValue="all">
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
      )}
    </div>
  );
};

export default memo(SearchSpansInput);
