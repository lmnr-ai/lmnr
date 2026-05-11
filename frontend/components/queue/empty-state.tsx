import { FileCode, Inbox, MessageCircle, SquareArrowOutUpRight, Terminal } from "lucide-react";
import { useParams } from "next/navigation";

import Header from "@/components/ui/header";

import { useQueueStore } from "./queue-store";
import Toolbar from "./toolbar";

const SOURCES = [
  {
    icon: MessageCircle,
    title: "From a span",
    description: "Add spans you want to label from a trace.",
  },
  {
    icon: FileCode,
    title: "From the SQL editor",
    description: "Send rows from a SQL query to this queue.",
  },
  {
    icon: Terminal,
    title: "From the API or SDK",
    description: "Push items to this queue programmatically.",
  },
] as const;

export default function EmptyState() {
  const { projectId } = useParams<{ projectId: string }>();

  const queue = useQueueStore((s) => s.queue);
  return (
    <>
      <Header
        path={[
          { name: "labeling queues", href: `/project/${projectId}/labeling-queues` },
          { name: queue.name, copyValue: queue.id },
        ]}
      />
      <div className="px-4 pb-4 flex flex-col flex-1 items-end gap-3 overflow-hidden">
        <Toolbar />
        <div className="flex flex-1 items-center justify-center mx-auto">
          <div className="flex flex-col items-center text-center max-w-md">
            <div className="flex items-center justify-center size-12 rounded-full bg-muted text-muted-foreground mb-4">
              <Inbox className="size-6" />
            </div>
            <h3 className="text-base font-medium">No items in this queue</h3>
            <p className="text-sm text-muted-foreground mt-1">Add items to this queue to start labelling.</p>
            <ul className="flex flex-col gap-3 mt-6 w-full text-left">
              {SOURCES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-8 rounded-md border bg-muted/40 text-muted-foreground shrink-0">
                    <Icon className="size-4.5" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium leading-5">{title}</span>
                    <span className="text-sm text-muted-foreground leading-5">{description}</span>
                  </div>
                </li>
              ))}
            </ul>
            <a
              href="https://laminar.sh/docs/queues/quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-6"
            >
              Learn more
              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
