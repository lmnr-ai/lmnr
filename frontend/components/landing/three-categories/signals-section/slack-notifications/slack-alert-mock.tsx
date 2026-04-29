import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const SlackAlertMock = ({ className }: Props) => (
  <div
    className={cn(
      "flex gap-3 items-start overflow-hidden rounded border border-landing-surface-500 px-4 py-3 bg-landing-surface-600",
      className
    )}
  >
    <div className="shrink-0 size-8 bg-landing-surface-700 rounded flex items-center justify-center">
      <svg width="60" height="60" viewBox="0 0 76 76" fill="none" className="size-4">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M1.32507 73.4886C0.00220402 72.0863 0.0802819 69.9867 0.653968 68.1462C3.57273 58.7824 5.14534 48.8249 5.14534 38.5C5.14534 27.8899 3.48464 17.6677 0.408998 8.0791C-0.129499 6.40029 -0.266346 4.50696 0.811824 3.11199C2.27491 1.21902 4.56777 0 7.14535 0H37.1454C58.1322 0 75.1454 17.0132 75.1454 38C75.1454 58.9868 58.1322 76 37.1454 76H7.14535C4.85185 76 2.78376 75.0349 1.32507 73.4886Z"
          fill="var(--color-landing-text-400)"
        />
      </svg>
    </div>

    <div className="flex flex-1 flex-col gap-1 items-start justify-center min-w-0">
      <div className="flex items-start justify-between w-full whitespace-nowrap font-sans text-xs">
        <p className="text-landing-text-200">Laminar</p>
        <p className="text-landing-text-300">3:18 pm</p>
      </div>
      <div className="flex gap-1 items-start w-full">
        <p className="font-sans text-xs text-landing-text-400 whitespace-nowrap">Event:</p>
        <div className="bg-landing-surface-500 flex items-center justify-center px-2 rounded shrink-0">
          <p className="font-sans text-xs text-[rgba(208,117,78,0.6)] whitespace-nowrap">Agent failure</p>
        </div>
      </div>
      <div className="flex gap-1 items-start w-full">
        <p className="font-sans text-xs text-landing-text-400 whitespace-nowrap">Category:</p>
        <div className="bg-landing-surface-500 flex items-center justify-center px-2 rounded shrink-0">
          <p className="font-sans text-xs text-[rgba(208,117,78,0.6)] whitespace-nowrap">logic_error</p>
        </div>
      </div>
      <p className="font-sans text-xs text-landing-text-400 w-full">
        Description:
        <br />
        {`The LLM in the 'refine_report' task failed to follow the instruction to keep the summary to 3-4 sentences.`}
      </p>
    </div>
  </div>
);

export default SlackAlertMock;
