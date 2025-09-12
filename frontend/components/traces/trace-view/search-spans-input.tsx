import { ChevronLeft, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { KeyboardEventHandler, memo, PropsWithChildren, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DatatableFilter } from "@/components/ui/datatable-filter/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const SearchSpansInput = ({
  submit,
  className,
  filterBoxClassName,
  defaultValue,
  setSearchSpans,
}: PropsWithChildren<{
  submit: (search: string, searchIn: string[], filters: DatatableFilter[]) => Promise<void>;
  defaultValue?: string;
  className?: string;
  filterBoxClassName?: string;
  setSearchSpans: (v: string) => void;
}>) => {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

  const searchIn = searchParams.getAll("searchIn");
  const inputRef = useRef<HTMLInputElement>(null);

  const initialSearchValue = searchParams.get("search") ?? "";
  const initialSearchInValue = searchIn?.length === 1 ? searchIn?.[0] : "all";

  const [inputValue, setInputValue] = useState(initialSearchValue);
  const [value, setValue] = useState<string>(initialSearchInValue);

  const handleWindow = useCallback(
    (open: boolean) => () => {
      setOpen(open);
    },
    []
  );

  const handleSubmit = useCallback(() => {
    if (inputRef.current) {
      const searchValue = inputRef.current.value;
      submit(searchValue, value === "all" ? ["input", "output"] : [value], []);
      setSearchSpans(searchValue);
    }
    inputRef?.current?.blur();
  }, [submit, value, setSearchSpans]);

  const handleBlur = useCallback(() => {
    handleSubmit();
    handleWindow(false)();
  }, [handleWindow, handleSubmit]);

  const handleKeyPress: KeyboardEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      if (e?.key === "Enter") {
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleClearInput = useCallback(() => {
    if (inputRef.current) {
      if (inputRef.current?.value !== "") {
        inputRef.current.value = "";
        setInputValue("");
        setSearchSpans("");
      }
    }
  }, [setSearchSpans]);

  const handleCloseSearch = useCallback(() => {
    setSearchSpans("");
    handleClearInput();
    handleSubmit();
  }, [handleClearInput, handleSubmit, setSearchSpans]);

  return (
    <div className="flex flex-col top-0 sticky bg-background z-30 box-border">
      <div
        className={cn(
          "flex items-center gap-x-1 border px-2 rounded-md text-secondary-foreground min-w-[18px] py-[3.5px] box-border",
          { "ring-1": open },
          className
        )}
      >
        <Button onClick={handleCloseSearch} variant="ghost" className="h-4 w-4 mr-2" size="icon">
          <ChevronLeft className="text-secondary-foreground min-w-[18px]" size={18} />
        </Button>
        <Search size={18} className="text-secondary-foreground min-w-[18px]" />
        <Input
          defaultValue={defaultValue}
          className="focus-visible:ring-0 border-none max-h-8 px-1"
          type="text"
          placeholder="Search"
          onKeyDown={handleKeyPress}
          ref={inputRef}
          onBlur={handleBlur}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={handleWindow(true)}
        />
        {inputValue && (
          <Button onClick={handleClearInput} variant="ghost" className="h-4 w-4" size="icon">
            <X size={18} className="text-secondary-foreground min-w-[18px]" />
          </Button>
        )}
      </div>
      {open && (
        <div
          className={cn(
            "absolute z-50 top-10 bg-background flex flex-col gap-2 flex-1 mx-2 w-[calc(100%_-_16px)] rounded transition-all duration-100 ease-linear p-2 border border-t-0 rounded-t-none",
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
      )}
    </div>
  );
};

export default memo(SearchSpansInput);
