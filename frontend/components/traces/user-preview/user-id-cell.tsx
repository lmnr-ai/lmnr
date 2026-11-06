"use client";

import { useParams } from "next/navigation";

import UserPreview from "@/components/traces/user-preview";
import Mono from "@/components/ui/mono";

/** User ID table cell with a hover card of the user's activity. */
export default function UserIdCell({ userId }: { userId?: string | null }) {
  const { projectId } = useParams();
  if (!userId || userId === "-" || userId === "<null>") return <span className="text-foreground-300">-</span>;

  return (
    <UserPreview projectId={String(projectId)} userId={userId} side="right">
      <Mono className="block truncate text-xs">{userId}</Mono>
    </UserPreview>
  );
}
