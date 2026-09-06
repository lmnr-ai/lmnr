// Opaque page fill behind the readout, faded out rather than clipped: a
// hard-edged box over the chart reads as a panel on top, while masking the two
// INNER edges makes the same fill read as the chart being cut away behind the
// text. `-left-3 -top-3` lands exactly on the pane corner given the readout's
// own `left-3 top-3`.

// Two masks composited with `intersect`, so alpha is the min of a bottom ramp and
// a right ramp: each inner edge fades on its own and the corner falls out of both.
// A single 135° gradient would instead fade the top-left, which is where the words
// are.
const SCRIM_MASK =
  "linear-gradient(to bottom, #000 60%, transparent), linear-gradient(to right, #000 62%, transparent)";

export default function ClusterReadoutScrim() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -bottom-8 -left-3 -right-20 -top-3 -z-10 bg-background"
      style={{
        maskImage: SCRIM_MASK,
        maskComposite: "intersect",
        WebkitMaskImage: SCRIM_MASK,
        WebkitMaskComposite: "source-in",
      }}
    />
  );
}
