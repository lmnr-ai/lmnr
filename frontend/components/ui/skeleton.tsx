import { cn } from '@/lib/utils';

// Tints relative to the surface it sits on via --surface-raise (published by every surface,
// with a :root fallback), so a skeleton inside an elevated panel/dialog reads correctly
// instead of showing a fixed gray that can vanish against a lighter substrate.
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-[var(--surface-raise)]', className)}
      {...props}
    />
  );
}

export { Skeleton };
