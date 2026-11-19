"use client";

import Link from "next/link";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import Header from "@/components/ui/header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type EvalDatasetSummary } from "@/lib/actions/eval-datasets/types";

interface EvalDatasetsProps {
  projectId: string;
  datasets: EvalDatasetSummary[];
}

/** The project's eval datasets (`lmnr-cli eval dataset push`). */
export default function EvalDatasets({ projectId, datasets }: EvalDatasetsProps) {
  return (
    <>
      <Header path="eval datasets" />
      <div className="flex flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
        {datasets.length === 0 ? (
          <div className="flex flex-col gap-2 rounded-md border bg-surface-up p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No eval datasets yet</p>
            <p>
              An eval dataset is a folder of Harbor tasks under <code>evals/</code>. Push one with{" "}
              <code>npx lmnr-cli eval dataset push</code>, and its task versions show up here.
            </p>
          </div>
        ) : (
          <div className="rounded-md border bg-surface-up">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-3">Name</TableHead>
                  <TableHead className="px-3">Tasks</TableHead>
                  <TableHead className="px-3">Last pushed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow key={dataset.id} className="h-10 border-b last:border-b-0">
                    <TableCell className="px-3 font-medium">
                      <Link
                        href={`/project/${projectId}/eval-datasets/${encodeURIComponent(dataset.id)}`}
                        className="hover:underline"
                      >
                        {dataset.id}
                      </Link>
                    </TableCell>
                    <TableCell className="px-3 text-muted-foreground">{dataset.taskCount}</TableCell>
                    <TableCell className="px-3 text-muted-foreground">
                      {dataset.lastPushedAt ? <ClientTimestampFormatter timestamp={dataset.lastPushedAt} /> : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
