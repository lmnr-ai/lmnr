import { eq } from "drizzle-orm";
import _sodium from "libsodium-wrappers";
import { z } from "zod/v4";

import { cache, WORKSPACE_DEPLOYMENTS_CACHE_KEY } from "@/lib/cache.ts";
import { decryptValue, encryptValue, generateKeyPair } from "@/lib/crypto.ts";
import { db } from "@/lib/db/drizzle.ts";
import { projects, workspaceDeployments } from "@/lib/db/migrations/schema.ts";
import { DeploymentType } from "@/lib/workspaces/types.ts";

const GenerateDeploymentKeysSchema = z.object({
  workspaceId: z.string(),
});

const VerifyDeploymentSchema = z.object({
  workspaceId: z.string(),
  dataPlaneUrl: z.string(),
});

const UpdateDeploymentSchema = z.object({
  workspaceId: z.string(),
  dataPlaneUrl: z.string().optional(),
  mode: z.enum(DeploymentType),
});

export const generateDeploymentKeys = async (input: z.infer<typeof GenerateDeploymentKeysSchema>) => {
  const { workspaceId } = GenerateDeploymentKeysSchema.parse(input);

  const { publicKey, privateKey } = await generateKeyPair();

  const { value: encryptedPrivateKey, nonce: privateKeyNonce } = await encryptValue(workspaceId, privateKey);

  const existingDeployment = await db.query.workspaceDeployments.findFirst({
    where: eq(workspaceDeployments.workspaceId, workspaceId),
  });

  if (existingDeployment) {
    await db
      .update(workspaceDeployments)
      .set({
        publicKey,
        privateKey: encryptedPrivateKey,
        privateKeyNonce,
      })
      .where(eq(workspaceDeployments.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceDeployments).values({
      workspaceId,
      publicKey,
      privateKey: encryptedPrivateKey,
      privateKeyNonce,
    });
  }

  return { publicKey };
};

export const getDeployment = async (input: z.infer<typeof GenerateDeploymentKeysSchema>) => {
  const { workspaceId } = GenerateDeploymentKeysSchema.parse(input);

  const result = await db.query.workspaceDeployments.findFirst({
    where: eq(workspaceDeployments.workspaceId, workspaceId),
  });

  if (!result) {
    return {
      workspaceId,
      mode: DeploymentType.CLOUD,
      publicKey: null,
      privateKey: null,
      privateKeyNonce: null,
      dataPlaneUrl: null,
      dataPlaneUrlNonce: null,
    };
  }

  const decodeDataPlaneUrl = async () => {
    if (!result.dataPlaneUrl || !result.dataPlaneUrlNonce) {
      return result.dataPlaneUrl;
    }
    try {
      return await decryptValue(workspaceId, result.dataPlaneUrlNonce, result.dataPlaneUrl);
    } catch (error) {
      console.error("Failed to decode data plane URL", error);
      return result.dataPlaneUrl;
    }
  };

  return {
    ...result,
    dataPlaneUrl: await decodeDataPlaneUrl(),
  };
};

export const updateDeployment = async (input: z.infer<typeof UpdateDeploymentSchema>) => {
  const { dataPlaneUrl, mode, workspaceId } = UpdateDeploymentSchema.parse(input);

  const updateData: {
    mode: string;
    dataPlaneUrl?: string;
    dataPlaneUrlNonce?: string;
  } = { mode };

  if (dataPlaneUrl) {
    const { value: encryptedDataPlaneUrl, nonce: dataPlaneUrlNonce } = await encryptValue(workspaceId, dataPlaneUrl);
    updateData.dataPlaneUrl = encryptedDataPlaneUrl;
    updateData.dataPlaneUrlNonce = dataPlaneUrlNonce;
  }

  const existingDeployment = await db.query.workspaceDeployments.findFirst({
    where: eq(workspaceDeployments.workspaceId, workspaceId),
  });

  if (existingDeployment) {
    await db.update(workspaceDeployments).set(updateData).where(eq(workspaceDeployments.workspaceId, workspaceId));
  } else {
    await db.insert(workspaceDeployments).values({
      workspaceId,
      ...updateData,
    });
  }

  const projs = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: {
      id: true,
    },
  });

  for (const project of projs) {
    await cache.remove(`${WORKSPACE_DEPLOYMENTS_CACHE_KEY}:${project.id}`);
  }
};

export const verifyDeployment = async (input: z.infer<typeof VerifyDeploymentSchema>) => {
  const { workspaceId, dataPlaneUrl } = VerifyDeploymentSchema.parse(input);

  // Fetch workspace deployment info
  const deployment = await db.query.workspaceDeployments.findFirst({
    where: eq(workspaceDeployments.workspaceId, workspaceId),
  });

  if (!deployment) {
    throw new Error("No workspace deployment found.");
  }

  if (!deployment.privateKey || !deployment.privateKeyNonce) {
    throw new Error("Private key not configured.");
  }

  // Decrypt private key
  const privateKeyBase64 = await decryptValue(workspaceId, deployment.privateKeyNonce, deployment.privateKey);

  // Generate auth token
  await _sodium.ready;
  const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");

  // Token expiration: 15 minutes (900 seconds)
  const TOKEN_EXPIRATION_SECS = 900;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_EXPIRATION_SECS;

  // Create payload: workspace_id:issued_at:expires_at
  const payload = `${workspaceId}:${now}:${expiresAt}`;
  const payloadBytes = new TextEncoder().encode(payload);

  // Sign the payload with Ed25519
  const signature = _sodium.crypto_sign_detached(payloadBytes, privateKeyBytes);

  // Encode as base64url (URL_SAFE_NO_PAD): payload.signature
  const payloadBase64 = Buffer.from(payloadBytes).toString("base64url");
  const signatureBase64 = Buffer.from(signature).toString("base64url");
  const token = `${payloadBase64}.${signatureBase64}`;

  // Make HTTP POST request to data plane
  try {
    const response = await fetch(`${dataPlaneUrl}/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "SELECT COUNT(1) FROM spans LIMIT 10",
        parameters: {},
      }),
    });

    if (response.ok) {
      return true;
    }

    const errorText = await response.text();
    throw new Error(`Data plane verification failed (${response.status}): ${errorText}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to verify data plane: ${error.message}`);
    }
    throw new Error("Failed to verify data plane: Unknown error");
  }
};
