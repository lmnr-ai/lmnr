import { isNil } from "lodash";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { KeyboardEventHandler, memo, useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
}
const SearchInput = ({ onSearch, placeholder, className }: SearchInputProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathName = usePathname();

  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(searchParams.get("search") ?? "");

  const submit = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (isNil(inputRef?.current?.value) || inputRef?.current?.value.trim() === "") {
      params.delete("search");
    } else {
      params.set("search", inputRef?.current?.value.trim());
    }

    params.set("pageNumber", "0");

    router.push(`${pathName}?${params.toString()}`);
    inputRef.current?.blur();
    if (onSearch) {
      onSearch(params.toString());
    }
  }, [onSearch, pathName, router, searchParams]);

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
      <div className={cn("flex items-center gap-x-1 border px-2 h-7 rounded-md bg-secondary w-full", className)}>
        <Search size={16} className="text-secondary-foreground" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          className="focus-visible:ring-0 border-none max-h-8 px-1 text-xs placeholder:text-xs bg-transparent"
          type="text"
          placeholder={placeholder}
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

export default memo(SearchInput);
