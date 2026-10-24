// Landing-style button pair (see `components/landing/cta-buttons.tsx`), sized to share a row.
const actionBase =
  "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-sm px-4 font-sans-landing text-sm font-medium whitespace-nowrap no-underline transition-colors disabled:pointer-events-none disabled:opacity-50";

export const primaryAction = `${actionBase} bg-primary-200 text-black hover:bg-primary-400`;

export const secondaryAction = `${actionBase} border border-foreground-600 text-foreground-200 hover:bg-surface-300`;
