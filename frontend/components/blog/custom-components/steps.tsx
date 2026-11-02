import { Children, isValidElement, type ReactNode } from "react";

export function Steps({ children }: { children: ReactNode }) {
  const steps = Children.toArray(children).filter(isValidElement);
  return (
    <ol className="not-typeset my-6 flex flex-col">
      {steps.map((step, i) => (
        <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-3 top-7 bottom-1 w-px bg-white/10" />}
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-xs text-white">
            {i + 1}
          </span>
          <div className="flex-1">{step}</div>
        </li>
      ))}
    </ol>
  );
}

interface StepProps {
  title: string;
  children?: ReactNode;
}

export function Step({ title, children }: StepProps) {
  return (
    <div className="flex flex-col gap-1 text-secondary-foreground [&_p]:m-0">
      <span className="font-medium text-white">{title}</span>
      {children}
    </div>
  );
}
