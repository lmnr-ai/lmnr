'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // overriden text-sm class to ensure center positioning
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm leading-none font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary/90 primary text-primary-foreground/90 hover:bg-primary border-white/20 border hover:border-white/50',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/60 border border-secondary-foreground/20',
        ghost: 'hover:text-accent-foreground/80',
        light: 'bg-white/90 text-black/90 hover:bg-white/60 border-white/20 border hover:border-white/50',
        lightSecondary: 'bg-white/10 text-white/80 hover:bg-white/20 border-white/20 border hover:border-white/50',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-7 px-3',
        sm: 'h-6 rounded-md px-2 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

type HandledKey = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean; // Ctrl on Windows, Command on Mac
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;

  // Must only be used for dialogs or other pop-ups where there is only 1 button to handle at the moment
  // Used for backwards compatibility, use handleKeys instead
  handleEnter?: boolean;
  handleKeys?: HandledKey[];
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      handleEnter,
      handleKeys,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button';

    const handleKeysUp = React.useMemo(() => {
      let handleKeysUp = new Set<HandledKey>();
      if (handleEnter !== undefined) {
        handleKeysUp.add({ key: 'Enter' });
      }
      if (handleKeys !== undefined) {
        handleKeys.forEach((key) => {
          handleKeysUp.add(key);
        });
      }
      return Array.from(handleKeysUp);
    }, [handleEnter, handleKeys]);

    const isHandledKey = React.useCallback(
      (e: React.KeyboardEvent) =>
        handleKeysUp.some(
          (key) =>
            e.key === key.key &&
            (key.ctrlKey === undefined || key.ctrlKey === e.ctrlKey) &&
            (key.metaKey === undefined || key.metaKey === e.metaKey)
        ),
      [handleKeysUp]
    );

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent) => {
        // Both keyup and keydown work well for all keys and Ctrl+Key,
        // However, keyup does not work for Meta+Key on Mac (Command+Key)
        if (!props.disabled && isHandledKey(e)) {
          props.onClick?.(e as any);
        }
      },
      [props.onClick]
    );

    React.useEffect(() => {
      if (handleKeysUp.length > 0) {
        window.addEventListener('keydown', handleKeyDown as any);
      }

      return () => {
        if (handleKeysUp.length > 0) {
          window.removeEventListener('keydown', handleKeyDown as any);
        }
      };
    }, [props.onClick]);

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
