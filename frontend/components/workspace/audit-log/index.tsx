"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

import UpgradeNotice from "@/components/common/upgrade-notice";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { useFilterUrlValue } from "@/components/ui/infinite-datatable/ui/datatable-filter/use-filter-url-value";

import { defaultColumnOrder } from "./columns";
import { DEFAULT_PAST_HOURS, FETCH_SIZE } from "./constants";
import { AuditLogTableContents } from "./table-contents";
import { AuditLogTableControls } from "./table-controls";

const DESCRIPTION = "Who changed what in this workspace, and who read trace data and how.";

function AuditLogContent({ workspaceId }: { workspaceId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathName = usePathname();
  const { filters } = useFilterUrlValue(false);
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  // Same default-range handshake as the traces table: the picker reads the range from the URL.
  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", DEFAULT_PAST_HOURS);
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    filters.forEach((f) => params.append("filter", JSON.stringify(f)));
    if (startDate && endDate) {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    } else {
      params.set("pastHours", pastHours ?? DEFAULT_PAST_HOURS);
    }
    return params.toString();
  }, [filters, pastHours, startDate, endDate]);

  return (
    <div className="flex h-[calc(100vh-12rem)] overflow-hidden">
      <AuditLogTableContents workspaceId={workspaceId} query={query} hasFilters={filters.length > 0}>
        <AuditLogTableControls exportHref={`/api/workspaces/${workspaceId}/audit-events/export?${query}`} />
      </AuditLogTableContents>
    </div>
  );
}

interface AuditLogProps {
  workspaceId: string;
  available: boolean;
}

export default function AuditLog({ workspaceId, available }: AuditLogProps) {
  return (
    <>
      <SettingsSectionHeader title="Audit log" description={DESCRIPTION} />
      {available ? (
        <InfiniteDataTableProvider
          defaults={{ columnOrder: defaultColumnOrder }}
          uniqueKey="eventId"
          pageSize={FETCH_SIZE}
        >
          <AuditLogContent workspaceId={workspaceId} />
        </InfiniteDataTableProvider>
      ) : (
        <UpgradeNotice
          title="The audit log is available on the Pro plan"
          description="Upgrade to Pro to see who changed what in your workspace and who accessed trace data."
          source="audit-log"
          tier="Pro"
        />
      )}
    </>
  );
}
