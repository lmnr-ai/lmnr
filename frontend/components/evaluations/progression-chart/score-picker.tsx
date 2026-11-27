import { cn } from "@/lib/utils";

interface ScorePickerProps {
  scores: string[];
  selected: string;
  onSelect: (score: string) => void;
}

export default function ScorePicker({ scores, selected, onSelect }: ScorePickerProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {scores.map((score) => (
        <button
          key={score}
          type="button"
          title={score}
          onClick={() => onSelect(score)}
          className={cn(
            "h-6 max-w-48 truncate rounded-md border px-2 text-xs",
            score === selected
              ? "bg-background text-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {score}
        </button>
      ))}
    </div>
  );
}
