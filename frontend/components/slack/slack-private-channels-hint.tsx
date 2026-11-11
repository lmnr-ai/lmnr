"use client";

import { Lock } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { track } from "@/lib/posthog";
import { cn, withBasePath } from "@/lib/utils";

interface SlackPrivateChannelsHintProps {
  workspaceId: string;
  // From the channel listing; false when the viewer hasn't linked their Slack account.
  slackLinked?: boolean;
  // Stored targets in private channels the viewer isn't a member of.
  hiddenCount?: number;
  className?: string;
}

// Private Slack channels are listed only for their members, which needs the viewer's Slack account.
export default function SlackPrivateChannelsHint({
  workspaceId,
  slackLinked,
  hiddenCount = 0,
  className,
}: SlackPrivateChannelsHintProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (slackLinked !== false && hiddenCount === 0) return null;

  const query = searchParams.toString();
  const returnPath = query ? `${pathname}?${query}` : pathname;
  const linkHref = withBasePath(
    `/api/integrations/slack/link-start?${new URLSearchParams({ workspaceId, returnPath })}`
  );

  return (
    <p className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Lock className="size-3 shrink-0 mt-0.5" />
      <span>
        {hiddenCount > 0 &&
          `Also sends to ${hiddenCount} private channel${hiddenCount === 1 ? "" : "s"} you're not a member of. `}
        {slackLinked === false && (
          <>
            To pick private channels,{" "}
            <a
              href={linkHref}
              onClick={() => track("integrations", "slack_account_link_clicked")}
              className="underline hover:text-foreground"
            >
              connect your Slack account
            </a>
            .
          </>
        )}
      </span>
    </p>
  );
}
