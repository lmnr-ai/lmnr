import { strict as assert } from "node:assert";
import { test } from "node:test";

import { renderToStaticMarkup } from "react-dom/server";

import { LAMINAR_LOGO_CID } from "../lib/emails/report-email-layout";
import { WELCOME_BANNER_CID } from "../lib/emails/welcome-email";
import WorkspaceInviteEmail from "../lib/emails/workspace-invite";

test("invite follows the welcome layout with live workspace text and the real invite link", () => {
  const html = renderToStaticMarkup(
    WorkspaceInviteEmail({ workspaceName: "Example Workspace", inviteLink: "https://lmnr.ai/invitations/example" })
  );

  assert.match(html, /max-width:500px/);
  assert.match(html, /height:160px;padding:16px 20px 12px/);
  assert.ok(html.includes(`background="cid:${WELCOME_BANNER_CID}"`));
  assert.ok(html.includes(`src="cid:${LAMINAR_LOGO_CID}"`));
  assert.match(html, /Join Example Workspace on Laminar!/);
  assert.match(html, /This invitation will expire in 7 days/);
  assert.match(html, /background-color:#fda476/);
  assert.match(html, /padding:14px 24px/);
  assert.match(html, /href="https:\/\/lmnr.ai\/invitations\/example"/);
  assert.match(html, /href="mailto:founders@lmnr.ai"/);
});

test("workspace name renders as text rather than HTML", () => {
  const html = renderToStaticMarkup(WorkspaceInviteEmail({ workspaceName: "<Team>", inviteLink: "https://lmnr.ai/i" }));
  assert.ok(html.includes("&lt;Team&gt;"));
  assert.ok(!html.includes("<Team>"));
});
