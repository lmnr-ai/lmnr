"use client";

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteProps {
  isSelected: boolean;
  isHeader?: boolean;
  onToggleFavorite: () => void;
  className?: string;
}

const Favorite = React.forwardRef<
  React.ElementRef<'div'>,
  FavoriteProps
>(({ isSelected, onToggleFavorite, className, isHeader, ...props }, ref) => {
  const [isFavorite, setIsFavorite] = React.useState(false);

  const handleToggle = () => {
    if (!isHeader) {
      setIsFavorite((prev) => !prev);
      onToggleFavorite();
    }
  };

  return (
    <div
      ref={ref}
      className={cn(
        'h-4 w-4 bg-secondary/30 flex items-center justify-center cursor-pointer',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        handleToggle();
      }}
      {...props}
    >
      <Star
        size={18}
        strokeWidth={1.5}
        fill={isFavorite ? '#FACC15' : 'none'}
        stroke={isFavorite ? '#FACC15' : 'currentColor'}
        className={isFavorite ? 'text-secondary' : 'text-gray-400'}
      />
    </div>
  );
});

Favorite.displayName = 'Favorite';

export { Favorite };


