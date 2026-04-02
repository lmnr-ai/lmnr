import { motion } from "framer-motion";

import { SIGNAL_COLORS } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignalsButtonProps {
  signals: TraceSignal[];
  onClick: () => void;
  active: boolean;
  className?: string;
}

const SignalsButton = ({ signals, onClick, active, className }: SignalsButtonProps) => (
  <Button onClick={onClick} variant="outline" className={cn("h-6 text-xs px-1.5 gap-1.5 hover:bg-muted", className)}>
    {signals.length > 0 && (
      <div className="flex -space-x-1">
        {signals.map((signal, i) => (
          <motion.div
            key={signal.signalId}
            layout
            layoutId={`trace-signals-layout-${signal.signalId}`}
            className="size-3 border border-background"
            style={{ background: SIGNAL_COLORS[i % SIGNAL_COLORS.length], rotate: 45 }}
            transition={{ layout: { type: "spring", stiffness: 300, damping: 30 } }}
          />
        ))}
      </div>
    )}
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.3 } }}
      exit={{ opacity: 0, transition: { duration: 0.1, delay: 0 } }}
    >
      Signals
    </motion.span>
  </Button>
);

export default SignalsButton;
