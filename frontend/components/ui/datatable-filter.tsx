import { ListFilter, Plus, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { DatatableFilter } from '@/lib/types';
import { cn, getFilterFromUrlParams } from '@/lib/utils';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';

interface Filter {
  name: string;
  id: string;
  restrictOperators?: string[];
}

interface DataTableFilterProps {
  possibleFilters: Filter[];
  className?: string;
}

const toFilterUrlParam = (filters: DatatableFilter[]): string =>
  JSON.stringify(filters);

const SELECT_OPERATORS = [
  { key: 'eq', label: '=' },
  { key: 'lt', label: '<' },
  { key: 'gt', label: '>' },
  { key: 'lte', label: '<=' },
  { key: 'gte', label: '>=' },
  { key: 'ne', label: '!=' }
];

export default function DataTableFilter({
  possibleFilters,
  className,
}: DataTableFilterProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const queryParamFilters = searchParams.get('filter');

  const [filters, setFilters] = useState<DatatableFilter[]>(
    queryParamFilters ? (getFilterFromUrlParams(queryParamFilters) ?? []) : []
  );
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);

  const isFilterFilled = (filter: DatatableFilter): boolean => filter.value.length > 0;

  const hasFilters = queryParamFilters ? (getFilterFromUrlParams(queryParamFilters)?.length ?? 0) > 0 : false;

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      key={useSearchParams().toString()}
    >
      <PopoverTrigger asChild className={className}>
        <Button
          variant='outline'
          className={cn("text-secondary-foreground h-8", hasFilters ? 'text-primary bg-primary/20 border-primary/40 hover:bg-primary/30' : '')}
        >
          <ListFilter size={16} className="mr-2" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-30 p-0 w-[400px]" side="bottom" align="start">
        <div className="">
          <div className="p-2">
            {filters.length > 0 ? (
              <table key={filters.length.toString()} className="w-full">
                <tbody>
                  {filters.map((filter, i) => (
                    <DataTableFilterRow
                      i={i}
                      key={i}
                      filters={filters}
                      setFilters={setFilters}
                      possibleFilters={possibleFilters}
                    />
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-2">
                <Label className="text-sm text-secondary-foreground">
                  No filters applied
                </Label>
              </div>
            )}
          </div>
          <div className="flex flex-row justify-between p-2 border-t">
            <Button
              variant="ghost"
              onClick={() => {
                setFilters((filters) => [
                  ...filters,
                  { column: possibleFilters[0].id, operator: 'eq', value: "" }
                ]);
              }}
            >
              <Plus size={14} className="mr-1" />
              Add Filter
            </Button>
            <Button
              disabled={filters.some((filter) => !isFilterFilled(filter))}
              variant="secondary"
              onClick={() => {
                searchParams.delete('filter');
                searchParams.delete('pageNumber');
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
  );
}

interface RowProps {
  i: number;
  filters: DatatableFilter[];
  setFilters: (filters: DatatableFilter[]) => void;
  possibleFilters: Filter[];
}

function DataTableFilterRow({
  i,
  filters,
  setFilters,
  possibleFilters
}: RowProps) {
  const filter = filters[i];
  const [selectedFilter, setSelectedFilter] = useState<Filter|null>(null);
  const operators = (filter: Filter | null) => (filter?.restrictOperators != null)
    ? SELECT_OPERATORS.filter(op => filter.restrictOperators!.includes(op.key))
    : SELECT_OPERATORS;

  return (
    <tr key={i} className="w-full">
      <td>
        <div className="flex">
          <Select
            defaultValue={filter.column}
            onValueChange={(value) => {
              const newFilters = [...filters];
              newFilters[i].column = value;
              setSelectedFilter(possibleFilters.find(f => f.id === value) ?? null);
              setFilters(newFilters);
            }}
          >
            <SelectTrigger className="flex font-medium w-40">
              <SelectValue placeholder="Choose column..." />
            </SelectTrigger>
            <SelectContent>
              {possibleFilters.map((filter, colIdx) => (
                <SelectItem key={colIdx} value={filter.id}>
                  {filter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </td>
      <td className="px-2">
        <Select
          defaultValue={filter?.operator ?? 'eq'}
          onValueChange={(value) => {
            const newFilters = [...filters];
            newFilters[i].operator = value;
            setFilters(newFilters);
          }}
        >
          <SelectTrigger className="font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {operators(selectedFilter).map((operator) => (
              <SelectItem key={operator.key} value={operator.key}>
                {operator.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="">
        <Input
          className="h-7"
          defaultValue={filter?.value ?? ''}
          placeholder="value"
          onChange={(e) => {
            const newFilters = [...filters];
            newFilters[i].value = e.target.value ?? "";
            setFilters(newFilters);
          }}
        />
      </td>
      <td>
        <Button
          className="p-0 px-1 text-secondary-foreground"
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
  );
}
