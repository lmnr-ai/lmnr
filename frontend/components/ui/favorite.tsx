'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteProps {
  isSelected: boolean;
  onToggle: () => void;
  className?: string;
}

const Favorite = React.forwardRef<
  React.ElementRef<'div'>,
  FavoriteProps
>(({ isSelected, onToggle, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'h-4 w-4 bg-secondary/30 flex items-center justify-center cursor-pointer',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      {...props}
    >
      <Star
        size={18}
        strokeWidth={1.5}
        fill={isSelected ? '#FACC15' : 'none'}
        stroke={isSelected ? '#FACC15' : 'currentColor'}
        className={isSelected ? 'text-secondary' : 'text-gray-400'}
      />
    </div>
  );
});

Favorite.displayName = 'Favorite';

export { Favorite };






