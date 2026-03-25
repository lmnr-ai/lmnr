interface HighlightedSnippetProps {
  snippet: string;
  highlight?: [number, number];
  className?: string;
}

export function HighlightedSnippet({ snippet, highlight, className }: HighlightedSnippetProps) {
  if (!highlight || highlight[0] >= highlight[1]) {
    return <span className={className}>{snippet}</span>;
  }

  const [start, end] = highlight;
  const chars = [...snippet];
  const before = chars.slice(0, start).join("");
  const match = chars.slice(start, end).join("");
  const after = chars.slice(end).join("");

  return (
    <span className={className}>
      {before}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">{match}</mark>
      {after}
    </span>
  );
}
