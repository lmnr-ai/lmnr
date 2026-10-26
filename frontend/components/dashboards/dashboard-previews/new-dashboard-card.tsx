import { Plus } from "lucide-react";
import { useState } from "react";

import DashboardNameDialog from "./dashboard-name-dialog";
import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH } from "./layout-thumbnail";

/** Trailing card in the previews strip that names and creates a dashboard. */
const NewDashboardCard = ({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex shrink-0 flex-col gap-2 text-left text-muted-foreground hover:text-foreground"
      >
        <div
          className="flex items-center justify-center rounded-md bg-emphasis-0.5 transition-colors group-hover:bg-emphasis-1 ring ring-border group-hover:ring-emphasis-3"
          style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
        >
          <Plus className="size-5" />
        </div>
        <span className="text-xs font-medium">New dashboard</span>
      </button>
      <DashboardNameDialog
        open={open}
        onOpenChange={setOpen}
        title="New dashboard"
        submitText="Create"
        onSubmit={onCreate}
      />
    </>
  );
};

export default NewDashboardCard;
