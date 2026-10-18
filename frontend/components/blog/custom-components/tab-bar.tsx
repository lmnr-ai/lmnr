import { cn } from "@/lib/utils";

export interface TabBarItem {
  label: string;
}

interface TabBarProps {
  items: TabBarItem[];
  active: number;
  onSelect: (index: number) => void;
}

export default function TabBar({ items, active, onSelect }: TabBarProps) {
  // Inset shadow, not border-b: the tab underlines paint over it without overflowing the scroll box.
  return (
    <div className="flex overflow-x-auto shadow-[inset_0_-1px_0_rgb(255_255_255/0.1)]">
      {items.map((item, i) => (
        <button
          key={item.label}
          onClick={() => onSelect(i)}
          className={cn(
            "shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            i === active ? "border-primary text-white" : "border-transparent text-secondary-foreground hover:text-white"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
