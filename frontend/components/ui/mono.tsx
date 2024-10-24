import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export default function Mono({
  className,
  children
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn('font-mono text-xs', className)}>
      {children}
    </span>
  );
}
