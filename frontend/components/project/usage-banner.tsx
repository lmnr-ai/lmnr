'use client';

import { useRouter } from 'next/navigation';

import { Label } from '../ui/label';

interface ProjectUsageBannerProps {
  workspaceId: string;
  spansThisMonth: number;
  spansLimit: number;
  agentStepsThisMonth: number;
  agentStepsLimit: number;
}

export default function ProjectUsageBanner({
  workspaceId,
  spansThisMonth,
  spansLimit,
  agentStepsThisMonth,
  agentStepsLimit,
}: ProjectUsageBannerProps) {
  const router = useRouter();

  const spanPercentage = spansLimit > 0 ? (spansThisMonth / spansLimit) * 100 : 0;
  const agentStepPercentage = agentStepsLimit > 0 ? (agentStepsThisMonth / agentStepsLimit) * 100 : 0;

  let usageStrings = [];
  if (spansLimit > 0) {
    usageStrings.push(`${spanPercentage.toFixed(1)}% of your trace usage limit`);
  }
  if (agentStepsLimit > 0) {
    usageStrings.push(`${agentStepPercentage.toFixed(1)}% of your agent steps limit`);
  }

  let messageContent = "";
  if (usageStrings.length > 0) {
    messageContent = `You've used ${usageStrings.join(' and ')}. Upgrade your workspace for an uninterrupted experience.`;
  } else {
    // Fallback if no limits are set, though the banner might not be shown by parent in this case.
    messageContent = "Review your workspace settings for usage details.";
  }

  return (
    <div
      className="flex w-full bg-yellow-600 cursor-pointer"
      onClick={() => router.push(`/workspace/${workspaceId}/`)}
    >
      <Label className="p-2 text-sm cursor-pointer">
        {messageContent}
      </Label>
    </div>
  );
}
