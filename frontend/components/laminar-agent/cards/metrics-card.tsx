"use client";

interface MetricsCardProps {
  title: string | null;
  metrics: Array<{ label: string; value: string }>;
}

export default function MetricsCard({ props }: { props: MetricsCardProps }) {
  const { title, metrics } = props;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      {title && (
        <div className="px-4 py-2.5 border-b">
          <span className="font-medium text-sm">{title}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 p-4">
        {metrics.map((metric, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{metric.label}</span>
            <span className="text-sm font-medium">{metric.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
