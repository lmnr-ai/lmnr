"use client";

import { type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection, subSubSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import MobileSignalStack from "./mobile-signal-stack";
import MobileTracePanel from "./mobile-trace-panel";
import { type StepNumber, STEPS } from "./steps";

// The desktop copy (imported from ./steps so the words can't drift) without the
// scroll choreography. Mock widths deliberately overflow a phone viewport; the
// page root's `overflow-x-clip` keeps them full scale without side-scroll.

const Copy = ({ step }: { step: StepNumber }) => {
  const config = STEPS[step];
  return (
    <div className="flex flex-col gap-3 items-start">
      {config.label && <span className={microLabel}>{config.label}</span>}
      {config.title && <h2 className={subSection}>{config.title}</h2>}
      {config.subtitle && <h3 className={subSubSection}>{config.subtitle}</h3>}
      <p className={bodyMedium}>{config.body}</p>
      {config.learnMore && (
        <LearnMoreLink className="mt-2" label={config.learnMore.label} href={config.learnMore.href} />
      )}
    </div>
  );
};

const Block = ({ step, children }: { step: StepNumber; children?: ReactNode }) => (
  <div className="flex flex-col gap-6 items-start w-full">
    <Copy step={step} />
    {children}
  </div>
);

// Centring pattern shared by the image panels: `flex` + `mx-auto shrink-0`
// centres the card when there's room and lets it overflow when there isn't.
const Panel = ({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) => (
  <div className={cn("bg-surface-250 relative w-full overflow-hidden", className)} style={style}>
    {children}
  </div>
);

/** Frame height, and the panel height inside it. The panel is DELIBERATELY
 *  taller than the frame so the trace runs off the bottom edge rather than
 *  ending on it — the frame's `overflow-hidden` crops it and the gradient below
 *  fades that cut out. */
const CROPPED_FRAME_H = 420;
const CROPPED_TRACE_H = 620;

/** Panel that CROPS a full-height trace panel rather than scaling it down: the
 *  header and whatever the step opens sit at the top, the trace continues past
 *  the bottom edge. */
const CroppedPanel = ({ children }: { children: ReactNode }) => (
  <Panel style={{ height: CROPPED_FRAME_H }}>
    <div className="absolute inset-0 flex px-8 pt-6">
      <div
        className="border rounded-md overflow-hidden bg-background shrink-0 mx-auto"
        style={{ height: CROPPED_TRACE_H }}
      >
        {children}
      </div>
    </div>
    {/* Fades the cropped edge into the frame. */}
    <div className="absolute inset-x-0 bottom-0 h-[160px] bg-gradient-to-t from-surface-250 to-transparent pointer-events-none z-10" />
  </Panel>
);

const UnderstandWhyTraceViewMobile = () => (
  <section className="w-full flex flex-col gap-16 px-6 py-16">
    {/* 01. Section opener, over the live transcript its copy describes. */}
    <Block step={1}>
      <CroppedPanel>
        <MobileTracePanel />
      </CroppedPanel>
    </Block>

    {/* 02. Signals — the same panel with the signal event card open on it. */}
    <Block step={2}>
      <CroppedPanel>
        <MobileTracePanel showSignals />
      </CroppedPanel>
    </Block>

    {/* The same signal, matched on run after run — then the stack collapses into
        its cluster pill and the pill falls out through the bottom edge, which is
        where ../has-this-issue picks it up. No padding: the frame's edge IS the
        clip the pill leaves through. */}
    <Block step={3}>
      <Panel>
        <MobileSignalStack />
      </Panel>
    </Block>
  </section>
);

export default UnderstandWhyTraceViewMobile;
