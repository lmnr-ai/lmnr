import { TooltipPortal } from "@radix-ui/react-tooltip";
import { find, get, head, isEmpty, isEqual, map } from "lodash";
import { ListFilter, X } from "lucide-react";
import { memo, PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  ColumnFilter,
  DatatableFilter,
  dataTypeOperationsMap,
  JSON_OPERATIONS,
  NUMBER_OPERATIONS,
  Operator,
  STRING_OPERATIONS,
} from "@/components/ui/infinite-datatable/ui/datatable-filter/utils.ts";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

interface FilterUIProps {
  columns: ColumnFilter[];
  presetFilters?: DatatableFilter[];
  className?: string;
  onAddFilter: (filter: DatatableFilter) => void;
  filters: DatatableFilter[];
}

const FilterPopover = ({
  columns,
  presetFilters,
  className,
  onAddFilter,
  filters,
  children,
}: PropsWithChildren<FilterUIProps>) => {
  const [filter, setFilter] = useState<DatatableFilter>({ operator: Operator.Eq, column: "", value: "" });

  const handleApplyFilters = useCallback(
    (filter: DatatableFilter) => {
      if (!filters.some((f) => isEqual(f, filter))) {
        onAddFilter(filter);
      }
    },
    [filters, onAddFilter]
  );

  const handleValueChange = useCallback(({ field, value }: { field: keyof DatatableFilter; value: string }) => {
    if (field === "column") {
      setFilter((prev) => ({
        ...prev,
        value: "",
        operator: Operator.Eq,
        [field]: value,
      }));
    } else {
      setFilter((prev) => ({
        ...prev,
        [field]: value,
      }));
    }
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
        {children || (
          <Button variant="outline">
            <ListFilter size={14} className="mr-2" />
            Add filter
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="z-30 p-0 w-96" side="bottom" align="start">
        {!isEmpty(presetFilters) && (
          <>
            <div className="p-3 border-b bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground mb-2">Quick filters</p>
              <div className="flex flex-wrap gap-2">
                {map(presetFilters, (presetFilter, index) => {
                  const isApplied = filters.some((f) => isEqual(f, presetFilter));
                  const column = find(columns, ["key", presetFilter.column]);
                  const operatorLabel = get(
                    find(
                      [...STRING_OPERATIONS, ...NUMBER_OPERATIONS, ...JSON_OPERATIONS],
                      ["key", presetFilter.operator]
                    ),
                    "label",
                    presetFilter.operator
                  );

                  return (
                    <PopoverClose key={`preset-${index}`} asChild>
                      <Button
                        variant={isApplied ? "secondary" : "outline"}
                        size="sm"
                        className={cn(
                          "h-7 text-xs font-mono px-2 py-1",
                          isApplied && "bg-primary/10 border-primary text-primary cursor-default"
                        )}
                        onClick={() => handleApplyFilters(presetFilter)}
                        disabled={isApplied}
                      >
                        {column?.name || presetFilter.column} {operatorLabel} {presetFilter.value}
                      </Button>
                    </PopoverClose>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <div className="p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Custom filter</p>
          <div className="flex gap-2">
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
            <FilterInputs filter={filter} columns={columns} onValueChange={handleValueChange} />
          </div>
        </div>

        <div className="flex flex-row-reverse border-t p-2">
          <PopoverClose asChild>
            <Button
              disabled={!filter.column || !filter.value || !filter.operator}
              onClick={() => handleApplyFilters(filter)}
              variant="secondary"
              handleEnter
              className="ml-auto"
            >
              Add filter
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
};

interface FilterInputsProps {
  filter: DatatableFilter;
  columns: ColumnFilter[];
  onValueChange: ({ field, value }: { field: keyof DatatableFilter; value: string }) => void;
}

const FilterInputs = ({ filter, columns, onValueChange }: FilterInputsProps) => {
  const column = useMemo(() => find(columns, ["key", filter.column]), [columns, filter.column]);
  const dataType = column?.dataType || "string";

  const { currentKey, currentValue } = useMemo(() => {
    const equalIndex = filter.value.indexOf("=");
    if (equalIndex === -1) {
      return { currentKey: filter.value, currentValue: "" };
    }
    return {
      currentKey: filter.value.substring(0, equalIndex),
      currentValue: filter.value.substring(equalIndex + 1),
    };
  }, [filter.value]);

  const renderOperatorSelect = useCallback(
    () => (
      <Select value={filter.operator} onValueChange={(value) => onValueChange({ field: "operator", value })}>
        <SelectTrigger className="font-medium w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dataTypeOperationsMap[dataType].map(({ key, label }) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ),
    [dataType, filter.operator, onValueChange]
  );

  switch (column?.dataType) {
    case "json":
      return (
        <>
          <Input
            type="text"
            className="h-7 hide-arrow"
            placeholder="key"
            value={currentKey}
            onChange={(e) => {
              const newValue = `${e.target.value}=${currentValue}`;
              onValueChange({ field: "value", value: newValue });
            }}
          />
          <Input
            type="text"
            className="h-7 hide-arrow"
            placeholder="value"
            value={currentValue}
            onChange={(e) => {
              const newValue = `${currentKey}=${e.target.value}`;
              onValueChange({ field: "value", value: newValue });
            }}
          />
        </>
      );

    case "enum":
      return (
        <>
          {renderOperatorSelect()}
          <Select value={filter.value} onValueChange={(value) => onValueChange({ field: "value", value })}>
            <SelectTrigger className="font-medium flex-1">
              <SelectValue placeholder="Select option..." />
            </SelectTrigger>
            <SelectContent>
              {column &&
                column.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon && option.icon}
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </>
      );

    case "number":
      return (
        <>
          {renderOperatorSelect()}
          <Input
            type="number"
            className="h-7 hide-arrow"
            placeholder="value"
            value={filter.value}
            onChange={(e) => onValueChange({ field: "value", value: e.target.value })}
          />
        </>
      );

    default:
      return (
        <>
          {renderOperatorSelect()}
          <Input
            type="text"
            className="h-7 hide-arrow"
            placeholder="value"
            value={filter.value}
            onChange={(e) => onValueChange({ field: "value", value: e.target.value })}
          />
        </>
      );
  }
};

const PureFilterList = ({
  filters,
  onRemoveFilter,
  className,
}: {
  filters: DatatableFilter[];
  onRemoveFilter: (filter: DatatableFilter) => void;
  className?: string;
}) => {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {filters.map((f, index) => (
        <Tooltip key={`${index}-${f.column}-${f.value}-${f.operator}`}>
          <TooltipTrigger asChild>
            <Badge
              className={cn("flex gap-2 border-primary bg-primary/10 py-1 px-2 min-w-8", className)}
              variant="outline"
            >
              <ListFilter className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary truncate font-mono">
                {f.column}{" "}
                {get(
                  find([...STRING_OPERATIONS, ...NUMBER_OPERATIONS, ...JSON_OPERATIONS], ["key", f.operator]),
                  "label",
                  f.operator
                )}{" "}
                {f.value}
              </span>
              <Button onClick={() => onRemoveFilter(f)} className="p-0 h-fit group" variant="ghost">
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

export const FilterList = memo(PureFilterList);
export default memo(FilterPopover);
