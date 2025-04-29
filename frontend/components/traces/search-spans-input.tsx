import { ChevronLeft, Search, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import React, { KeyboardEventHandler, memo, PropsWithChildren, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

const SearchSpansInput = ({
  submit,
  className,
  filterBoxClassName,
  setSearchEnabled,
}: PropsWithChildren<{
  submit: (search: string, searchIn: string[]) => Promise<void>;
  className?: string;
  filterBoxClassName?: string;
  setSearchEnabled: (v: boolean) => void;
}>) => {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();

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

  const handleSubmit = useCallback(() => {
    if (inputRef.current) {
      submit(inputRef?.current?.value, value === "all" ? ["input", "output"] : [value]);
    }
    inputRef?.current?.blur();
  }, [submit, value]);

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
      }
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 top-0 sticky bg-background z-50 box-border">
      <div
        className={cn(
          "flex items-center gap-x-1 border px-2 rounded-md text-secondary-foreground min-w-[18px] py-[3.5px] box-border",
          { "ring-1": open },
          className
        )}
      >
        <Button
          onClick={() => {
            setSearchEnabled(false);
            handleClearInput();
            handleSubmit();
          }}
          variant="ghost"
          className="h-4 w-4 mr-2"
          size="icon"
        >
          <ChevronLeft className="text-secondary-foreground min-w-[18px]" size={18} />
        </Button>
        <Search size={18} className="text-secondary-foreground min-w-[18px]" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
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
            "absolute z-50 top-10 bg-background flex flex-col gap-2 w-full rounded transition-all duration-100 ease-linear p-4 border",
            filterBoxClassName
          )}
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-secondary-foreground text-xs mb-2">Search in</span>
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
