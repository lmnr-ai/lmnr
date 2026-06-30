import { eq } from "drizzle-orm";
import { type Metadata } from "next";

import Evaluations from "@/components/evaluations/evaluations";
import EvalsPagePlaceholder from "@/components/evaluations/page-placeholder";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Evaluations",
};

export default async function EvaluationsPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const projectId = params.projectId;
  const anyInProject = (await db.$count(evaluations, eq(evaluations.projectId, projectId))) > 0;
  if (!anyInProject) {
    return <EvalsPagePlaceholder />;
  }
  return <Evaluations />;
}
