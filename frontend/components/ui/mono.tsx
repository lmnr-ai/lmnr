import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

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
