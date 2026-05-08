import Header from "@/components/ui/header";

import { useQueueStore } from "./queue-store";
import Toolbar from "./toolbar";

export default function EmptyState() {
  const queueName = useQueueStore((s) => s.queue.name);
  return (
    <>
      <Header path={`labeling queues/${queueName}`} />
      <div className="px-4 pb-4 flex flex-col flex-1">
        <Toolbar />
        <div className="flex flex-col gap-1 justify-center items-center flex-1">
          <span className="text-lg">No items in this queue</span>
          <span className="text-secondary-foreground text-sm">
            Push items from a dataset or a span to start labelling
          </span>
        </div>
      </div>
    </>
  );
}
