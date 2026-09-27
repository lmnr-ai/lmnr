# Micro 07 elbow/reasoning plan

## Figma facts
- `4730:12983`: 120×120 coral `#f47069` bubble, 60px rounding on top-right and both bottom corners, square top-left, centered `!!!` in `#0e0f21`, JetBrains Mono 48px.
- `4730:13023`: blue Thinking block, 360×120; label begins x=32 and y=28.5.
- `4730:12961`: raised Thinking state, 360×120.
- `4730:12965`: transcript sheet, 360×260; text box x=12/y=4, width336. Figma source text is the longer “I should check main.tsx…” copy, but requested highlight phrase is authoritative.

## Deterministic implementation
1. Keep Micro 07 straight through every existing block, then append one 120px-cell upward segment at the terminal elbow.
2. Camera follows the agent until the elbow. During upward travel, freeze camera focus at elbow.
3. Remove overview transition and its worldFade/spinnerExit/agentWhiten/handoff/overviewZoom/heroDim/blueWave clips and scene branches.
4. Add `bubbleEnter`: bubble occupies elbow+(120,120), scales0→1 and fades0→1 with `transform-origin: top left`.
5. Add `cameraReturn`: interpolate camera target from elbow back to first blue Thinking center.
6. Add `thinkingLift`: move that 360×120 block one cell upward. Add `paperReveal`: sheet translates downward behind it inside an overflow-hidden viewport, so no text can appear above the block.
7. Add `highlight`: duplicate only the requested phrase in two aligned layers. Base layer stays gray. Coral overlay and dark text overlay share a left-to-right `clip-path: inset(0 calc((1-p)*100%) 0 0)`. This avoids DOM range measurement and remains random-access deterministic.
8. Keep DialKit `clip.current` bindings and mirror the same pure sampled values in Remotion.

## Verification
- TypeScript and geometry/timeline tests.
- Browser and Remotion stills at elbow, bubble, camera return, paper reveal, half-highlight, final.
- Reverse/random seeks produce identical state.

## Sources
- Figma nodes listed above, retrieved through Figma Desktop design context.
- MDN `clip-path`: clipping regions hide content outside the animated region: https://developer.mozilla.org/en-US/docs/Web/CSS/clip-path
