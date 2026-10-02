# Micro 08: candidates for a procedural dither background

## Corrected decision after user clarification

The user wants dithering **applied to the existing cloud**, not a procedural reconstruction of its shape. The first procedural terrain attempt was rejected. Micro08 now uses a local adaptation of Paper **Image Dithering** with the original PNG texture; its unsnapped alpha/placement are preserved while shading is quantized. Pixel size, color levels, contrast, intensity and optional intensity pulse are tunable. No cloud geometry animation is claimed. See `poc/src/experiments/micro-08/README.md` for current implementation and verification limits.

## Initial research (procedural scope, superseded)

**Found reusable shader implementations, but not a verified exact match to the Figma image.** Recommended first experiment: Paper Design's procedural Dithering shader, comparing its `simplex` and `warp` shapes against a grayscale Grain Gradient `blob` variant. If the reference really has a shaded terrain silhouette, neither is an exact shape generator; retain the dither stage and build/tune a separate procedural shape field.

Do not replace Micro 08's reference image with a generic noise shader and call it matched. The visual comparison is still outstanding. The background agent failed without a report; the findings below come from direct inspection of downloaded primary sources.

## What we know about the reference

- Figma frame: `4730:14319`; image layer: `4730:14982`, named `image 218`.
- Local reference: `poc/public/micro-08/image-218.png`.
- Source PNG: 623×350 RGBA; Figma display size: 1908×1072 at `(383,-104)` within the 1280×720 composition. Thus source pixels are displayed at roughly 3.06× scale.
- Direct ffmpeg/raw-pixel analysis: 226 distinct RGBA values; 107,720 of 218,050 pixels fully transparent. All color channels are grayscale. Frequent nontransparent samples have RGB values around 63–100, with variable alpha.
- This does **not** prove ordered dithering, a particular noise algorithm, a 3D surface, or the original shader library. Filtering/resampling and alpha can obscure the original palette.
- Coarse text-only spatial inspection suggested an irregular mound-like silhouette. This is a hypothesis, not visual confirmation: image viewing was unavailable to the inspecting model.

## Candidates

### 1. Paper Design — Dithering: best reusable dither foundation

[Primary source](https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/dithering.ts)

- Procedural shape choices: simplex, warp, dots, wave, ripple, swirl, sphere.
- Dither choices: random threshold, Bayer 2×2, 4×4, 8×8.
- Controls: foreground/background RGBA, pattern scale/rotation/offset, dither pixel size, and explicit `u_time`.
- The dither grid is computed from fragment coordinates before shape transforms. This lets us animate shape scale without inadvertently scaling the pixel lattice.
- The shape is thresholded into a two-color result with alpha compositing. This is not a multi-level shaded-terrain renderer.
- Best fit if the desired appearance is a two-tone, stippled or ordered-dither organic field. The `sphere` option has a moving light but is a sphere, not an arbitrary terrain silhouette.
- For a custom shape, replace the scalar `shape` calculation while keeping the Bayer/random threshold stage and pixel-coordinate handling.

**Limit:** an unchanged two-color implementation is not proven to reproduce the reference's grayscale/alpha structure. No existing parameter set has been visually matched.

### 2. Paper Design — Grain Gradient: alternate if the reference is grain rather than ordered dither

[Primary source](https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/grain-gradient.ts)

- Seven shapes: wave, dots, truchet, corners, ripple, blob, sphere.
- Up to seven RGBA gradient colors, softness, distortion intensity, and grain/noise amount.
- Uses simplex noise and texture-backed value-noise/FBM to perturb a gradient field; it does **not** use Bayer threshold matrices.
- `blob` combines four moving radial fields. `sphere` provides a shaded circular field.
- Supports a transparent background and soft alpha transitions. This makes it worth comparing against the reference's multiple gray/alpha values.
- Requires the sizing vertex-stage inputs and deterministic noise texture/helper code in addition to the fragment source.

**Limit:** grain is not automatically the same visual effect as dithering. Blob and sphere shapes are not evidence of a match to the reference silhouette.

### 3. React Bits — Dither: useful organic motion reference, heavier adaptation

[Primary source](https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/Dither/Dither.jsx)

- Generates a four-octave absolute coherent-noise FBM field with domain warping, then applies an 8×8 Bayer postprocess.
- Exposes wave speed, frequency, amplitude, wave/background colors, color count, and pixel size.
- The source has a luminance-dependent bias in the quantization stage, so merely copying the Bayer matrix will not reproduce the entire appearance.
- Current component uses Three.js, React Three Fiber, React Three Postprocessing, and `postprocessing`; its time comes from `useFrame`/`clock.getElapsedTime()`.
- To fit this repository, port the math to an externally driven WebGL pass or explicitly drive a paused renderer. Replace wall-clock time and disable pointer-dependent distortion.

**Limit:** this is a full-plane procedural field, not the reference's transparent, bounded silhouette. A separate mask/shape stage would be required. License is more restrictive than Paper's.

### Not a full recreation: Paper Image Dithering

[Primary source](https://github.com/paper-design/shaders/blob/main/packages/shaders/src/shaders/image-dithering.ts)

Supports Bayer/random dithering, palette steps, inversion, and image transforms. It samples a source image; by itself it does not recreate its geometry. Useful for testing a dither postprocess on a procedurally generated texture, but applying it to the existing PNG would not meet the user's goal of animating the underlying shape.

## Licensing

- [Paper Design LICENSE](https://github.com/paper-design/shaders/blob/main/LICENSE): Apache-2.0. Retain applicable notices and license, mark modified files, and carry relevant NOTICE attribution if present in the distributed work. Inspect helper-file notices when actually vendoring shader code.
- [React Bits LICENSE.md](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md): the inspected version says **MIT + Commons Clause**, not plain MIT. It permits use within applications/websites/products but restricts selling, sublicensing, or redistributing the components themselves, including ported versions. Retain copyright/license text. Prefer Paper for the reusable sandbox foundation.
- Sources were read from mutable `main` URLs. Pin a specific upstream revision and retain its license/notices before adopting code. Imported helper implementations and any third-party notices must be inspected then; the six files reviewed here are not the complete dependency tree.

## Implementation recommendation

1. Add a temporary comparison view: reference PNG, Paper Dithering simplex/warp, and grayscale Grain Gradient blob/sphere. Use the actual composition crop, image placement, background color, and roughly 3px initial screen-space pixel size as a starting sweep—not a claimed recovered parameter.
2. Match large-scale shape, transparency, and grayscale range first; match dither cell structure second. A correct Bayer pattern cannot fix an incorrect silhouette.
3. Keep shape generation and dithering separate. Expose shape scale/position, deformation, contrast/brightness, dither size/type, opacity, and time. Add a deterministic seed only if needed; the inspected Paper public parameter interfaces do not expose one.
4. Feed `u_time` and every animated parameter from the same pure frame/time sampler used by preview and Remotion. Fix render resolution/DPR; don't use autonomous animation clocks, pointer history, or per-frame random values.
5. For Grain Gradient, freeze the noise texture and await texture loading. Preserve the source's premultiplied-alpha convention when layering behind the grid.
6. Render a WebGL layer behind the existing SVG grid/streams. Explicitly finish/draw the requested frame before Remotion captures it. Compare random/reverse seeks and browser/export frames; GPU floating-point behavior may require image tolerances.
7. The streamers' existing 8-second loop does not make shader animation loop automatically. Use periodic parameter paths/noise coordinates or leave shader evolution disabled until a seamless shader loop is designed and tested.

## Remaining verification

No candidate has yet been rendered side by side with the Figma texture. No visual identity, performance, or GPU parity claim is made. The next decision should be based on a small rendered comparison, not on the shader's name alone.
