export default function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex flex-col gap-0.5" title={title}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
