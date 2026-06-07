import { createHash, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { prettifyError, z, ZodError } from "zod/v4";

import { createApiKey } from "@/lib/actions/project-api-keys";
import { cliKeyName } from "@/lib/cli-login";
import { verifyCode } from "@/lib/cli-login/code";
import { parseJsonBody } from "@/lib/cli-login/parse-body";
import { db } from "@/lib/db/drizzle";
import { projects } from "@/lib/db/migrations/schema";

const BodySchema = z
  .object({
    code: z.string().min(1),
    codeVerifier: z.string().min(1),
    hostname: z.string().max(256).optional(),
  })
  .strict();

// Unauthenticated: the CLI is a non-browser caller with no session. Security
// rests on the jose-signed code + the PKCE verifier ↔ challenge proof.
// NEVER log the code, the verifier, or the minted key.
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const parsed = await parseJsonBody(req);
    if ("error" in parsed) return parsed.error;
    const body = BodySchema.parse(parsed.data);

    let claims: Awaited<ReturnType<typeof verifyCode>>;
    try {
      claims = await verifyCode(body.code);
    } catch {
      return Response.json({ error: "invalid_code" }, { status: 400 });
    }

    // Re-derive the challenge from the supplied verifier and constant-time
    // compare. timingSafeEqual throws on unequal length, so guard first.
    const derived = createHash("sha256").update(body.codeVerifier).digest("base64url");
    const a = Buffer.from(derived);
    const b = Buffer.from(claims.codeChallenge);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return Response.json({ error: "challenge_mismatch" }, { status: 400 });
    }

    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, claims.projectId))
      .limit(1);
    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    const apiKey = await createApiKey({
      projectId: claims.projectId,
      name: cliKeyName(body.hostname),
      isIngestOnly: false,
    });
    return Response.json({ apiKey: apiKey.value, projectId: claims.projectId, projectName: project.name });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
}
