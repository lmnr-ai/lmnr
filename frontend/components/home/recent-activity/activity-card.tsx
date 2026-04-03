"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { type ActivityNotification } from "./dummy-data";

const BAR_HEIGHTS = [10, 20, 14, 10, 23, 9, 29, 10, 20, 3, 41];

interface ActivityCardProps {
  notification: ActivityNotification;
  onDismiss: (id: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export default function ActivityCard({ notification, onDismiss, isExpanded, onToggleExpand }: ActivityCardProps) {
  const { projectId } = useParams();

  return (
    <div className="relative w-[350px] shrink-0">
      {/* Collapsed card */}
      <div
        className="bg-secondary border border-primary/30 rounded-xl flex flex-col gap-3 items-end pb-[18px] pt-[14px] px-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <CardHeader notification={notification} onDismiss={onDismiss} />
        <CardFooter notification={notification} projectId={projectId as string} variant="collapsed" />
      </div>

      {/* Expanded overlay */}
      {isExpanded && (
        <div
          className="absolute -left-px -bottom-px w-[calc(100%+2px)] z-10 border border-primary/30 rounded-xl flex flex-col gap-4 items-end pb-[18px] pt-[14px] px-4 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.5)] cursor-pointer"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(34, 34, 38, 0.75) 0%, rgba(34, 34, 38, 0.75) 100%), linear-gradient(90deg, hsl(var(--secondary)) 0%, hsl(var(--secondary)) 100%)",
          }}
          onClick={onToggleExpand}
        >
          <CardHeader notification={notification} onDismiss={onDismiss} />
          <div className="bg-muted border border-border rounded-lg p-2 flex-1 w-full relative">
            <p className="text-base font-medium text-secondary-foreground absolute top-1 left-2">
              {notification.eventCount} events
            </p>
            <div className="flex gap-1 items-end justify-center w-full h-full pt-6">
              {BAR_HEIGHTS.map((height, i) => (
                <div key={i} className="flex-1 rounded-sm bg-[rgba(193,122,255,0.75)]" style={{ height }} />
              ))}
            </div>
          </div>
          <CardFooter notification={notification} projectId={projectId as string} variant="expanded" />
        </div>
      )}
    </div>
  );
}

function CardHeader({
  notification,
  onDismiss,
}: {
  notification: ActivityNotification;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="flex gap-0.5 items-start w-full">
      <div className="flex-1 flex flex-col gap-0.5 items-start">
        {notification.type === "new_signal" ? (
          <>
            <p className="text-xs leading-4 text-primary">New signal</p>
            <p className="text-base font-medium leading-5 text-foreground">{notification.title}</p>
          </>
        ) : (
          <>
            <div className="flex gap-1 items-center">
              <p className="text-xs leading-4 text-primary whitespace-nowrap">New cluster in signal</p>
              <span className="bg-muted border border-border rounded-sm px-1 text-[10px] leading-4 text-muted-foreground whitespace-nowrap">
                {notification.signalName}
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: notification.clusterColor }} />
              <p className="text-base font-medium leading-5 text-foreground">{notification.title}</p>
            </div>
          </>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(notification.id);
        }}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <X size={20} />
      </button>
    </div>
  );
}

function CardFooter({
  notification,
  projectId,
  variant,
}: {
  notification: ActivityNotification;
  projectId: string;
  variant: "collapsed" | "expanded";
}) {
  return (
    <div className="flex items-center justify-between w-full">
      <p className="text-xs leading-[18px] text-muted-foreground">{notification.timeAgo}</p>
      <div className="flex gap-2 items-center">
        {notification.type === "new_signal" && variant === "collapsed" && (
          <button
            onClick={(e) => e.stopPropagation()}
            className="border border-[#555] rounded px-2 py-1 text-xs leading-4 text-foreground hover:bg-muted transition-colors"
          >
            Delete
          </button>
        )}
        <Link
          href={`/project/${projectId}/signals`}
          onClick={(e) => e.stopPropagation()}
          className={`${variant === "expanded" ? "bg-primary" : "bg-muted"} rounded px-3 py-1.5 text-xs leading-4 text-foreground hover:opacity-90 transition-opacity`}
        >
          Open in Signals
        </Link>
      </div>
    </div>
  );
}
