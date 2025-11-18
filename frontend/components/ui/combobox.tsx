"use client";
import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import { FC } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

interface ComboboxProps {
  className?: string;
  triggerClassName?: string;
  placeholder: string;
  noMatchText?: string;
  items: { value: string; label: string }[];
  value: string | null;
  setValue: (value: string | null) => void;
}

export const Combobox: FC<ComboboxProps> = ({
  className,
  triggerClassName,
  placeholder,
  noMatchText,
  items,
  value,
  setValue,
}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", triggerClassName)}
        >
          {value ? items.find((item) => item.value === value)?.label : placeholder}
          <ChevronsUpDown className="opacity-50 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0 ", className)}>
        <Command>
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList>
            <CommandEmpty className="p-2 text-center text-secondary-foreground text-sm">
              {noMatchText || "No matches found."}
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  {item.label}
                  <Check className={cn("ml-auto", value === item.value ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
