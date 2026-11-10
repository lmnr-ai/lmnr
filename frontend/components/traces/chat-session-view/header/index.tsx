import { useMemo } from "react";
import useSWR from "swr";

import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import UsersPill from "@/components/traces/user-preview/users-pill";
import Header from "@/components/ui/header";
import { type ModelTokens } from "@/lib/actions/sessions/model-tokens";
import { swrFetcher } from "@/lib/api/fetch-api";

import { sessionModelTokensUrl } from "../session-api";
import { useChatSession } from "../store";
import ModelPills from "./model-pills";

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
        // Wrapping is decided at the 200px basis, so the pills move to a second row only when that doesn't
        // fit beside them; the name then grows to its full text (no further) or truncates.
        { name: sessionId, copyValue: sessionId, className: "min-w-0 basis-[200px] grow max-w-fit" },
      ]}
      className="h-auto min-h-12 border-b py-2.5 pr-2.5"
      childrenContainerClassName="flex-wrap gap-y-2"
    >
      {stats && (
        // `contents`: each pill is its own item in the header row, so they wrap one at a time.
        <div className="contents [&>*]:ml-2 [&>*]:shrink-0">
          <StatsShields stats={stats} />
          <ModelPills models={models} />
          <UsersPill projectId={projectId} userIds={users} />
        </div>
      )}
    </Header>
  );
}
