import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { getProjectGithubRepo, linkProjectRepo, unlinkProjectRepo } from "@/lib/actions/github";

const LinkRepoBodySchema = z.object({ repoId: z.number() });

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    return NextResponse.json(await getProjectGithubRepo(projectId));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load linked repository" }, { status: 500 });
  }
}

// Any workspace member may link a repo; proxy.ts has already checked membership.
export async function PUT(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    const { repoId } = LinkRepoBodySchema.parse(await request.json());
    return NextResponse.json(await linkProjectRepo({ projectId, repoId }));
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to link repository" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;
  try {
    await unlinkProjectRepo(projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to unlink repository" }, { status: 500 });
  }
}
