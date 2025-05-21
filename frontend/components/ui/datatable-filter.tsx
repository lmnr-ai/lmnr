import { TooltipPortal } from "@radix-ui/react-tooltip";
import { find, get, head, isEqual } from "lodash";
import { ListFilter, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DatatableFilter } from "@/lib/types";

import { Button } from "./button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";

export interface ColumnFilter {
  name: string;
  key: string;
  dataType: "string" | "number" | "json";
}

interface DataTableFilterProps {
  columns: ColumnFilter[];
  className?: string;
}

const STRING_OPERATIONS = [
  {
    key: "eq",
    label: "=",
  },
  { key: "ne", label: "!=" },
];

const NUMBER_OPERATIONS = [
  { key: "eq", label: "=" },
  { key: "lt", label: "<" },
  { key: "gt", label: ">" },
  { key: "lte", label: "<=" },
  { key: "gte", label: ">=" },
  { key: "ne", label: "!=" },
];

const JSON_OPERATIONS = [{ key: "eq", label: "=" }];

const dataTypeOperationsMap: Record<ColumnFilter["dataType"], { key: string; label: string }[]> = {
  string: STRING_OPERATIONS,
  number: NUMBER_OPERATIONS,
  json: JSON_OPERATIONS,
};

export default function DataTableFilter({ columns, className }: DataTableFilterProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<DatatableFilter>({ operator: "", column: "", value: "" });

  const handleApplyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.append("filter", JSON.stringify(filter));
    params.delete("pageNumber");
    params.append("pageNumber", "0");
    router.push(`${pathName}?${params.toString()}`);
  }, [filter, pathName, router, searchParams]);

  const handleValueChange = useCallback(({ field, value }: { field: keyof DatatableFilter; value: string }) => {
    setFilter((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  useEffect(() => {
    const firstColumn = head(columns);

    if (firstColumn) {
      const { key: column, dataType } = firstColumn;

      if (dataType && dataTypeOperationsMap[dataType]?.length) {
        const operator = dataTypeOperationsMap[dataType][0].key;

        setFilter({
          operator,
          column,
          value: "",
        });
      }
    }
  }, [columns]);

  return (
    <Popover>
      <PopoverTrigger asChild className={className}>
        <Button variant="outline" className="text-secondary-foreground h-7 text-xs font-medium">
          <ListFilter size={14} className="mr-2" />
          Add filter
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-30 p-0 w-96" side="bottom" align="start">
        <div className="flex gap-2 p-2">
          <Select value={filter.column} onValueChange={(value) => handleValueChange({ field: "column", value })}>
            <SelectTrigger className="flex truncate font-medium max-w-32">
              <SelectValue placeholder="Choose column..." />
            </SelectTrigger>
            <SelectContent>
              {columns.map((column) => (
                <SelectItem key={column.key} value={column.key}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filter.operator} onValueChange={(value) => handleValueChange({ field: "operator", value })}>
            <SelectTrigger className="font-medium w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dataTypeOperationsMap[get(find(columns, ["key", filter.column]), "dataType", "string")].map(
                ({ key, label }) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          <Input
            type={columns.find((c) => c.key === filter.column)?.dataType === "number" ? "number" : "text"}
            className="h-7 hide-arrow"
            placeholder="value"
            onChange={(e) => handleValueChange({ field: "value", value: e.target.value })}
          />
        </div>
        <div className="flex flex-row-reverse border-t p-2">
          <PopoverClose asChild>
            <Button onClick={handleApplyFilters} variant="secondary" handleEnter className="ml-auto">
              Add filter
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const DataTableFilterList = () => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => searchParams.getAll("filter").map((f) => JSON.parse(f) as DatatableFilter),
    [searchParams]
  );

  const handleRemoveFilter = useCallback(
    (filter: DatatableFilter) => {
      const params = new URLSearchParams(searchParams);
      const newFilters = filters.filter((f) => !isEqual(f, filter));
      params.delete("filter");
      newFilters.forEach((f) => {
        params.append(`filter`, JSON.stringify(f));
      });
      router.push(`${pathName}?${params.toString()}`);
    },
    [filters, pathName, router, searchParams]
  );

  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map((f) => (
        <Tooltip key={`${f.column}-${f.value}-${f.operator}`}>
          <TooltipTrigger asChild>
            <Badge className="flex gap-2 border-primary py-1 px-2" variant="outline">
              <ListFilter className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary truncate">
                {f.column}{" "}
                {get(
                  find([...STRING_OPERATIONS, ...NUMBER_OPERATIONS, ...JSON_OPERATIONS], ["key", f.operator]),
                  "label",
                  f.operator
                )}{" "}
                {f.value}
              </span>
              <Button onClick={() => handleRemoveFilter(f)} className="p-0 h-fit group" variant="ghost">
                <X className="w-3 h-3 text-primary/70 group-hover:text-primary" />
              </Button>
            </Badge>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>
              {f.column}{" "}
              {get(
                find([...STRING_OPERATIONS, ...NUMBER_OPERATIONS, ...JSON_OPERATIONS], ["key", f.operator]),
                "label",
                f.operator
              )}{" "}
              {f.value}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ))}
    </div>
  );
};
