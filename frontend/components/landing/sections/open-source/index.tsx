import { subSection } from "../../class-names";
import Terminal from "./terminal";

interface Step {
  label: string;
  /** The shell line or URL under the label. The last step has none. */
  command?: string;
}

const STEPS: Step[] = [
  { label: "Clone the repo", command: "git clone https://github.com/lmnr-ai/lmnr" },
  { label: "Start the stack", command: "cd lmnr && docker compose up -d" },
  { label: "Open in browser", command: "http://localhost:5667" },
  { label: "Create a project and onboard" },
];

// 24px badge, 16px from its step's text column, matching the frame.
const StepRow = ({ index, label, command }: Step & { index: number }) => (
  <div className="flex gap-4 items-start w-full">
    <div className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-500">
      <span className="text-sm leading-6 text-foreground-200">{index + 1}</span>
    </div>
    <div className="flex flex-1 min-w-0 flex-col gap-2 items-start">
      <p className="text-lg leading-6 text-foreground-200">{label}</p>
      {command && (
        <div className="w-full rounded-sm bg-surface-600 px-3 py-2">
          <p className="font-mono font-light text-xs leading-4 text-foreground-300">{command}</p>
        </div>
      )}
    </div>
  </div>
);

const OpenSource = () => (
  <section className="flex flex-col items-start gap-10 w-full">
    <h2 className={subSection}>Self-host anywhere</h2>

    <div className="flex flex-col md:flex-row gap-10 items-start w-full">
      {/* LEFT — the four setup steps. 342 + 40 gap + 498 = the 880 column, and
          the pb-6 is the frame's: it is what makes this column finish level
          with the panel beside it. */}
      <div className="flex w-full md:w-[342px] shrink-0 flex-col gap-8 items-start pb-6">
        {STEPS.map((step, i) => (
          <StepRow key={step.label} index={i} {...step} />
        ))}
      </div>

      {/* RIGHT — terminal visualization panel, unchanged but for its height,
          which the frame drops to 352 so the two columns finish together.
          Centered when there's room; overflows left-anchored otherwise (same
          pattern as did-my-fix). On mobile the inner is scaled to 80% from the
          left edge so it fits tighter viewports without horizontal scrolling. */}
      <div className="w-full md:flex-1 md:min-w-0 bg-surface-500 flex items-center p-5 overflow-hidden h-[352px]">
        <div className="shrink-0 mx-auto md:scale-none scale-[80%] origin-left">
          <div className="bg-surface-700 rounded w-[420px] px-6 py-5">
            <Terminal />
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default OpenSource;
