import { claimDeviceCode, type DeviceCodeRow,getDeviceCode, recordPoll } from "@/lib/oauth/device-codes";
import { mintTokensResponse } from "@/lib/oauth/grants/mint";
import { oauthError } from "@/lib/oauth/request";

// RFC 8628 §3.4 grant type for the device authorization grant.
export const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

// Minimum gap between successive polls. Matches the `interval` we return
// from /oauth/device/authorize. If the CLI polls faster, we tell it to
// slow_down (RFC 8628 §3.5).
const MIN_POLL_GAP_MS = 5_000;

/**
 * Device-code state machine, in the order the CLI experiences it:
 *   pending  → user hasn't visited /oauth/device yet, or hasn't approved
 *   approved → user clicked Approve; row carries userId + projectId
 *   claimed  → CLI exchanged the code for tokens (terminal, one-shot)
 *   denied   → user clicked Deny (terminal)
 *
 * The CLI polls /oauth/token roughly every `interval` seconds. We return the
 * right OAuth error on each poll so the CLI knows what to do:
 *   pending           → `authorization_pending` (poll again)
 *   pending too soon  → `slow_down` (back off)
 *   denied            → `access_denied`
 *   expired           → `expired_token` (15min TTL passed; give up)
 *   approved          → 200 with tokens; row transitions to `claimed`
 *   claimed (replay)  → `expired_token` (can't reuse a one-shot device code)
 */
export async function handleDeviceCodeGrant(body: Record<string, string>): Promise<Response> {
  const deviceCode = body.device_code;
  const clientId = body.client_id;
  if (!deviceCode || !clientId) {
    return oauthError("invalid_request", "device_code and client_id are required");
  }

  const row = await getDeviceCode(deviceCode);
  if (!row) {
    return oauthError("invalid_grant", "Unknown device_code");
  }

  // Bind the device code to the client_id that originally requested it.
  // Prevents a different CLI build from picking up someone else's approval.
  if (row.clientId !== clientId) {
    return oauthError("invalid_grant", "client_id mismatch");
  }

  // Expiry is independent of status — check before dispatching.
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    return oauthError("expired_token");
  }

  switch (row.status) {
    case "denied":
      return oauthError("access_denied");

    // One-shot: a device code that's been claimed once cannot be used again.
    case "claimed":
      return oauthError("expired_token");

    case "pending":
      return handlePendingPoll(row);

    case "approved":
      return handleApproved(row);

    // Future statuses (e.g. "expired" if we ever start writing it explicitly)
    // fail closed.
    default:
      return oauthError("server_error", `Unknown device code status: ${row.status}`);
  }
}

async function handlePendingPoll(row: DeviceCodeRow): Promise<Response> {
  // slow_down: the CLI is polling faster than `interval`. Tell it to back off
  // without consuming a poll slot.
  if (row.lastPolledAt) {
    const lastPoll = new Date(row.lastPolledAt).getTime();
    if (Date.now() - lastPoll < MIN_POLL_GAP_MS) {
      return oauthError("slow_down");
    }
  }
  await recordPoll(row.deviceCode);
  return oauthError("authorization_pending");
}

async function handleApproved(row: DeviceCodeRow): Promise<Response> {
  // Flip the row to 'claimed' atomically. If a concurrent poll already
  // claimed it (rare — would require two CLI invocations sharing the same
  // device code), the loser gets expired_token.
  const claimed = await claimDeviceCode(row.deviceCode);
  if (!claimed) {
    return oauthError("expired_token", "Failed to claim device code");
  }

  return mintTokensResponse({
    userId: claimed.userId,
    projectId: claimed.projectId,
    scope: row.scope,
    clientId: row.clientId,
  });
}
