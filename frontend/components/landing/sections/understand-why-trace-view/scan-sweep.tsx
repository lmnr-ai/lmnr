"use client";

import { AnimatePresence, motion } from "framer-motion";

// A pass over the transcript, behind the rows: what "every run is analyzed"
// looks like in the second the step has to say it. Rows carry no background of
// their own, so the band reads THROUGH the dimmed text rather than over it.

/** Where the band sits inside the sweeping element, as percentages of its
 *  height. The travel below is derived from them, so the band enters exactly at
 *  the bottom edge and leaves exactly at the top one — no dead frames at either
 *  end. Half the box tall: symmetric light needs room to arrive and leave, where
 *  a hard-edged one could be thin and still read. */
const BAND_TOP = 25;
const BAND_H = 50;

/** Percentages, NOT px, and load-bearing: the signal card opening shortens this
 *  box by its own height mid-pass. In % the band stays exactly clipped at each
 *  edge through the resize; in px it would jump back into view. */
const FROM = `${100 - BAND_TOP}%`;
const TO = `${-(BAND_TOP + BAND_H)}%`;

/** Symmetric: light passing over the rows, with no leading edge and so no
 *  direction of its own — the travel is what carries that. Plain white and
 *  barely there, so it lifts the dimmed text rather than tinting it. */
const BAND = "linear-gradient(to bottom, transparent, rgb(255 255 255 / 0.05), transparent)";

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
        <div className="absolute inset-x-0" style={{ top: `${BAND_TOP}%`, height: `${BAND_H}%`, background: BAND }} />
      </motion.div>
    )}
  </AnimatePresence>
);

export default ScanSweep;
