import assert from "node:assert/strict";
import test from "node:test";

import { parseNotificationAttribution } from "../lib/posthog/notification-attribution";

test("reads notification UTM attributes for PostHog", () => {
  assert.deepEqual(
    parseNotificationAttribution(
      "?clusterId=cluster-1&utm_source=email&utm_medium=notification&utm_campaign=new_cluster_alert&utm_content=view_cluster"
    ),
    {
      $utm_source: "email",
      $utm_medium: "notification",
      $utm_campaign: "new_cluster_alert",
      $utm_content: "view_cluster",
    }
  );
});

test("ignores incomplete or non-notification attribution", () => {
  assert.equal(parseNotificationAttribution("?utm_source=email&utm_medium=marketing"), null);
  assert.equal(parseNotificationAttribution("?utm_source=email&utm_medium=notification"), null);
});
