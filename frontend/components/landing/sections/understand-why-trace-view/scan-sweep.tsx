"use client";

import { AnimatePresence, motion } from "framer-motion";

// A pass over the transcript, behind the rows: what "every run is analyzed"
// looks like in the second the step has to say it. Rows carry no background of
// their own, so the band reads THROUGH the dimmed text rather than over it.

/** The signal card's blue, so the sweep and what it turns up are one colour. */
const SIGNAL_RGB = "49 134 255";

/** Where the band sits inside the sweeping element, as percentages of its
 *  height. The travel below is derived from them, so the band enters exactly at
 *  the bottom edge and leaves exactly at the top one — a budget this short can
 *  afford no dead frames at either end. */
const BAND_TOP = 35;
const BAND_H = 30;

/** Percentages, NOT px, and load-bearing: the signal card opening shortens this
 *  box by its own height mid-pass. In % the band stays exactly clipped at each
 *  edge through the resize; in px it would jump back into view. */
const FROM = `${100 - BAND_TOP}%`;
const TO = `${-(BAND_TOP + BAND_H)}%`;

/** Brightest under the leading edge and falling away behind it, so the band has
 *  a direction on its own — a symmetric glow reads as a pulse, not a pass. */
const TAIL = `linear-gradient(to bottom, rgb(${SIGNAL_RGB} / 0.13), rgb(${SIGNAL_RGB} / 0.04) 55%, transparent)`;

/** Faded at both ends: a full-bleed rule would read as a divider the panel had
 *  grown rather than something travelling across it. */
const EDGE = `linear-gradient(to right, transparent, rgb(${SIGNAL_RGB} / 0.6) 22%, rgb(${SIGNAL_RGB} / 0.6) 78%, transparent)`;

/** Mostly linear through the middle — a scan is a machine, not a thrown ball —
 *  but eased at both ends so it neither starts nor stops on a hard edge. */
const SWEEP_EASE = [0.32, 0, 0.3, 1] as const;

interface Props {
  active: boolean;
  durationMs: number;
}

const ScanSweep = ({ active, durationMs }: Props) => (
  <AnimatePresence>
    {active && (
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ y: FROM }}
        animate={{ y: TO }}
        // Only reached if the reader scrolls back mid-pass; on a clean run the
        // band is already clipped by the panel's edge when this fires.
        exit={{ opacity: 0, transition: { duration: 0.15 } }}
        transition={{ duration: durationMs / 1000, ease: SWEEP_EASE }}
      >
        <div className="absolute inset-x-0" style={{ top: `${BAND_TOP}%`, height: `${BAND_H}%`, background: TAIL }} />
        <div className="absolute inset-x-0 h-px" style={{ top: `${BAND_TOP}%`, background: EDGE }} />
      </motion.div>
    )}
  </AnimatePresence>
);

export default ScanSweep;
