import { type NextRequest, NextResponse } from "next/server";

import { handleGithubWebhook, isDeliveryHandled, markDeliveryHandled } from "@/lib/actions/github/webhook";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { githubAppConfig } from "@/lib/github/config";
import { verifyWebhookSignature } from "@/lib/github/signing";

// https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
export async function POST(req: NextRequest): Promise<Response> {
  if (!isFeatureEnabled(Feature.GITHUB)) {
    return NextResponse.json({ error: "GitHub integration is not configured" }, { status: 404 });
  }

  // The signature covers the exact bytes, so read the raw body before parsing.
  const body = await req.text();
  if (!verifyWebhookSignature(body, req.headers.get("x-hub-signature-256"), githubAppConfig.webhookSecret())) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery");
  if (!event || !deliveryId) {
    return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
  }

  try {
    if (!(await isDeliveryHandled(deliveryId))) {
      await handleGithubWebhook(event, JSON.parse(body));
      await markDeliveryHandled(deliveryId);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("GitHub webhook handling failed", { event, deliveryId, error });
    return NextResponse.json({ error: "Failed to handle webhook" }, { status: 500 });
  }
}
