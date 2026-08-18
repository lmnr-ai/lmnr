"use client";

import { motion } from "framer-motion";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";

import { LaminarAppAvatar, SLACK_BG, SLACK_BORDER } from "../slack-notification-card";
import { THREAD_AUTHOR, THREAD_CHANNEL, THREAD_MESSAGES, type ThreadMessage } from "./messages";
import { useMessageCascade } from "./use-message-cascade";

// Beat before a message lands: a fixed pause plus reading time for the message
// above it, so the thread breathes the way a channel does instead of ticking.
// `lines` is that message's rendered height — see ./messages.
/** Pause every message gets, whatever is above it. */
const BEAT_MS = 700;
/** Reading time added per line of the message above. */
const PER_LINE_MS = 190;
/** Ceiling, so the longest message can't strand the reader on a static card. */
const MAX_BEAT_MS = 2600;

/** One entry per gap: how long the message AFTER index i waits. */
const MESSAGE_DELAYS = THREAD_MESSAGES.slice(0, -1).map((message) =>
  Math.min(BEAT_MS + message.lines * PER_LINE_MS, MAX_BEAT_MS)
);

const INITIALS = THREAD_AUTHOR.split(" ")
  .map((part) => part[0])
  .join("");

const UserAvatar = () => (
  <div className="shrink-0 size-8 rounded bg-surface-350 flex items-center justify-center">
    <span className="text-[11px] font-medium text-foreground-200">{INITIALS}</span>
  </div>
);

const MessageRow = ({ author, time, body }: Omit<ThreadMessage, "lines">) => (
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
const WINDOW_H = 602;

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
// The window is a FIXED height, so the card never resizes as the channel fills
// and nothing on the page below it reflows. Messages MOUNT as they arrive
// rather than sitting at opacity 0: held in layout they reserved the whole
// thread's height from the first frame, which left the window scrollable over
// blank space before there was anything to scroll.
const SlackThread = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The first message is visible the moment the thread scrolls in, so the walk
  // only has to cover the remaining ones.
  const revealed = useMessageCascade(frameRef, MESSAGE_DELAYS);

  // Follow the newest message, the way a channel does. Only ever scrolls down,
  // and only once the thread is long enough that the new row is past the
  // bottom edge — until then the window simply fills.
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
        {THREAD_MESSAGES.slice(0, revealed + 1).map((message, i) => (
          // Framer rather than a CSS transition: a class toggled on mount has
          // no starting frame to animate from. The first message is already on
          // screen when the thread scrolls in, so it gets no enter at all.
          <motion.div
            key={i}
            initial={i === 0 ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="pb-4"
          >
            <MessageRow {...message} />
          </motion.div>
        ))}
      </ThreadWindow>
    </div>
  );
};

export default SlackThread;
