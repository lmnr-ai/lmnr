import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeGrant,
  encodeGrant,
  type GroupRole,
  type MembershipRow,
  missingWorkspaceNames,
  parseLaminarGroup,
  planMembershipSync,
  resolveGrants,
} from "@/lib/auth-okta/plan";
import { type WorkspaceRole } from "@/lib/workspaces/types";

describe("parseLaminarGroup", () => {
  it("parses a workspace-level group", () => {
    assert.deepEqual(parseLaminarGroup("laminar:staging:acme:admin"), {
      workspaceName: "acme",
      role: "admin",
    });
  });

  it("parses a project-level group", () => {
    assert.deepEqual(parseLaminarGroup("laminar:prod:acme:Acme Assistant:member"), {
      workspaceName: "acme",
      projectName: "Acme Assistant",
      role: "member",
    });
  });

  it("is case-insensitive on prefix and role and trims segments", () => {
    assert.deepEqual(parseLaminarGroup("Laminar:PROD: Bill Pay :Admin"), {
      workspaceName: "Bill Pay",
      role: "admin",
    });
  });

  const rejected = [
    "laminar:prod:acme:owner",
    "laminar:prod:acme:viewer",
    "laminar:prod:admin",
    "laminar:prod:acme:a:b:admin",
    "laminar:prod::admin",
    "laminar::acme:admin",
    "lmnr:prod:acme:admin",
    "Everyone",
  ];

  for (const group of rejected) {
    it(`ignores ${JSON.stringify(group)}`, () => {
      assert.equal(parseLaminarGroup(group), null);
    });
  }
});

describe("grant slugs", () => {
  it("round-trips workspace names, including ones with ':'", () => {
    for (const grant of [
      { workspaceName: "Bill Pay", role: "admin" as const },
      { workspaceName: "a:b", role: "member" as const },
    ]) {
      assert.deepEqual(decodeGrant(encodeGrant(grant)), grant);
    }
  });

  it("rejects malformed slugs", () => {
    for (const slug of ["admin", "owner:acme", "viewer:acme", "member:", "member:  "]) {
      assert.equal(decodeGrant(slug), null);
    }
  });
});

describe("missingWorkspaceNames", () => {
  it("returns names with no workspace once each, keeping the first spelling", () => {
    assert.deepEqual(
      missingWorkspaceNames(
        [
          { workspaceName: "acme", role: "member" },
          { workspaceName: " Bill Pay ", role: "member" },
          { workspaceName: "bill pay", role: "admin" },
        ],
        [{ name: "Acme" }]
      ),
      ["Bill Pay"]
    );
  });
});

describe("resolveGrants", () => {
  const workspaces = [
    { id: "ws-acme", name: "Acme" },
    { id: "ws-billpay", name: " Bill Pay" },
    { id: "ws-dup-1", name: "Audit" },
    { id: "ws-dup-2", name: "audit" },
  ];

  it("matches workspace names case-insensitively and keeps the highest role", () => {
    const { desired } = resolveGrants(
      [
        { workspaceName: "acme", role: "member" },
        { workspaceName: "ACME", role: "admin" },
        { workspaceName: "acme", role: "member" },
        { workspaceName: "bill pay", role: "member" },
      ],
      workspaces
    );
    assert.deepEqual(
      desired,
      new Map<string, GroupRole>([
        ["ws-acme", "admin"],
        ["ws-billpay", "member"],
      ])
    );
  });

  it("grants nothing for ambiguous names", () => {
    const result = resolveGrants([{ workspaceName: "audit", role: "admin" }], workspaces);
    assert.equal(result.desired.size, 0);
    assert.deepEqual(result.ambiguous, ["audit"]);
  });
});

describe("planMembershipSync", () => {
  const row = (workspaceId: string, memberRole: WorkspaceRole): MembershipRow => ({ workspaceId, memberRole });

  it("inserts new grants, updates roles and removes memberships no group grants", () => {
    const plan = planMembershipSync(
      [row("ws-a", "member"), row("ws-b", "member")],
      new Map<string, GroupRole>([
        ["ws-a", "admin"],
        ["ws-c", "member"],
      ])
    );
    assert.deepEqual(plan, {
      insert: [{ workspaceId: "ws-c", role: "member" }],
      updateRole: [{ workspaceId: "ws-a", role: "admin" }],
      remove: ["ws-b"],
    });
  });

  it("treats pre-SSO owners like any other membership", () => {
    const plan = planMembershipSync(
      [row("ws-a", "owner"), row("ws-b", "owner")],
      new Map<string, GroupRole>([["ws-a", "admin"]])
    );
    assert.deepEqual(plan, { insert: [], updateRole: [{ workspaceId: "ws-a", role: "admin" }], remove: ["ws-b"] });
  });
});
