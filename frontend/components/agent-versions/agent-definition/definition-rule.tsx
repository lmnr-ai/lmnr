export default function DefinitionRule({ substrings }: { substrings: string[] }) {
  return (
    <li className="flex flex-col gap-1.5 px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{substrings.length === 1 ? "Contains" : "Contains all of"}</span>
      <div className="flex flex-col items-start gap-1">
        {substrings.map((substring, i) => (
          <code
            key={i}
            className="max-w-full rounded border bg-background px-1.5 py-0.5 font-mono text-xs whitespace-pre-wrap break-words text-secondary-foreground"
          >
            {substring}
          </code>
        ))}
      </div>
    </li>
  );
}
