import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Popover, PopoverTrigger } from "./popover";
import { Button } from "./button";
import { PopoverContent } from "@radix-ui/react-popover";
import { ColumnDef } from "@tanstack/react-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { Input } from "./input";
import { useEffect, useState } from "react";
import { Filter, ListFilter, X } from "lucide-react";
import { DatatableFilter } from "@/lib/types";
import { Label } from "./label";
import { cn, getFilterFromUrlParams } from "@/lib/utils";

interface DataTableFilterProps<TData> {
  columns: ColumnDef<TData>[];
  className?: string;
}

const toFilterUrlParam = (filters: DatatableFilter[]): string => {
  return JSON.stringify(filters);
}

const SELECT_OPERATORS = [
  { key: 'eq', label: '=' },
  { key: 'lt', label: '<' },
  { key: 'gt', label: '>' },
  { key: 'lte', label: '<=' },
  { key: 'gte', label: '>=' },
  { key: 'ne', label: '!=' },
]

const JSONB_OPERATORS = [
  { key: 'eq', label: '=' },
];

const getEventNameValue = (value: string) => {
  try {
    return JSON.parse(value)[0]['templateName'];
  } catch (e) {
    return '';
  }
};

export default function DataTableFilter<TData>({ columns, className }: DataTableFilterProps<TData>) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const queryParamFilters = searchParams.get('filter');

  const [filters, setFilters] = useState<DatatableFilter[]>(queryParamFilters ? (getFilterFromUrlParams(queryParamFilters) ?? []) : []);
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);

  const filterTableRow = (filter: DatatableFilter, i: number) => {
    return (
      <tr key={i}>
        <td>
          <Select
            defaultValue={filter?.column ?? columns[i].id!}
            onValueChange={value => {
              const newFilters = [...filters];
              newFilters[i].column = value;
              setFilters(newFilters);
            }}
          >
            <SelectTrigger className="mx-2 h-8 w-40 font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {
                columns.map((column, colIdx) =>
                  <SelectItem key={colIdx} value={column.id!}>
                    {column.header?.toString()}
                  </SelectItem>
                )
              }
            </SelectContent>
          </Select>
        </td>
        <td className="max-w-24">
          {filter.column?.startsWith('jsonb::events')
            ? <Select
              defaultValue={filter?.operator ?? "eq"}
              onValueChange={value => {
                const newFilters = [...filters];
                newFilters[i].operator = "eq";
                setFilters(newFilters);
              }}
            >
              <SelectTrigger className="h-8 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem key="1" value={"eq"}>
                  {"includes"}
                </SelectItem>
              </SelectContent>
            </Select>
            : <Select
              defaultValue={filter?.operator ?? "eq"}
              onValueChange={value => {
                const newFilters = [...filters];
                newFilters[i].operator = value;
                setFilters(newFilters);
              }}
            >
              <SelectTrigger className="h-8 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(filter?.column?.startsWith('jsonb::') ? JSONB_OPERATORS : SELECT_OPERATORS).map(operator => (
                  <SelectItem key={operator.key} value={operator.key}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        </td>
        <td className="p-2">
          {filter.column?.startsWith('jsonb::events')
            ? <Input
              defaultValue={filter?.value ? getEventNameValue(filter.value) : ''}
              className='h-8'
              placeholder="value..."
              onChange={e => {
                const newFilters = [...filters];
                newFilters[i].value = e.target.value?.length > 0 ? `[{"templateName":"${e.target.value}"}]` : undefined;
                setFilters(newFilters);
              }}
            />
            : <Input
              defaultValue={filter?.value ?? ''}
              className='h-8'
              placeholder="value..."
              onChange={e => {
                const newFilters = [...filters];
                newFilters[i].value = e.target.value?.length > 0 ? e.target.value : undefined;
                setFilters(newFilters);
              }}
            />
          }
        </td>
        <td>
          <Button
            variant={'ghost'}
            onClick={() => {
              const newFilters = [...filters];
              newFilters.splice(i, 1);
              setFilters(newFilters);
            }}
          >
            <X size={16} />
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen} key={useSearchParams().toString()}>
      <PopoverTrigger asChild className={className}>
        <Button
          variant={filters.length > 0 ? "secondary" : "outline"}
          className='text-secondary-foreground h-8'
        >
          <ListFilter size={16} className="mr-2" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-30">
        <div className="p-2 mt-1 md:min-w-[500px] sm:min-w-[200px] bg-background border rounded">
          {filters.length > 0 ? (
            <table key={filters.length.toString()}>
              <tbody>
                {filters.map((filter, i) => (
                  filterTableRow(filter, i)
                ))}
              </tbody>
            </table>) :
            (
              <div className="p-2">
                <Label className="text-sm text-secondary-foreground">No filters applied</Label>
              </div>
            )}
          <div className="flex flex-row justify-between m-2">
            <Button
              variant="secondary"
              className="mx-2"
              onClick={() => {
                setFilters(filters => {
                  return [...filters, { column: "", operator: 'eq', value: '' }]
                });
              }}
            >
              Add Filter
            </Button>
            <Button
              className="mx-2"
              disabled={
                filters.some(filter => filter.column === undefined || filter.operator === undefined || filter.value === undefined)
              }
              onClick={() => {
                searchParams.delete('filter');
                searchParams.delete('pageNumber')
                searchParams.append('pageNumber', '0');
                searchParams.append('filter', toFilterUrlParam(filters));
                setPopoverOpen(false);
                router.push(`${pathName}?${searchParams.toString()}`);
              }}
              handleEnter
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
