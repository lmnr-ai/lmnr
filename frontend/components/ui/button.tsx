"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Activity,
  AlertTriangle,
  ArrowUpLeft,
  Book,
  Braces,
  ChartNoAxesGantt,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Database,
  Download,
  Edit,
  File,
  FolderClosed,
  History,
  ListFilter,
  Loader2,
  LogOut,
  Minus,
  MoreHorizontal,
  PanelLeft,
  Pen,
  PlayCircle,
  PlayIcon,
  Plus,
  Rows2,
  Rows4,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareFunction,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm leading-none font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary/90 primary text-primary-foreground/90 hover:bg-primary border border-white/25",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent",
        outlinePrimary: "border border-primary bg-background hover:bg-primary/10 text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/60 border border-secondary-foreground/20",
        secondaryLight: "bg-secondary text-secondary-foreground hover:bg-secondary/60",
        ghost: "hover:text-accent-foreground/80",
        light: "bg-white/90 text-black/90 hover:bg-white/60 border-white/20 border hover:border-white/50",
        lightSecondary: "bg-white/10 text-white/80 hover:bg-white/20 border-white/20 border hover:border-white/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-7 px-3 text-xs py-2",
        sm: "h-[22px] rounded-md px-2 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const iconMap = {
  plus: Plus,
  close: X,
  braces: Braces,
  x: X,
  pen: Pen,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  database: Database,
  search: Search,
  edit: Edit,
  download: Download,
  trash: Trash2,
  history: History,
  delete: Trash2,
  settings: Settings,
  logout: LogOut,
  user: User,
  rows2: Rows2,
  playIcon: PlayIcon,
  users: Users,
  activity: Activity,
  folder: FolderClosed,
  book: Book,
  tag: Tag,
  squareFunction: SquareFunction,
  play: PlayCircle,
  slidersHorizontal: SlidersHorizontal,
  warning: AlertTriangle,
  alert: AlertTriangle,
  loader: Loader2,
  loading: Loader2,
  check: Check,
  back: ArrowUpLeft,
  file: File,
  sparkles: Sparkles,
  more: MoreHorizontal,
  panel: PanelLeft,
  circleAlert: CircleAlert,
  chart: ChartNoAxesGantt,
  filter: ListFilter,
  minus: Minus,
  rows4: Rows4,
};

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
  icon?: keyof typeof iconMap;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, handleEnter, handleKeys, icon, children, type = "button", ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    const handleKeysUp = React.useMemo(() => {
      let handleKeysUp = new Set<HandledKey>();
      if (handleEnter !== undefined) {
        handleKeysUp.add({ key: "Enter" });
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
        window.addEventListener("keydown", handleKeyDown as any);
      }

      return () => {
        if (handleKeysUp.length > 0) {
          window.removeEventListener("keydown", handleKeyDown as any);
        }
      };
    }, [props.onClick]);

    // Get the icon component from the map
    const IconComponent = icon ? iconMap[icon] : null;

    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} type={type} {...props}>
        {IconComponent && (
          <IconComponent className={cn(size === "sm" ? "size-3" : "size-3.5", { "-ml-1 mr-1": !!children })} />
        )}
        {children}
      </Comp>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
