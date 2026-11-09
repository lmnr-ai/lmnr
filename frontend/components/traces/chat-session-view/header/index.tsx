import { useMemo } from "react";
import useSWR from "swr";

import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import UsersPill from "@/components/traces/user-preview/users-pill";
import Header from "@/components/ui/header";
import { type ModelTokens } from "@/lib/actions/sessions/model-tokens";
import { swrFetcher } from "@/lib/api/fetch-api";

import { sessionModelTokensUrl } from "../session-api";
import { useChatSession } from "../store";
import ModelsPill from "./models-pill";

const EMPTY: ModelTokens[] = [];

const distinct = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => !!v && v !== "<null>"))].sort();

/** The page header over the thread column: breadcrumbs, then the session's stats, models, and users. */
export default function SessionHeader({ projectId }: { projectId: string }) {
  const traces = useChatSession((s) => s.traces);
  const sessionId = useChatSession((s) => s.sessionId);

  const stats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);
  const users = useMemo(() => distinct(traces.map((t) => t.userId)), [traces]);
  // One grouped query over the session's LLM spans; on failure the optional pill just stays hidden.
  const { data: models = EMPTY } = useSWR<ModelTokens[]>(
    projectId && sessionId ? sessionModelTokensUrl(projectId, sessionId) : null,
    swrFetcher
  );

  return (
    <Header
      path={[
        { name: "sessions", href: `/project/${projectId}/traces?view=sessions` },
        { name: sessionId, copyValue: sessionId },
      ]}
      // Nothing shrinks: a narrow thread column cuts the row off at its right edge.
      className="overflow-hidden pr-0"
      childrenContainerClassName="overflow-hidden [&>*]:shrink-0"
    >
      {stats && (
        <div className="ml-2 flex items-center gap-2 [&>*]:shrink-0">
          <StatsShields stats={stats} />
          <ModelsPill models={models} />
          <UsersPill projectId={projectId} userIds={users} />
        </div>
      )}
    </Header>
  );
}
