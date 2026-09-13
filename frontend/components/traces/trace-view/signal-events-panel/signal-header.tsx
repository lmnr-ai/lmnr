import { type TraceSignal } from "@/components/traces/trace-view/store/base";

import SeverityIcon from "./severity-icon";
import { worstSeverity } from "./utils";

/** The header when a trace has a single signal. The tab row replaces it when
 *  there are several. */
export default function SignalHeader({ signal }: { signal: TraceSignal }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
      {signal.events.length > 0 && <SeverityIcon severity={worstSeverity(signal)} />}
      <span className="min-w-0 truncate text-xs font-medium">{signal.signalName}</span>
    </div>
  );
}
