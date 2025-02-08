import { PopoverClose } from "@radix-ui/react-popover";
import { AlignJustify, List, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface DataTableSortsProps {
  columns: string[];
}

interface FilterField {
  field: string;
  asc: boolean;
}

const pluralize = (count: number, singular: string, plural: string) => {
  const pluralRules = new Intl.PluralRules("en-US");
  const grammaticalNumber = pluralRules.select(count);
  switch (grammaticalNumber) {
    case "one":
      return singular;
    default:
      return plural;
  }
};

const DataTableSorts = ({ columns }: DataTableSortsProps) => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  const sortParams = useMemo<FilterField[]>(
    () =>
      searchParams.getAll("sort").map((field) => {
        const parsed = field.split(":") as [string, string];

        return { field: parsed[0], asc: parsed[1] === "asc" };
      }),
    [searchParams]
  );

  const [fields, setFields] = useState<FilterField[]>(sortParams);

  const handleAsc = useCallback(
    (field: FilterField) => (checked: boolean) => {
      setFields((prev) => [...prev.filter((f) => f.field !== field.field), { ...field, asc: checked }]);
    },
    []
  );

  const handleRemove = useCallback((field: FilterField["field"]) => {
    setFields((prev) => prev.filter((v) => v.field !== field));
  }, []);

  const filteredFields = useMemo(
    () => columns.filter((column) => !fields.map(({ field }) => field).includes(column)),
    [columns, fields]
  );

  const handleApply = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("sort");

    const newParams = new URLSearchParams([
      ...params,
      ...fields.map((field) => ["sort", `${field.field}:${field.asc ? "asc" : "desc"}`]),
    ]);

    router.push(`${pathName}?${newParams}`);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("text-secondary-foreground", { "text-primary": sortParams?.length > 0 })}
        >
          <List size={16} className="mr-2" />
          {sortParams?.length > 0
            ? `Sorted by ${sortParams.length} ${pluralize(sortParams.length, "rule", "rules")}`
            : "Sort"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="z-30 p-0 w-[400px]" side="bottom" align="start">
        <div className={cn("flex flex-col gap-1 py-2 px-3", { "gap-2": fields?.length > 0 })}>
          {fields?.length > 0 ? (
            fields.map((field) => (
              <div key={field.field} className="flex items-center gap-3">
                <AlignJustify size={20} className="text-secondary-foreground mr-2" />
                <span className="flex grow gap-1 text-secondary-foreground">
                  sort by
                  <span className="text-primary-foreground">{field.field}</span>
                </span>

                <div className="flex gap-1 items-center">
                  <p className="text-secondary-foreground">ascending:</p>
                  <Switch onCheckedChange={handleAsc(field)} checked={field.asc} />
                </div>
                <Button onClick={() => handleRemove(field.field)} variant="ghost">
                  <X className="text-secondary-foreground" size={16} />
                </Button>
              </div>
            ))
          ) : (
            <>
              <h5 className="text-sm text-foreground">No sorts applied to this view</h5>
              <p className="text-xs text-secondary-foreground">Add a column below to sort the view</p>
            </>
          )}
        </div>
        <Separator />
        <div className="flex justify-between items-center py-2 px-3">
          {filteredFields?.length > 0 ? (
            <Select
              value=""
              onValueChange={(v) => {
                setFields((prev) => [...prev, { field: v, asc: false }]);
              }}
            >
              <SelectTrigger className="w-fit border-none">
                <SelectValue placeholder="Pick a column to sort by" />
              </SelectTrigger>
              <SelectContent>
                {filteredFields.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-secondary-foreground">All columns have been added</p>
          )}
          <PopoverClose asChild>
            <Button variant="secondary" onClick={handleApply}>
              Apply sorting
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DataTableSorts;
