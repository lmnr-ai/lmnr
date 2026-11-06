"use client";

import { type ReactNode } from "react";

import HoverPreview from "@/components/traces/hover-preview";

import UserPreviewContent from "./content";

interface UserPreviewProps {
  projectId: string;
  userId: string;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}

/** Hovering `children` shows the user's sessions, traces, and first/last seen. */
export default function UserPreview({ projectId, userId, side, children }: UserPreviewProps) {
  return (
    <HoverPreview side={side} content={() => <UserPreviewContent projectId={projectId} userId={userId} />}>
      {children}
    </HoverPreview>
  );
}
