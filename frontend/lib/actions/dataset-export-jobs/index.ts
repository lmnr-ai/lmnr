import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { datasetExportJobs } from "@/lib/db/migrations/schema";

const GetExportJobSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
});

export type ExportJob = {
  id: string;
  datasetId: string;
  projectId: string;
  status: "in_progress" | "completed" | "error";
  createdAt: string;
};

export async function getExportJob(input: z.infer<typeof GetExportJobSchema>): Promise<ExportJob | null> {
  const { projectId, datasetId } = GetExportJobSchema.parse(input);

  const job = await db.query.datasetExportJobs.findFirst({
    where: and(eq(datasetExportJobs.projectId, projectId), eq(datasetExportJobs.datasetId, datasetId)),
    orderBy: [desc(datasetExportJobs.createdAt)],
  });

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    datasetId: job.datasetId,
    projectId: job.projectId,
    status: job.status as "in_progress" | "completed" | "error",
    createdAt: job.createdAt,
  };
}



