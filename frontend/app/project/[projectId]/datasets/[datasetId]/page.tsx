import { and, eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Dataset from "@/components/dataset/dataset";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { datasets } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Dataset",
};

export default async function DatasetPage(props: { params: Promise<{ projectId: string; datasetId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/sign-in");
  }

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.projectId, projectId), eq(datasets.id, datasetId)),
  });

  if (!dataset) {
    return notFound();
  }

  return <Dataset
    dataset={dataset}
    enableDownloadParquet={process.env.DATASET_EXPORT_WORKER_URL !== undefined}
    publicApiBaseUrl={process.env.PUBLIC_API_BASE_URL}
  />;
}
