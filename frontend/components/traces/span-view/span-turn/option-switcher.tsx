import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const readStoredOption = <T extends string>(storageKey: string, options: { value: T }[], fallback: T): T => {
  try {
    const stored = localStorage.getItem(storageKey);
    return options.find((o) => o.value === stored)?.value ?? fallback;
  } catch {
    return fallback;
  }
};

interface OptionSwitcherProps<T extends string> {
  label: string;
  storageKey: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** Temporary: lets us compare Messages variants on real traces before picking one. */
const OptionSwitcher = <T extends string>({ label, storageKey, options, value, onChange }: OptionSwitcherProps<T>) => {
  const handleChange = (next: string) => {
    onChange(next as T);
    try {
      localStorage.setItem(storageKey, next);
    } catch {}
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Tabs value={value} onValueChange={handleChange} className="gap-0">
        <TabsList size="sm">
          {options.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
};

export default OptionSwitcher;
