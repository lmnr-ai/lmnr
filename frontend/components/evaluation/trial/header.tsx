import Link from "next/link";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";

interface TrialHeaderProps {
  projectId: string;
  evaluation: EvaluationType;
  trialId: string;
  /** The trial's task, as the table's Task column shows it. */
  taskName: string | null;
}

const crumb = "hover:overlay-hover rounded-lg px-2 p-0.5 text-secondary-foreground truncate min-w-0";

/** Breadcrumb back to the run; its link carries `?trialId=` so the table reopens on this trial. */
export default function TrialHeader({ projectId, evaluation, trialId, taskName }: TrialHeaderProps) {
  return (
    <div className="flex h-12 w-full flex-none items-center justify-between gap-2 pl-2.5 pr-4 font-medium">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <SidebarTrigger className="hover:overlay-hover size-7" />
        <Link href={`/project/${projectId}/evaluations`} className={crumb}>
          evaluations
        </Link>
        <div className="text-secondary-foreground/40">/</div>
        <Link
          href={`/project/${projectId}/evaluations?groupId=${encodeURIComponent(evaluation.groupId)}`}
          className={crumb}
        >
          {evaluation.groupId}
        </Link>
        <div className="text-secondary-foreground/40">/</div>
        <Link
          href={`/project/${projectId}/evaluations/${evaluation.id}?trialId=${encodeURIComponent(trialId)}`}
          className={crumb}
          title={evaluation.name}
        >
          {evaluation.name}
        </Link>
        <div className="text-secondary-foreground/40">/</div>
        <span className="truncate px-2" title={taskName ?? undefined}>
          <span className="text-secondary-foreground">Task</span> {taskName ?? "unknown"}
        </span>
      </div>
    </div>
  );
}
