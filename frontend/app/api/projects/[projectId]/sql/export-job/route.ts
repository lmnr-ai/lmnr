import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { createExportJob } from "@/lib/actions/sql";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const body = await req.json();

    const result = await createExportJob({
      projectId,
      ...body,
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      jobId: result.jobId,
      warnings: result.warnings,
    });
  } catch (e) {
    if (e instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(e) }, { status: 400 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to export data." }, { status: 500 });
  }
}
