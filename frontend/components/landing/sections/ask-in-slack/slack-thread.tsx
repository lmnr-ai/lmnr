"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { LaminarAppAvatar, SLACK_BG, SLACK_BORDER } from "../slack-notification-card";
import { THREAD_AUTHOR, THREAD_CHANNEL, THREAD_MESSAGES, type ThreadMessage } from "./messages";
import { useMessageCascade } from "./use-message-cascade";

// One entry per gap: how long the message AFTER index i waits. Raw numbers
// hand-set per message from its word count — see `gapAfterMs` in ./messages.
const MESSAGE_DELAYS = THREAD_MESSAGES.slice(0, -1).map((message) => message.gapAfterMs);

const INITIALS = THREAD_AUTHOR.split(" ")
  .map((part) => part[0])
  .join("");

const UserAvatar = () => (
  <div className="shrink-0 size-8 rounded bg-surface-350 flex items-center justify-center">
    <span className="text-[11px] font-medium text-foreground-200">{INITIALS}</span>
  </div>
);

const MessageRow = ({ author, time, body }: Omit<ThreadMessage, "gapAfterMs">) => (
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

// The alerts channel: a notification, the digest it rolls up into, then the
// mention-driven Q&A — shown flat rather than threaded, the only way to fit both
// in one frame. The window is a FIXED height so nothing below reflows, and
// messages MOUNT as they arrive rather than sitting at opacity 0.
const SlackThread = () => {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hold until the frame's BOTTOM edge clears the fold, so the whole window is
  // on screen before anything moves in it — the thread is the tallest mock on
  // the page, and starting it as the top edge appears spends the run below the
  // fold. "end end" IS that moment (element end meets viewport end), so the
  // range simply leaves 0 there and no threshold has to be guessed. The
  // surrounding panel is padded evenly, so this measures for it too.
  const { scrollYProgress } = useScroll({ target: frameRef, offset: ["end end", "end start"] });
  const [framed, setFramed] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (p > 0) setFramed(true);
  });
  // "change" only fires on a CHANGE, so a reload landing past the mark would
  // otherwise never arm. Deferred a frame so the observer has measured.
  useEffect(() => {
    const id = requestAnimationFrame(() => setFramed((on) => on || scrollYProgress.get() > 0));
    return () => cancelAnimationFrame(id);
  }, [scrollYProgress]);

  // The first message is visible the moment the thread arrives, so the walk
  // only has to cover the remaining ones.
  const revealed = useMessageCascade(framed, MESSAGE_DELAYS);

  // Follow the newest message, but only downward and only once the thread is
  // long enough to need it. Hand-rolled rather than `scrollIntoView`, which
  // walks up and scrolls every ancestor including the page.
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
            initial={i === 0 ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            // Long tail (expo-style ease-out): most of the travel lands early,
            // then it settles gently instead of popping to a stop.
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
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
