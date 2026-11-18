"use client";

import { useParams } from "next/navigation";

import Header from "@/components/ui/header";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";

import { FETCH_SIZE } from "../constants";
import { evalDatasetsColumns } from "./columns";
import { EvalDatasetsTableContents } from "./table-contents";

const COLUMN_ORDER = evalDatasetsColumns.map((column) => column.id!);

/** The project's eval datasets (tasks versioned by `lmnr-cli eval push`); read-only. */
export default function EvalDatasets() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <>
      <Header path="eval datasets" />
      <div className="flex flex-1 overflow-hidden px-4 pb-4">
        <InfiniteDataTableProvider defaults={{ columnOrder: COLUMN_ORDER }} pageSize={FETCH_SIZE}>
          <EvalDatasetsTableContents projectId={projectId} />
        </InfiniteDataTableProvider>
      </div>
    </>
  );
}
