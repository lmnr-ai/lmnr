'use client';

import { useRouter } from 'next/navigation';

import { Label } from '../ui/label';

interface ProjectUsageBannerProps {
  workspaceId: string;
  spansThisMonth: number;
  spansLimit: number;
}

export default function ProjectUsageBanner({
  workspaceId,
  spansThisMonth,
  spansLimit
}: ProjectUsageBannerProps) {
  const router = useRouter();
  return (
    <div
      className="flex w-full bg-yellow-600 cursor-pointer"
      onClick={() => router.push(`/workspace/${workspaceId}/`)}
    >
      <Label className="p-2 text-sm cursor-pointer">
        {'You have used  ' +
          `${((spansThisMonth / spansLimit) * 100).toFixed(1)}% of free tier limit. ` +
          'Upgrade to pro tier for uninterrupted experience.'}
      </Label>
    </div>
  );
}
