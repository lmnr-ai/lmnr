import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type ArchiveFile, listArchiveFiles, readArchiveFile } from "@/lib/actions/evaluation/files";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evalDatasetTaskBlobs } from "@/lib/db/migrations/schema";

/*
 * A pushed task is `eval-datasets/<project>/tasks/<hex>.tar.gz` plus its
 * `.index.json` (lmnr-cli `eval push`), paths relative to the task dir. Content
 * addressed and immutable, so the evaluation files reader serves them as is.
 */

const TaskSchema = z.object({
  projectId: z.guid(),
  hex: z.string().regex(/^[0-9a-f]{64}$/, "Invalid task hash"),
});

class TaskUnavailableError extends NotFoundError {
  constructor() {
    super("This task's files are not available");
  }
}

/** The task's storage prefix; 404 unless the project finished uploading it (its blob row is written last). */
const taskPrefix = async (input: z.input<typeof TaskSchema>): Promise<string> => {
  const { projectId, hex } = TaskSchema.parse(input);
  const blob = await db.query.evalDatasetTaskBlobs.findFirst({
    columns: { hash: true },
    where: and(eq(evalDatasetTaskBlobs.projectId, projectId), eq(evalDatasetTaskBlobs.hash, `sha256:${hex}`)),
  });
  if (!blob) throw new TaskUnavailableError();
  return `eval-datasets/${projectId}/tasks/${hex}`;
};

export const getEvalDatasetTaskFiles = async (
  input: z.input<typeof TaskSchema>
): Promise<{ files: ArchiveFile[] }> => ({
  files: await listArchiveFiles(await taskPrefix(input), TaskUnavailableError),
});

/** Streams one file of a task, `path` relative to the task dir. */
export const readEvalDatasetTaskFile = async (input: z.input<typeof TaskSchema> & { path: string }) =>
  readArchiveFile(await taskPrefix(input), input.path, TaskUnavailableError);
