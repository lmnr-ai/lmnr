import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";
import { getRolloutSessions } from "@/lib/actions/rollout-sessions";

export async function GET(_request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
    const params = await props.params;
    const projectId = params.projectId;

    try {
        const result = await getRolloutSessions({ projectId });
        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
        }
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to get rollout sessions." },
            { status: 500 }
        );
    }
}
