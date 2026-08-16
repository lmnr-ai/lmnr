"use client";

import { type ReactNode, useRef } from "react";

import { cn } from "@/lib/utils";

import { useStreamIn } from "../../use-stream-in";
import { LaminarAppAvatar, SLACK_BG, SLACK_BORDER } from "../slack-notification-card";
import { THREAD_AUTHOR, THREAD_CHANNEL, THREAD_MESSAGES, type ThreadMessage } from "./messages";

/** Beat between messages. Long enough to register each one as it lands. */
const MESSAGE_MS = 1800;

const INITIALS = THREAD_AUTHOR.split(" ")
  .map((part) => part[0])
  .join("");

const UserAvatar = () => (
  <div className="shrink-0 size-8 rounded bg-surface-300 flex items-center justify-center">
    <span className="text-[11px] font-medium text-foreground-200">{INITIALS}</span>
  </div>
);

const MessageRow = ({ author, time, body }: ThreadMessage) => (
  <div className="flex gap-3 items-start w-full">
    {author === "app" ? <LaminarAppAvatar /> : <UserAvatar />}
    <div className="flex flex-1 flex-col gap-1 min-w-0">
      {/* White, a step above the foreground-200 body, so the meta row reads as
          a label on the message rather than its first line. */}
      <div className="flex items-center gap-1 whitespace-nowrap text-xs text-white">
        <p className="font-medium">{author === "app" ? "Laminar" : THREAD_AUTHOR}</p>
        {author === "app" && (
          <div className="rounded bg-surface-400 px-1 py-0.5">
            <p className="text-[8px] leading-none text-foreground-300">APP</p>
          </div>
        )}
        <p>{time}</p>
      </div>
      <div className="text-xs leading-relaxed text-foreground-200">{body}</div>
    </div>
  </div>
);

// The window chrome. `pt` only: each row carries its own `pb-4`, which doubles
// as the card's bottom padding.
const ThreadWindow = ({ children }: { children: ReactNode }) => (
  <div
    style={{ borderColor: SLACK_BORDER, backgroundColor: SLACK_BG }}
    className="w-full rounded-md border font-sans overflow-hidden"
  >
    <div style={{ borderColor: SLACK_BORDER }} className="flex items-center justify-between border-b px-4 py-2.5">
      <p className="text-sm font-medium text-white">{THREAD_CHANNEL}</p>
      <p className="text-xs text-foreground-300">Thread</p>
    </div>
    <div className="flex flex-col px-4 pt-4">{children}</div>
  </div>
);

// A Slack thread: the new-cluster alert as the parent message, then the
// mention-driven Q&A the agent answers in-thread. Thread view (rather than a
// channel with a "N replies" stub) because that is where the agent's replies
// actually land — it posts with the parent's `thread_ts`.
//
// The window is a FIXED size: every message occupies its space from the start
// and only fades in, so the card never resizes as the thread fills and nothing
// on the page below it reflows.
const SlackThread = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  // The first message is visible the moment the thread scrolls in, so the walk
  // only has to cover the remaining ones.
  const revealed = useStreamIn(frameRef, { steps: THREAD_MESSAGES.length - 1, stepMs: MESSAGE_MS });

  return (
    <div ref={frameRef} className="w-full">
      <ThreadWindow>
        {THREAD_MESSAGES.map((message, i) => (
          <div
            key={i}
            aria-hidden={revealed < i}
            className={cn(
              "pb-4 transition-opacity duration-500 ease-out",
              revealed >= i ? "opacity-100" : "opacity-0"
            )}
          >
            <MessageRow {...message} />
          </div>
        ))}
      </ThreadWindow>
    </div>
  );
};

export default SlackThread;
