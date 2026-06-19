import { cn } from "@/lib/utils";

const SLACK_BORDER = "rgb(38 38 38)"; // surface-400
const SLACK_BG = "rgb(23 23 23)"; // surface-700

// Slack notification inner content. No outer frame — callers wrap it in a
// frame (static border/bg here, animated wrapper in slack-to-signal-morph).
export const SlackContent = () => (
  <div className="flex gap-3 items-start w-full px-3 pt-2 pb-3">
    <div className="shrink-0 size-8 bg-surface-900 rounded flex items-center justify-center overflow-hidden">
      <svg width="16" height="16" viewBox="0 0 76 76" fill="none" className="size-4">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
          fill="var(--color-foreground-400)"
        />
      </svg>
    </div>

    <div className="flex flex-1 flex-col gap-3 items-start min-w-0 overflow-hidden">
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center gap-1 w-full whitespace-nowrap font-sans text-xs">
          <p className="text-foreground-200">Laminar</p>
          <div className="bg-surface-400 rounded px-1 py-0.5 flex items-center justify-center">
            <p className="text-[8px] leading-none text-foreground-200">APP</p>
          </div>
          <p className="text-foreground-300">3:18 pm</p>
        </div>

        <div className="flex gap-0.5 items-center font-sans text-xs">
          <div className="bg-muted border border-surface-200 rounded px-1.5 py-px">
            <p className="text-primary-400/60 whitespace-nowrap">Failure</p>
          </div>
          <p className="text-foreground-200 whitespace-nowrap">: New Event</p>
        </div>
      </div>

      <p className="font-sans text-xs leading-relaxed text-foreground-200 w-full">
        Agent run flagged 4 issues. In one anthropic.messages the agent decided to run <code>python</code> (macOS only
        ships <code>python3</code>), Bash then hit <code>command not found</code> three times before recovering, a
        parallel Bash pair cascade-cancelled, and Read missed when the shell CWD drifted after a <code>cd</code>.
      </p>

      <div className="flex flex-row gap-2 items-center">
        <div className="bg-surface-400 px-2 py-1 rounded">
          <p className="font-sans text-xs text-foreground-200">View Trace</p>
        </div>
        <div className="bg-surface-400 px-2 py-1 rounded">
          <p className="font-sans text-xs text-foreground-200">View similar events</p>
        </div>
      </div>
    </div>
  </div>
);

interface Props {
  className?: string;
}

// Static slack-notification card (no morph). Used on mobile where each card
// is rendered standalone instead of cross-fading via the morph wrapper.
const SlackNotificationCard = ({ className }: Props) => (
  <div
    style={{ borderColor: SLACK_BORDER, backgroundColor: SLACK_BG }}
    className={cn("rounded-md border overflow-hidden", className)}
  >
    <SlackContent />
  </div>
);

export default SlackNotificationCard;
