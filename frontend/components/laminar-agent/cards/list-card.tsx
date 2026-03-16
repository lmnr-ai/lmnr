"use client";

interface ListCardProps {
  title: string | null;
  items: (string | Record<string, unknown>)[];
  numbered: boolean;
}

/** Safely convert an item to a displayable string. The LLM sometimes sends
 *  objects like {title, description} instead of plain strings. */
function itemToString(item: string | Record<string, unknown>): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    // Try common keys the LLM might use
    const label = item.title ?? item.name ?? item.label ?? item.value;
    const desc = item.description ?? item.detail;
    if (typeof label === "string" && typeof desc === "string") {
      return `${label} — ${desc}`;
    }
    if (typeof label === "string") return label;
    return JSON.stringify(item);
  }
  return String(item);
}

export default function ListCard({ props }: { props: ListCardProps }) {
  const { title, items, numbered } = props;
  const ListTag = numbered ? "ol" : "ul";

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {title && (
        <div className="px-4 py-2.5 border-b">
          <span className="font-medium text-sm">{title}</span>
        </div>
      )}
      <div className="px-4 py-3">
        <ListTag className={`${numbered ? "list-decimal" : "list-disc"} list-inside space-y-1.5 text-sm`}>
          {items.map((item, i) => (
            <li key={i} className="text-foreground">
              {itemToString(item)}
            </li>
          ))}
        </ListTag>
      </div>
    </div>
  );
}
