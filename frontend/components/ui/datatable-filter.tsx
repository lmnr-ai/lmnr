import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Popover, PopoverTrigger } from './popover';
import { Button } from './button';
import { PopoverContent } from '@radix-ui/react-popover';
import { ColumnDef } from '@tanstack/react-table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';
import { Input } from './input';
import { useEffect, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import { DatatableFilter } from '@/lib/types';
import { Label } from './label';
import { cn, getFilterFromUrlParams } from '@/lib/utils';

interface DataTableFilterProps<TData> {
  columns: ColumnDef<TData>[];
  customFilterColumns?: Record<string, string[]>; // from columnId to possible values
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

export default function DataTableFilter<TData>({
  columns,
  className,
  customFilterColumns
}: DataTableFilterProps<TData>) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const queryParamFilters = searchParams.get('filter');

  const [filters, setFilters] = useState<DatatableFilter[]>(
    queryParamFilters ? (getFilterFromUrlParams(queryParamFilters) ?? []) : []
  );
  const [popoverOpen, setPopoverOpen] = useState<boolean>(false);

  const isFilterFilled = (filter: DatatableFilter): boolean => {
    if (
      filter.column &&
      Object.keys(customFilterColumns ?? {}).includes(
        filter.column?.split('.')[0]
      )
    ) {
      return (
        filter.column.split('.')[1].length > 0 &&
        !!filter.operator &&
        filter.value != null
      );
    }
    return !!filter.column && !!filter.operator && filter.value != null;
  };

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      key={useSearchParams().toString()}
    >
      <PopoverTrigger asChild className={className}>
        <Button
          variant={filters.length > 0 ? 'secondary' : 'outline'}
          className="text-secondary-foreground h-8"
        >
          <ListFilter size={16} className="mr-2" />
          Filters
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-30">
        <div className="p-2 mt-1 md:min-w-[600px] sm:min-w-[200px] bg-background border rounded">
          {filters.length > 0 ? (
            <table key={filters.length.toString()}>
              <tbody>
                {filters.map((filter, i) => (
                  <DataTableFilterRow
                    i={i}
                    key={i}
                    columns={columns}
                    customFilterColumns={customFilterColumns}
                    filters={filters}
                    setFilters={setFilters}
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-2">
              <Label className="text-sm text-secondary-foreground">
                No filters applied
              </Label>
            </div>
          )}
          <div className="flex flex-row justify-between m-2">
            <Button
              variant="secondary"
              className="mx-2"
              onClick={() => {
                setFilters((filters) => [
                  ...filters,
                  { column: columns[0].id, operator: 'eq', value: undefined }
                ]);
              }}
            >
              Add Filter
            </Button>
            <Button
              className="mx-2"
              disabled={filters.some((filter) => !isFilterFilled(filter))}
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

interface RowProps<TData> {
  i: number;
  columns: ColumnDef<TData>[];
  customFilterColumns?: Record<string, string[]>; // from columnId to possible values
  filters: DatatableFilter[];
  setFilters: (filters: DatatableFilter[]) => void;
}

function DataTableFilterRow<TData>({
  i,
  columns,
  customFilterColumns,
  filters,
  setFilters
}: RowProps<TData>) {
  const filter = filters[i];
  const [additionalColumnId, setAdditionalColumnId] = useState<string | null>(
    Object.keys(customFilterColumns ?? {}).find(
      (n) => n === filter?.column?.split('.')[0]
    ) ?? null
  );
  return (
    <tr key={i} className="w-full">
      <td>
        <div className="flex space-x-1 w-80">
          <Select
            defaultValue={
              Object.keys(customFilterColumns ?? {}).some((n) =>
                filter?.column?.startsWith(n)
              )
                ? filter?.column?.split('.')[0]
                : (filter?.column ?? columns[i].id!)
            }
            onValueChange={(value) => {
              const newFilters = [...filters];
              if (Object.keys(customFilterColumns ?? {}).includes(value)) {
                newFilters[i].column = `${value}.`;
              } else {
                newFilters[i].column = value;
              }
              setAdditionalColumnId(
                Object.keys(customFilterColumns ?? {}).find(
                  (n) => n === value
                ) ?? null
              );
              setFilters(newFilters);
            }}
          >
            <SelectTrigger className="flex font-medium">
              <SelectValue placeholder="Choose column..." />
            </SelectTrigger>
            <SelectContent>
              {columns.map((column, colIdx) => (
                <SelectItem key={colIdx} value={column.id!}>
                  {column.header?.toString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {additionalColumnId != null && (
            <Select
              defaultValue={
                filter?.column?.replace(`${additionalColumnId}.`, '') ??
                undefined
              }
              onValueChange={(value) => {
                const newFilters = [...filters];
                newFilters[i].column = `${additionalColumnId}.${value}`;
                setFilters(newFilters);
              }}
            >
              <SelectTrigger className="flex">
                <SelectValue placeholder="Choose value..." />
              </SelectTrigger>
              <SelectContent>
                {customFilterColumns![additionalColumnId].map((value, idx) => (
                  <SelectItem key={idx} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
            {SELECT_OPERATORS.map((operator) => (
              <SelectItem key={operator.key} value={operator.key}>
                {operator.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Input
          defaultValue={filter?.value ?? ''}
          placeholder="value..."
          onChange={(e) => {
            const newFilters = [...filters];
            let value = e.target.value;
            if (value.length > 0) {
              try {
                value = JSON.parse(value);
              } catch (e) {
                // do nothing
              }
            }
            newFilters[i].value =
              e.target.value?.length > 0 ? value : undefined;
            setFilters(newFilters);
          }}
        />
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
  );
}
