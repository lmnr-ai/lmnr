import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import { HeaderLinkButton } from "@/components/traces/trace-view/header/header-link-button";
import { userSessionsUrl } from "@/components/traces/trace-view/header/user-traces-url";
import { useProjectContext } from "@/contexts/project-context";
import { type ModelTokens } from "@/lib/actions/traces/span-counts";
import { cn } from "@/lib/utils";

import { useTurnDataStore } from "../turn-data";
import ModelsPill from "./models-pill";
import MultiValuePill from "./multi-value-pill";

const USER_PILL_CLS = "flex h-6 items-center gap-1 rounded-md bg-emphasis-1 px-2 text-xs";

const EMPTY: ModelTokens[] = [];

const distinct = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v && v !== "<null>"))].sort();

/** Session stats, user and model pills, and the timeline toggle. */
export default function ControlBar() {
  const traces = useSessionViewStore((s) => s.traces, shallow);
  const timelineEnabled = useSessionViewStore((s) => s.sessionTimelineEnabled);
  const { project } = useProjectContext();
  const router = useRouter();
  const projectId = project?.id ?? "";

  const stats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);
  const users = useMemo(() => distinct(traces.map((t) => t.userId)), [traces]);
  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  // Keyed by trace ids so another session's result never shows while this one loads.
  const models = useTurnDataStore((s) => (s.models?.key === traceIds.join(",") ? s.models.items : EMPTY));
  const fetchModels = useTurnDataStore((s) => s.fetchModels);
  // One grouped query over the session's LLM spans; no span rows are loaded.
  useEffect(() => {
    if (projectId && traceIds.length > 0) void fetchModels(projectId, traceIds);
  }, [projectId, traceIds, fetchModels]);

  if (!stats) return null;

  const userLink = (userId: string) => (
    <HeaderLinkButton
      icon={<User size={14} className="flex-shrink-0" />}
      label={userId}
      tooltip="See this user's sessions"
      onClick={() => router.push(userSessionsUrl(projectId, userId, project?.logRetentionDays))}
      className="h-6 max-w-56"
    />
  );

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b pl-3 transition-[padding] duration-200",
        // Closed: leave room for the floating Timeline toggle (see chat-session-view/index.tsx).
        timelineEnabled ? "pr-3" : "pr-[96px]"
      )}
    >
      <MultiValuePill
        values={users}
        noun="users"
        icon={<User size={14} />}
        className={USER_PILL_CLS}
        renderSingle={userLink}
        renderItem={userLink}
      />
      <StatsShields stats={stats} />
      <ModelsPill models={models} />
    </div>
  );
}
