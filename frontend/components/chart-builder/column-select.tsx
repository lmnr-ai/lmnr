import { type ColumnInfo } from "@/components/chart-builder/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Radix rejects an empty option value, so "no column" needs a sentinel a real column can't collide
// with (a result column CAN be named `none`).
const NO_COLUMN = "__none__";

interface ColumnSelectProps {
  label: string;
  columns: ColumnInfo[];
  value?: string;
  onChange: (columnName?: string) => void;
  /** Adds a leading "no column" option — used by the optional breakdown. */
  noneLabel?: string;
  placeholder?: string;
}

/** Labelled picker over the columns of the current result set. */
const ColumnSelect = ({
  label,
  columns,
  value,
  onChange,
  noneLabel,
  placeholder = "Select column",
}: ColumnSelectProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-muted-foreground">{label}</span>
    <Select
      value={value ?? (noneLabel ? NO_COLUMN : "")}
      onValueChange={(next) => onChange(next === NO_COLUMN ? undefined : next)}
      disabled={columns.length === 0}
    >
      <SelectTrigger aria-label={label} className="h-8 text-xs focus:ring-0">
        <SelectValue placeholder={columns.length === 0 ? "No eligible columns" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NO_COLUMN}>{noneLabel}</SelectItem>}
        {columns.map((column) => (
          <SelectItem key={column.name} value={column.name}>
            <span className="truncate">{column.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">{column.type}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
);

export default ColumnSelect;
