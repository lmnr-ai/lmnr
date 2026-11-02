export const SLACK_BORDER = "rgb(38 38 38)"; // surface-500
export const SLACK_BG = "rgb(23 23 23)"; // surface-350

// The Laminar mark as it appears as a Slack app avatar. Shared with the
// ask-in-slack thread mock so both surfaces show the same bot.
export const LaminarAppAvatar = () => (
  <div className="shrink-0 size-8 bg-surface-200 rounded flex items-center justify-center overflow-hidden">
    <svg width="20" height="20" viewBox="0 0 76 76" fill="none" className="size-5">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
        fill="var(--color-foreground-200)"
      />
    </svg>
  </div>
);
