import { useMemo } from "react";
import useSWR from "swr";

import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import UsersPill from "@/components/traces/user-preview/users-pill";
import { useProjectContext } from "@/contexts/project-context";
import { type ModelTokens } from "@/lib/actions/sessions/model-tokens";
import { swrFetcher } from "@/lib/api/fetch-api";
import { cn } from "@/lib/utils";

import { useSessionData } from "../data";
import { sessionModelTokensUrl } from "../session-api";
import { useChatSession } from "../store";
import ModelsPill from "./models-pill";

const EMPTY: ModelTokens[] = [];

const distinct = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v && v !== "<null>"))].sort();

/** Session stats, user and model pills, and the timeline toggle. */
export default function ControlBar() {
  const { traces } = useSessionData();
  const timelineEnabled = useChatSession((s) => s.timelineEnabled);
  const { project } = useProjectContext();
  const projectId = project?.id ?? "";

  const stats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);
  const users = useMemo(() => distinct(traces.map((t) => t.userId)), [traces]);
  const sessionId = useChatSession((s) => s.sessionId);
  // One grouped query over the session's LLM spans; on failure the optional pill just stays hidden.
  const { data: models = EMPTY } = useSWR<ModelTokens[]>(
    projectId && sessionId ? sessionModelTokensUrl(projectId, sessionId) : null,
    swrFetcher
  );

  if (!stats) return null;

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b pl-3 transition-[padding] duration-200",
        // Closed: leave room for the floating Timeline toggle (see chat-session-view/index.tsx).
        timelineEnabled ? "pr-3" : "pr-[96px]"
      )}
    >
      <UsersPill projectId={projectId} userIds={users} />
      <StatsShields stats={stats} />
      <ModelsPill models={models} />
    </div>
  );
}
