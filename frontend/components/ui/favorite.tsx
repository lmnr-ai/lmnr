/*
'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FavoriteProps
  extends React.ComponentPropsWithoutRef<'div'> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Favorite = React.forwardRef<
  React.ElementRef<'div'>,
  FavoriteProps
>(({ className, checked = false, onCheckedChange, ...props }, ref) => {
  const handleClick = () => {
    onCheckedChange?.(!checked);
  };

  return (
    <div
      ref={ref}
      className={cn(
        'h-6 w-6 flex items-center justify-center cursor-pointer text-current',
        className
      )}
      onClick={handleClick}
      {...props}
    >
      <Star
        size={16}
        strokeWidth={3}
        className={cn(
          checked ? 'text-yellow-500' : 'text-gray-400',
        )}
      />
    </div>
  );
});

Favorite.displayName = 'Favorite';

export { Favorite };
*/
/*'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const Favorite = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'h-6 w-6 flex items-center justify-center cursor-pointer text-current',
        className
      )}
      {...props}
    >
      <Star
        size={16}
        strokeWidth={3}
        className={cn('text-gray-400')}
      />
    </div>
  );
});

Favorite.displayName = 'Favorite';

export { Favorite };*/


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
        'h-6 w-6 flex items-center justify-center cursor-pointer',
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      {...props}
    >
      <Star
        size={16}
        strokeWidth={3}
        className={cn(isSelected ? 'text-yellow-400' : 'text-gray-400')}
      />
    </div>
  );
});

Favorite.displayName = 'Favorite';

export { Favorite };


