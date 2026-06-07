# RFC: Slack notifications for self-hosted / enterprise Laminar (brokered OAuth, direct-send)

- **Issue:** LAM-1675
- **Status:** Draft
- **Scope:** Let self-hosted Laminar instances use Laminar's official, verified Slack app by setting **one** Laminar-issued credential, without recreating a Slack app or configuring five Slack env vars — while keeping all Slack **message content inside the customer's VPC**.

---

## 1. Problem

Slack notifications today are hard-wired to Laminar Cloud's own Slack app via five environment variables:

| Env var | Read by | Purpose |
|---|---|---|
| `SLACK_CLIENT_ID` | frontend | OAuth `authorize` + token exchange |
| `SLACK_CLIENT_SECRET` | frontend | OAuth token exchange |
| `SLACK_SIGNING_SECRET` | frontend webhook | Verify `app_uninstalled` / `tokens_revoked` callbacks |
| `SLACK_REDIRECT_URL` | frontend | OAuth `redirect_uri` |
| `SLACK_ENCRYPTION_KEY` | frontend + app-server | XChaCha20 encrypt/decrypt of the stored bot token |

On top of that, the feature is gated off entirely for self-hosters:

```ts
// frontend/lib/features/features.ts (Feature.SLACK)
process.env.ENVIRONMENT === "PRODUCTION" &&
  !!SLACK_CLIENT_ID && !!SLACK_CLIENT_SECRET &&
  !!SLACK_SIGNING_SECRET && !!SLACK_REDIRECT_URL
```

Self-hosted instances run `ENVIRONMENT=FULL`, so even a fully-configured self-hoster can't turn Slack on.

We do **not** want customers to create + distribute their own Slack app (Slack app review/distribution friction) or hand-manage five secrets. The desired DX: **official Laminar Slack app + one issued key.**

## 2. Why a broker is mandatory (verified against Slack docs)

Confirmed against current Slack documentation (`docs.slack.dev/authentication/installing-with-oauth`, `docs.slack.dev/reference/methods/oauth.v2.access`, 2025):

1. **`redirect_uri` must be pre-registered on the app.** *"Your `redirect_uri` must match or be a subdirectory of a Redirect URL configured under App Management."* HTTPS only, no `#` anchor. A self-hoster's URL (e.g. `https://lmnr.acme.internal`) cannot be registered on Laminar's app and is frequently not publicly reachable. **The OAuth callback must land on Laminar Cloud.**
2. **`redirect_uri` must match between `authorize` and `oauth.v2.access`** or Slack returns `bad_redirect_uri`. Therefore both OAuth legs must execute on the same party — the broker.
3. **`SLACK_CLIENT_SECRET` / `SLACK_SIGNING_SECRET` are app-level secrets.** Distributing them to every self-hoster leaks Laminar's Slack app credentials.
4. **Revocation events (`tokens_revoked`, `app_uninstalled`) are delivered to a single app-level Events URL** (payload carries `team_id` + `api_app_id`, not the token). They will arrive at Laminar Cloud, never at the customer instance.
5. **`oauth.v2.access` returns** `access_token`, `token_type: "bot"`, `scope`, `bot_user_id`, `app_id`, `team{id,name}`. Bot tokens are **long-lived by default**; `expires_in` + `refresh_token` only appear when token rotation is enabled on the app (we keep it **off** — see §8).
6. Forwarding the issued bot token to a different backend is **mechanically supported** (a bot token is an unbound bearer string) and not prohibited by Slack; it is the one step not explicitly named in Slack's guide.

**Conclusion:** the redirect-URI rules don't just *permit* a broker — they *require* one to give self-hosters the official app. This RFC adopts a broker that performs OAuth and then **hands the bot token back to the customer instance**, so message sending — and all message content — stays in the customer's VPC ("direct-send"). The proxy-send alternative (broker also relays every message) is explicitly **out of scope**; rationale in §9.

## 3. Goals / Non-goals

**Goals**
- Self-hoster enables Slack by setting **one** credential (the existing enterprise **license key**) — no Slack app creation, no client/redirect/signing secrets.
- Slack **message content** (signal descriptions, AI summaries, extracted info, trace links) **never transits Laminar Cloud**. The bot token transits Laminar exactly **once**, at issuance.
- Sending path on the instance is **unchanged** from today (`app-server/src/notifications/slack.rs` → `chat.postMessage`).
- Laminar Cloud's existing Slack behavior is unchanged (cloud keeps the local env-var path).

**Non-goals**
- Proxy-send (relaying message content through Laminar). Out of scope; §9.
- Token rotation on the official app (§8).
- Pushing revocation events into the customer VPC (handled lazily; §7).
- Per-project Slack apps / BYO-app. A separate cheaper fallback, not this RFC.

## 4. Architecture overview

```
┌─────────────────────── CUSTOMER VPC (self-hosted) ───────────────────────┐
│  Frontend (Next.js)              app-server (Rust)                         │
│  - "Connect Slack" → broker      - notifications/slack.rs (UNCHANGED send) │
│  - /api/integrations/slack       - decode token, POST chat.postMessage     │
│    redeems claim code            - stores ENCRYPTED bot token in customer PG│
└───────────────┬───────────────────────────────────┬───────────────────────┘
                │ (1) start / (5) redeem token        │ (later) chat.postMessage
                │     [server→server, license key]    │     [direct to Slack]
                ▼                                      ▼
┌──────── LAMINAR CLOUD (lmnr-private) ────────┐   ┌──────── api.slack.com ────────┐
│  Slack OAuth Broker (NEW)                    │   │  ONE official "Laminar" app    │
│  - sole holder of CLIENT_ID/SECRET/SIGNING   │──▶│  client_id X, registered       │
│  - sole registered redirect_uri              │   │  redirect_uri = BROKER/cb      │
│  - receives tokens_revoked / app_uninstalled │◀──│  app-level Events URL          │
└──────────────────────────────────────────────┘   └────────────────────────────────┘
```

The broker is **new code in `lmnr-private`** (enterprise/cloud-only). The instance-side changes are in **`lmnr/`** (OSS) and are inert unless the instance is configured with a license key + broker base URL.

## 5. Detailed flow (direct-send)

```
 User    Self-host FE     Self-host app-srv    Laminar Broker        Slack
  │           │                  │                   │                 │
  │ click ───▶│                  │                   │                 │
  │"Connect"  │  GET /slack/start?license=…&workspaceId=…              │
  │           │──────────────────────────────────────▶                 │
  │           │            broker: authn license, mint SIGNED state    │
  │           │            = {instance_id, workspace_id, nonce, exp}   │
  │           │  302 → slack.com/oauth/v2/authorize?                    │
  │           │        client_id=X & scope=… &                         │
  │           │        redirect_uri=BROKER/cb & state=SIGNED           │
  │◀──────────┴──────────────────┴───────────────────┤                 │
  │  user picks Slack workspace, clicks "Allow" ──────────────────────▶ │
  │  302 → BROKER/cb?code=C&state=SIGNED ◀──────────────────────────────┤
  │──────────────────────────────────────────────────▶ verify state    │
  │                                                   │ POST oauth.v2.  │
  │                                                   │ access (Basic   │
  │                                                   │ X:secret, code, │
  │                                                   │ redirect_uri=cb)│
  │                                                   │────────────────▶│
  │                                                   │ {bot token,     │
  │                                                   │  team{id,name}} │
  │                                                   │◀────────────────┤
  │              broker mints ONE-TIME claim_code,                      │
  │              stores claim → {token, team, instance_id} TTL ~5 min   │
  │  302 → FE /api/integrations/slack?claim=K&team=Acme&teamId=T        │
  │◀──────────────────────────────────────────────────┤                │
  │           │  POST /redeem {claim=K}                │                │
  │           │  Authorization: <license key>          │                │
  │           │  (server→server) ─────────────────────▶│ verify license │
  │           │                  │                      │ == claim owner │
  │           │                  │  {bot token, team}   │ burn claim     │
  │           │                  │◀─────────────────────┤                │
  │           │  encrypt(token, AEAD_SECRET_KEY);                       │
  │           │  INSERT slack_integrations(token, team_id, nonce_hex)   │
  │  "Connected"◀────────────────│                                      │
  ▼           ▼                  ▼                                      ▼

 Later — UNCHANGED from today:
  signal event → notifications consumer → decode_slack_token →
  POST chat.postMessage (token + content stay in VPC) ──────────────────▶ Slack
```

### Why a one-time claim code (not the token in the redirect)
The bot token must never appear in a browser-visible URL (it would leak via logs, `Referer`, browser history). So the browser only carries a short-lived, single-use **claim code**; the customer's **app-server** redeems it **server-to-server**, authenticated by the license key. The token travels over exactly two server-to-server TLS hops (Slack→broker, broker→instance) and never through the user agent.

## 6. Components & changes

### 6.1 Broker (NEW — `lmnr-private`, cloud-only)
Three endpoints on a Laminar Cloud service that holds the official app's secrets:

- `GET /slack/start` — authenticate the license key, mint an HMAC-signed `state` (`{instance_id, workspace_id, nonce, exp}`), 302 to Slack `authorize`. `scope` = the existing set (`chat:write`, `chat:write.public`, `channels:read`, `groups:read`, `mpim:read`).
- `GET /slack/cb` — Slack's registered redirect target. Verify `state` signature + expiry, `POST oauth.v2.access` (HTTP Basic per Slack's recommendation, `redirect_uri` identical to the authorize leg), mint a one-time `claim_code` mapping `claim → {bot token, team{id,name}, instance_id}` (TTL ≈ 5 min, single use), 302 back to the instance FE callback with `claim` + display `team` only.
- `POST /slack/redeem` — authenticate license key, look up claim, **assert the claim's `instance_id` matches the caller**, return `{token, team}` and burn the claim. Strict per-instance scoping so one tenant can never redeem another's claim.

Broker also owns the app-level **Events URL** for `tokens_revoked` / `app_uninstalled` (it already does, for cloud). For direct-send these are handled lazily on the instance (§7); broker may log/metric them but needs no push channel into customer VPCs.

### 6.2 Instance frontend (`lmnr/frontend`)
- **Connect button** (`components/slack/slack-connect-button.tsx`): when in brokered mode, the href points to `${BROKER_BASE_URL}/slack/start?...` instead of `slack.com/oauth/v2/authorize`. Cloud mode keeps the direct Slack URL. Both modes coexist behind the same component.
- **Callback route** (`app/api/integrations/slack/route.ts`): currently receives `code` and calls `connectSlackIntegration`. Add a brokered branch: receive `claim`, call the new `redeemBrokeredSlackToken(claim)` action which `POST`s `/slack/redeem` with the license key, then encrypt + upsert into `slack_integrations` exactly as `connectSlackIntegration` does today. The DB write path and `slack_integrations` schema are **unchanged**.
- **Crypto** (`lib/crypto.ts`): `getSlackKeyFromEnv()` falls back to `AEAD_SECRET_KEY` when `SLACK_ENCRYPTION_KEY` is unset, so self-hosters don't set a second key. (Cloud keeps `SLACK_ENCRYPTION_KEY` explicitly.)
- **Feature gate** (`lib/features/features.ts`): replace the `ENVIRONMENT === "PRODUCTION"` clause with a brokered branch:
  ```
  SLACK enabled if:
    (cloud)     ENVIRONMENT === "PRODUCTION" && all 4 Slack vars set   // unchanged
    OR (broker) LAMINAR_LICENSE_KEY set && SLACK_BROKER_URL set         // new
  ```

### 6.3 Instance app-server (`lmnr/app-server`)
- **Sending: no change.** `notifications/slack.rs` + `notifications/delivery.rs` already decode the stored token and POST `chat.postMessage`. The token arrives via the broker but is stored identically, so the consumer is untouched.
- `decode_slack_token` reads `SLACK_ENCRYPTION_KEY`; mirror the frontend fallback to `AEAD_SECRET_KEY` so both sides agree on the key.

### 6.4 New instance configuration (the "one key")
- `LAMINAR_LICENSE_KEY` — already the enterprise credential; reused as the broker auth principal.
- `SLACK_BROKER_URL` — ships with a hardcoded default (Laminar Cloud broker), overridable for testing. Not a secret.

That's it: **the only secret a self-hoster sets is the license key they already have.**

## 7. Token lifecycle & revocation

- **Long-lived tokens**, rotation **off** (§8) — matches the current no-refresh send path.
- **Revocation / uninstall is handled lazily on the instance.** `tokens_revoked` / `app_uninstalled` land on the broker (app-level), which can't reach into the VPC. Instead, when `chat.postMessage` returns `token_revoked` / `invalid_auth` / `account_inactive`, the instance treats the integration as disconnected and deletes the `slack_integrations` row (and dependent `alert_targets` / `report_targets`, mirroring `deleteSlackIntegration`). No inbound channel into the customer network is required.
  - Today the consumer maps send failures to `HandlerError::transient` (retry). We add: classify the auth-class Slack errors as **permanent + self-heal** (delete the integration, stop retrying) rather than retrying forever.
- **Re-connect** is just the normal flow again.

## 8. Token rotation decision
Keep rotation **disabled** on the official Slack app. Enabling it makes `oauth.v2.access` return `expires_in` + `refresh_token`, and the instance send path has no refresh logic. With direct-send the refresh token would also have to live in the VPC and the instance would own refresh — significant added complexity for no current benefit. If Slack ever forces rotation, revisit (and note that only proxy-send refreshes cleanly, since the broker would own the refresh token).

## 9. Alternatives considered

- **Proxy-send (broker relays every message).** Smallest instance config (no token, no encryption key on the instance). Rejected as the headline design because **every notification's content would transit Laminar Cloud**, inverting the data-residency property these customers self-host for, making Laminar a processor of their observability data and a delivery SPOF. May be offered later as an explicit opt-in for customers who don't care, but not in this RFC.
- **Bring-your-own Slack app + manifest, 1-click.** Publish a Slack app manifest, derive `SLACK_REDIRECT_URL` from `NEXT_PUBLIC_URL`, fall back `SLACK_ENCRYPTION_KEY`→`AEAD_SECRET_KEY`, make signing secret optional. Collapses setup to ~2 secrets + 1 click, zero Laminar dependency. Good cheap baseline but still "their app, not the official one" — doesn't meet the "official app + 1 key" goal. Complementary, not a replacement.
- **Incoming-webhook URLs.** Paste a per-channel webhook; no app at all. Trivial and fully in-VPC, but loses the channel picker and the rich block UX. Keep as a no-dependency escape hatch only.

## 10. Security considerations
- **Token in transit:** only ever over server-to-server TLS (Slack→broker, broker→instance). Never in a browser URL, log, or `Referer`. At rest on the instance it's XChaCha20-encrypted (AEAD-bound to `team_id`), as today.
- **`state` integrity:** HMAC-signed, short expiry, carries no secrets — only `instance_id`/`workspace_id`/nonce. Prevents CSRF / cross-instance stitching.
- **Claim code:** single-use, short TTL, bound to `instance_id`; `/redeem` rejects a claim whose `instance_id` ≠ authenticated caller. Prevents one tenant from redeeming another's token.
- **Broker authz:** every `/slack/start` and `/slack/redeem` authenticates the license key and scopes strictly to that instance.
- **Blast radius:** a broker compromise exposes tokens only at issuance time, not the historical message stream (content never flows through the broker in direct-send).

## 11. Rollout / compatibility
- Laminar Cloud path is untouched (it keeps the four-var local config and direct Slack `authorize` URL). The broker is additive.
- Self-hosters opt in by setting `LAMINAR_LICENSE_KEY` (already have it) and adopting the default `SLACK_BROKER_URL`.
- `slack_integrations` schema, the notifications/deliveries queues, and the Rust send path are all unchanged — lowers risk and keeps the diff small.

## 12. Open questions
1. Does the existing enterprise license-key service expose an introspection/verify endpoint the broker can call, or does the broker need its own instance registry?
2. Claim-code store on the broker — reuse cloud Redis, or a dedicated short-TTL store?
3. Should the broker emit a metric/alert when it receives `tokens_revoked` for a `team_id` it can map to an instance (observability only, since handling is lazy)?
4. Do we want a manual "disconnect" on the instance to also best-effort call Slack `auth.revoke`, or just drop the local row (broker-owned app means the install lingers in the user's Slack until uninstalled there)?

## 13. Implementation sketch (follow-up PRs)
1. **`lmnr` (OSS):** crypto fallback to `AEAD_SECRET_KEY`; `Feature.SLACK` brokered branch; connect-button brokered href; `/api/integrations/slack` claim-redeem branch + `redeemBrokeredSlackToken` action; app-server auth-error self-heal in the Slack delivery handler. Gated/inert without `SLACK_BROKER_URL`.
2. **`lmnr-private` (cloud):** broker service — `/slack/start`, `/slack/cb`, `/slack/redeem`; signed-state + claim-code stores; license-key authn; wire the official app's Events URL handling for `tokens_revoked`/`app_uninstalled` (logging/metrics).
3. **Docs (`/repos/docs`):** self-hosting Slack setup ("set your license key, click Connect"), and the data-residency note (content stays in your VPC).
