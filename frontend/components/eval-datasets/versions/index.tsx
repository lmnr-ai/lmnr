"use client";

import { useParams } from "next/navigation";

import Header from "@/components/ui/header";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { FETCH_SIZE } from "../constants";
import { VERSIONS_COLUMN_ORDER } from "./columns";
import { VersionsTableContents } from "./table-contents";

/** One eval dataset's versions, newest first. */
export default function EvalDatasetVersions({ dataset }: { dataset: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <>
      <Header path={`eval datasets/${dataset}`} />
      <div className="flex flex-1 overflow-hidden px-4 pb-4">
        <InfiniteDataTableProvider defaults={{ columnOrder: VERSIONS_COLUMN_ORDER }} pageSize={FETCH_SIZE}>
          <VersionsTableContents projectId={projectId} dataset={dataset} />
        </InfiniteDataTableProvider>
      </div>
    </>
  );
}
