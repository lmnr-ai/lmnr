import { useParams } from "next/navigation";
import { useState } from "react";

import { type Dashboard } from "@/components/dashboards/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import DashboardNameDialog from "./dashboard-name-dialog";
import DashboardPreviewCard from "./dashboard-preview-card";
import NewDashboardCard from "./new-dashboard-card";

type PreviewDashboard = Pick<Dashboard, "id" | "name" | "chartCount">;

export interface DashboardPreviewsProps {
  dashboards: PreviewDashboard[];
  getHref: (dashboardId: string) => string;
  onCreate: (name: string) => Promise<boolean>;
  onRename: (dashboardId: string, name: string) => Promise<boolean>;
  onDelete: (dashboardId: string) => void;
}

/** Horizontally scrolling dashboard picker, one layout thumbnail per dashboard. */
const DashboardPreviews = ({ dashboards, getHref, onCreate, onRename, onDelete }: DashboardPreviewsProps) => {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  // Kept after the dialog closes so its title doesn't blank out during the close animation.
  const [target, setTarget] = useState<PreviewDashboard | null>(null);

  const openDialog = (type: "rename" | "delete", dashboard: PreviewDashboard) => {
    setTarget(dashboard);
    setDialog(type);
  };
  const closeDialog = (isOpen: boolean) => !isOpen && setDialog(null);

  return (
    <>
      <div className="no-scrollbar scroll-fade-x flex gap-4 overflow-x-auto py-1 pl-px">
        {dashboards.map((dashboard) => (
          <DashboardPreviewCard
            key={dashboard.id}
            projectId={projectId}
            dashboard={dashboard}
            href={getHref(dashboard.id)}
            isCurrent={dashboard.id === dashboardId}
            onRename={() => openDialog("rename", dashboard)}
            // The last dashboard can't go: the page always needs one to show.
            onDelete={dashboards.length > 1 ? () => openDialog("delete", dashboard) : undefined}
          />
        ))}
        <NewDashboardCard onCreate={onCreate} />
      </div>
      <DashboardNameDialog
        open={dialog === "rename"}
        onOpenChange={closeDialog}
        title="Rename dashboard"
        submitText="Save"
        initialName={target?.name}
        onSubmit={(name) => (target ? onRename(target.id, name) : Promise.resolve(false))}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={closeDialog}
        title={`Delete "${target?.name}"?`}
        description={`This permanently deletes the dashboard and its ${target?.chartCount} ${target?.chartCount === 1 ? "chart" : "charts"}.`}
        confirmText="Delete"
        onConfirm={() => target && onDelete(target.id)}
      />
    </>
  );
};

export default DashboardPreviews;
