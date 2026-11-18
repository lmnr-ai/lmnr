import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "none";

interface CompareSelectProps {
  version: number;
  versions: number[];
  value: number | null;
  onChange: (version: number | null) => void;
}

/** Picks the version to diff the shown one against. */
export default function CompareSelect({ version, versions, value, onChange }: CompareSelectProps) {
  const others = versions.filter((v) => v !== version);
  return (
    <Select
      value={value === null ? NONE : String(value)}
      onValueChange={(next) => onChange(next === NONE ? null : Number(next))}
      disabled={others.length === 0}
    >
      <SelectTrigger className="h-7 w-44 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Compare with…</SelectItem>
        {others.map((v) => (
          <SelectItem key={v} value={String(v)}>
            Compare with v{v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
