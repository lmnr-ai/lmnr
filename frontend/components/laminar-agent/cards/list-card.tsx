"use client";

interface ListCardProps {
  title: string | null;
  items: string[];
  numbered: boolean;
}

export default function ListCard({ props }: { props: ListCardProps }) {
  const { title, items, numbered } = props;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {title && (
        <div className="px-4 py-2.5 border-b">
          <span className="font-medium text-sm">{title}</span>
        </div>
      )}
      <div className="px-4 py-3">
        {numbered ? (
          <ol className="list-decimal list-inside space-y-1.5 text-sm">
            {items.map((item, i) => (
              <li key={i} className="text-foreground">
                {item}
              </li>
            ))}
          </ol>
        ) : (
          <ul className="list-disc list-inside space-y-1.5 text-sm">
            {items.map((item, i) => (
              <li key={i} className="text-foreground">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
