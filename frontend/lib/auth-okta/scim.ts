import { queueAfterTransactionHook } from "@better-auth/core/context";
import { scim, type SCIMIdentity, type SCIMProjection } from "@better-auth/scim";

import { getAuthTransaction } from "@/lib/auth-db";

import { OKTA_PROVIDER_ID, OKTA_SCIM_CONNECTION_ID } from "./constants";
import { invalidateMembershipCaches, reconcileWorkspaceMemberships } from "./memberships";
import { decodeGrant, encodeGrant, parseLaminarGroup, type WorkspaceGrant } from "./plan";

// Okta's SCIM externalId is the Okta user id, which is also the OIDC `sub` stored as
// accounts.account_id, so users who already signed in are adopted exactly. The email
// fallback trusts the org's own bearer-authenticated Okta, the same trust as the
// `trustedProviders` linking on sign-in.
const resolveUser: NonNullable<SCIMIdentity["resolveUser"]> = async ({ resource }, { database }) => {
  if (resource.externalId) {
    const account = await database.findOne<{ userId: string }>({
      model: "account",
      where: [
        { field: "providerId", value: OKTA_PROVIDER_ID },
        { field: "accountId", value: resource.externalId },
      ],
    });
    if (account) return { action: "link", userId: account.userId, profile: "manage" };
  }

  const user = await database.findOne<{ id: string }>({
    model: "user",
    where: [{ field: "email", value: resource.primaryEmail.toLowerCase() }],
  });
  if (user) return { action: "link", userId: user.id, profile: "manage" };

  return { action: "create" };
};

const projection: SCIMProjection = {
  roles: {
    // Project-scoped groups map to nothing until project-level access exists; never widen
    // them to workspace membership.
    map: ({ source }) => {
      const group = parseLaminarGroup(source.displayName);
      if (!group || group.projectName !== undefined) return undefined;
      return [encodeGrant(group)];
    },
    exists: ({ role }) => decodeGrant(role) !== null,
  },
  reconcileUser: async ({ userId, grants }) => {
    const workspaceGrants = grants
      .map((grant) => decodeGrant(grant.role))
      .filter((grant): grant is WorkspaceGrant => grant !== null);

    const changed = await reconcileWorkspaceMemberships(getAuthTransaction(), userId, workspaceGrants);
    if (changed.length === 0) return;

    await queueAfterTransactionHook(() => invalidateMembershipCaches(userId, changed), {
      onError: (e) => console.error(`Failed to invalidate membership caches for user ${userId}`, e),
    });
  },
};

export const oktaSCIM = () =>
  scim({
    connections: [
      {
        id: OKTA_SCIM_CONNECTION_ID,
        credentials: [{ type: "bearer", id: "env", token: process.env.AUTH_OKTA_SCIM_TOKEN! }],
      },
    ],
    identity: { resolveUser },
    projection,
  });
