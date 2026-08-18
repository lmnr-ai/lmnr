import { ChevronDown, ChevronsRight, Maximize, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEM_CLS = "flex items-center h-7";

interface Props {
  signalsActive: boolean;
  showSignals: boolean;
  onSignalsToggle: () => void;
}

// Row 1 of the trace-view header, trimmed for the landing page: close,
// maximize, "Trace" + dropdown, Signals. Everything except Signals is
// decorative (disabled + disabled:opacity-100).
const PanelHeaderRow = ({ signalsActive, showSignals, onSignalsToggle }: Props) => (
  <div className="flex items-center gap-1">
    <span className={cn(ITEM_CLS, "gap-0.5")}>
      <Button aria-label="Collapse panel" variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <ChevronsRight className="w-5 h-5" />
      </Button>
      <Button aria-label="Expand" variant="ghost" disabled className="h-7 px-0.5 disabled:opacity-100">
        <Maximize className="w-4 h-4" />
      </Button>
    </span>

    <span className={ITEM_CLS}>
      <span className="text-base font-medium pl-2 flex-shrink-0">Trace</span>
      <Button aria-label="Expand" variant="ghost" disabled className="h-7 px-1 disabled:opacity-100">
        <ChevronDown className="w-3 h-3" />
      </Button>
    </span>

    {showSignals && (
      <span className={ITEM_CLS}>
        <Button
          variant="outline"
          onClick={onSignalsToggle}
          className={cn("h-6 text-xs px-1.5", signalsActive && "border-primary text-primary")}
        >
          <Radio data-icon="inline-start" size={14} className="mr-1" />
          Signals (1)
        </Button>
      </span>
    )}
  </div>
);

export default PanelHeaderRow;
