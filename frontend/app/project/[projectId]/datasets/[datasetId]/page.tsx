import { and, eq } from "drizzle-orm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
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
    redirect("/404");
  }

  return <Dataset dataset={dataset} />;
}
