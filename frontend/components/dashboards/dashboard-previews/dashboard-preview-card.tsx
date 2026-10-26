import Link from "next/link";
import useSWR from "swr";

import { type Dashboard, type DashboardChart, getChartsUrl } from "@/components/dashboards/types";
import { cn, swrFetcher } from "@/lib/utils";

import CardActions from "./card-actions";
import LayoutThumbnail, { THUMBNAIL_WIDTH } from "./layout-thumbnail";
import { DROP_DASHBOARD_ATTR, useDashboardPreviewsStore } from "./previews-store";

interface DashboardPreviewCardProps {
  projectId: string;
  dashboard: Pick<Dashboard, "id" | "name">;
  href: string;
  isCurrent: boolean;
  onRename: () => void;
  onDelete?: () => void;
}

/** A clickable layout thumbnail and name, with rename/delete on hover. */
const DashboardPreviewCard = ({
  projectId,
  dashboard,
  href,
  isCurrent,
  onRename,
  onDelete,
}: DashboardPreviewCardProps) => {
  // Same key the grid uses, so opening a previewed dashboard renders from cache.
  const { data } = useSWR<DashboardChart[]>(getChartsUrl(projectId, dashboard.id), swrFetcher);
  const isDropTarget = useDashboardPreviewsStore((s) => s.dropTargetId === dashboard.id);

  return (
    <div
      {...{ [DROP_DASHBOARD_ATTR]: dashboard.id }}
      className={cn(
        "group flex shrink-0 flex-col gap-2",
        isCurrent ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
      // A name wider than the thumbnail would widen the card and push the corner actions past it.
      style={{ width: THUMBNAIL_WIDTH }}
    >
      {/* The actions sit beside the link, not inside it: buttons can't nest in an anchor. */}
      <div className="relative">
        <Link href={href} aria-current={isCurrent ? "page" : undefined} className="block rounded-md">
          <LayoutThumbnail
            charts={data}
            className={cn(
              "transition-colors",
              isDropTarget
                ? "bg-emphasis-2 ring ring-primary-400/60"
                : isCurrent
                  ? "bg-emphasis-1 ring ring-primary-400/60"
                  : "bg-emphasis-0.5 ring ring-border group-hover:bg-emphasis-1 group-hover:ring-emphasis-3"
            )}
          />
        </Link>
        <CardActions onRename={onRename} onDelete={onDelete} />
      </div>
      <Link href={href} tabIndex={-1} title={dashboard.name} className="truncate text-xs font-medium">
        {dashboard.name}
      </Link>
    </div>
  );
};

export default DashboardPreviewCard;
