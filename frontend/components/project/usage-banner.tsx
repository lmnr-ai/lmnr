'use client';

import { useRouter } from 'next/navigation';

import { Label } from '../ui/label';

interface ProjectUsageBannerProps {
  workspaceId: string;
  gbUsedThisMonth: number;
  gbLimit: number;
}

export default function ProjectUsageBanner({
  workspaceId,
  gbUsedThisMonth,
  gbLimit,
}: ProjectUsageBannerProps) {
  const router = useRouter();

  const dataPercentage = gbLimit > 0 ? (gbUsedThisMonth / gbLimit) * 100 : 0;

  let usageStrings = [];
  if (gbLimit > 0) {
    usageStrings.push(`${dataPercentage.toFixed(1)}% of your data usage limit`);
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
