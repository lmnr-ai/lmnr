"use client";

import { type ReactNode, type RefObject, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import { useStreamIn } from "../../use-stream-in";
import { LaminarAppAvatar, SLACK_BG, SLACK_BORDER } from "../slack-notification-card";
import { THREAD_AUTHOR, THREAD_CHANNEL, THREAD_MESSAGES, type ThreadMessage } from "./messages";

/** Beat between messages. Long enough to register each one as it lands. */
const MESSAGE_MS = 1200;

const INITIALS = THREAD_AUTHOR.split(" ")
  .map((part) => part[0])
  .join("");

const UserAvatar = () => (
  <div className="shrink-0 size-8 rounded bg-surface-350 flex items-center justify-center">
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
          <div className="rounded bg-surface-300 px-1 py-0.5">
            <p className="text-[8px] leading-none text-foreground-300">APP</p>
          </div>
        )}
        <p>{time}</p>
      </div>
      <div className="text-xs leading-relaxed text-foreground-200">{body}</div>
    </div>
  </div>
);

/** The window's fixed height. The thread is taller than this, which is the
 *  point — it scrolls, the way a real channel does, instead of the card
 *  growing to whatever the copy happens to need. */
const WINDOW_H = 548;

// The window chrome. `pt` only: each row carries its own `pb-4`, which doubles
// as the scroll area's bottom padding.
const ThreadWindow = ({
  scrollRef,
  children,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) => (
  <div
    style={{ borderColor: SLACK_BORDER, backgroundColor: SLACK_BG, height: WINDOW_H }}
    className="w-full rounded-md border font-sans overflow-hidden flex flex-col"
  >
    <div
      style={{ borderColor: SLACK_BORDER }}
      className="shrink-0 flex items-center justify-between border-b px-4 py-2.5"
    >
      <p className="text-sm font-medium text-white">{THREAD_CHANNEL}</p>
    </div>
    <div
      ref={scrollRef}
      // See the debugger terminal's twin of this: `overflow-y-hidden` stops the
      // reader scrolling the thread on touch while the follow-the-newest-message
      // `scrollTo` keeps working.
      className="scrollbar-none flex flex-1 min-h-0 flex-col overflow-y-hidden md:overflow-y-auto px-4 pt-4 scroll-smooth scroll-fade-y"
    >
      {children}
    </div>
  </div>
);

// The alerts channel: a signal-event notification, the new-cluster digest it
// rolls up into, then the mention-driven Q&A the agent answers. The Q&A really
// lands in a thread off the cluster alert (the agent posts with the parent's
// `thread_ts`), so showing it flat here is a landing liberty — it is the only
// way to show the alert and the conversation about it in one frame.
//
// The window is a FIXED height and every message occupies its space from the
// start, so the card never resizes as the channel fills and nothing on the
// page below it reflows. Messages only fade in; the scroll follows.
const SlackThread = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The first message is visible the moment the thread scrolls in, so the walk
  // only has to cover the remaining ones.
  const revealed = useStreamIn(frameRef, { steps: THREAD_MESSAGES.length - 1, stepMs: MESSAGE_MS });

  // Follow the newest message, the way a channel does. Every row is already in
  // layout (they are only faded), so the scroll height never changes — this is
  // purely moving the viewport onto the message that just appeared.
  //
  // Hand-rolled rather than `scrollIntoView`, which walks up and scrolls every
  // scrollable ancestor including the page.
  useEffect(() => {
    const el = scrollRef.current;
    const row = el?.children[revealed] as HTMLElement | undefined;
    if (!el || !row) return;
    const target = row.offsetTop + row.offsetHeight - el.clientHeight;
    if (target > el.scrollTop) el.scrollTo({ top: target, behavior: "smooth" });
  }, [revealed]);

  return (
    <div ref={frameRef} className="w-full">
      <ThreadWindow scrollRef={scrollRef}>
        {THREAD_MESSAGES.map((message, i) => (
          <div
            key={i}
            aria-hidden={revealed < i}
            className={cn("pb-4 transition-opacity duration-500 ease-out", revealed >= i ? "opacity-100" : "opacity-0")}
          >
            <MessageRow {...message} />
          </div>
        ))}
      </ThreadWindow>
    </div>
  );
};

export default SlackThread;
