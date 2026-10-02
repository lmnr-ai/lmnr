# Research: Halftone / letterpress shader for a React + Remotion lens

## Recommendation

Use a WebGL 2 fragment shader that samples the source through a lens-local blur/distortion, then applies a monochrome rotated dot screen. Add low-frequency pressure variation, restrained paper grain, and optional spot-color registration errors.

A monochrome letterpress screen is the strongest stable default. A two-color risograph mode is the best alternative. Fixed blue noise is useful for sparse stipple/dropout; ordered dithering looks more digital; procedural threshold noise is better for pressure and toner breakup.

## Core shader design

1. Work in output-pixel coordinates so dot size is stable and unaffected by aspect ratio.
2. Rotate coordinates into a repeating screen grid.
3. Convert image luminance to ink coverage.
4. Use `radius = maxRadius * sqrt(coverage)` so dot area follows tonal coverage.
5. Antialias each dot using `fwidth` and `smoothstep`.
6. Modulate radius with low-frequency pressure noise and slight ink gain.
7. Composite printed color over paper only inside the lens mask.
8. Drive all animation from the Remotion frame—not wall-clock time.

## Style comparison

| Style | Shader signature | Suitability |
|---|---|---|
| Letterpress halftone | Rotated dots, ink gain, uneven pressure, paper grain | **Best default:** stable and recognizable |
| Risograph | 1–3 spot colors, grain, small registration offsets | Best colorful alternative |
| Screenprint | Coarser clean cells, hard ink edges, occasional pinholes | Stable and graphic |
| Newsprint | Fine CMYK rosette and strong dot gain | Authentic, but vulnerable to moiré |
| Stippling | Density-controlled irregular blue-noise points | Organic, but harder to synthesize stably |
| Engraving | Multiple luminance-selected line families | Expressive, but alias-prone in motion |
| Photocopy/toner | Thresholds, crushed blacks, halos, dropout | Excellent transition accent |
| Old letterpress | Broken solid edges, spread, pressure mottling | Strong texture; combine with periodic dots |

## GLSL-like outline

```glsl
float dotScreen(float amount, vec2 px, float angle, vec2 registration) {
  mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 grid = rotation * (px + registration) / uCellPx;
  vec2 id = floor(grid);
  vec2 cell = fract(grid) - 0.5;

  float pressure = lowFrequencyNoise(id * uPressureScale + uSeed);
  float coverage = clamp(
    pow(amount, uGamma) + uGain + uPressure * (pressure - 0.5),
    0.0,
    1.0
  );

  float radius = uMaxRadius * sqrt(coverage);
  cell += uJitter * (hash22(id + uSeed) - 0.5);

  float signedDistance = length(cell) - radius;
  float antialias = max(fwidth(signedDistance) * uAA, 0.001);
  return 1.0 - smoothstep(-antialias, antialias, signedDistance);
}

void main() {
  vec2 px = vUv * uResolution;
  float lensDistance = length(px - uLensCenterPx) - uLensRadiusPx;
  float lens = 1.0 - smoothstep(-uLensFeatherPx, uLensFeatherPx, lensDistance);

  vec2 lensUv = distortRadially(vUv, uLensCenterPx / uResolution, uRefraction);
  vec3 base = srgbToLinear(texture(uImage, vUv).rgb);
  vec3 source = fixedTapBlur(uImage, lensUv, uBlurPx, uResolution);
  float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
  float ink = dotScreen(1.0 - luminance, px, uAngleK, vec2(0));

  vec3 paper = uPaperColor * paperGrain(px, uSeed);
  vec3 printed = mix(paper, uInkColor, ink);
  outColor = vec4(linearToSrgb(mix(base, printed, lens)), 1.0);
}
```

## Recommended controls

- Lens: center, radius, feather, opacity, blur, refraction.
- Screen: cell size, angle, registration offset.
- Ink: gamma, gain/spread, maximum radius, ink color, paper color.
- Imperfection: pressure, pressure scale, center jitter, paper grain, seed.
- Quality: antialias amount and minimum cell size.

Suggested starting point:

- Cell size: 8px
- Screen angle: 45°
- Ink gain: 0.03–0.08
- Center jitter: at most 0.04 cells
- Pressure amplitude: 0.05
- Paper grain: 1–3%
- Registration error: about 1.5px in spot-color mode

## Noise guidance

- **Fixed blue-noise tile:** best for genuinely irregular stipple points and sparse dropout.
- **Ordered Bayer dithering:** deterministic and stable, but reads as early digital output.
- **Thresholded procedural noise:** best for paper, pressure, toner breakup, and distressed edges—not primary stipple placement.

Recommended hybrid: analytic halftone dots + fixed pressure/paper grain + optional blue-noise pinholes.

## Remotion implementation

Use a WebGL 2 canvas at exact composition dimensions. Prefer one fragment pass unless blur requires a larger kernel; then use a deterministic separable blur followed by the print/lens pass.

Pin Chromium and renderer settings, use explicit viewport and texture settings, request fragment `highp`, and validate actual headless renders. Floating-point shaders are not guaranteed bit-identical across GPUs, so image regression should use a tolerance.

SVG filters can approximate paper, photocopy, displacement, and blur with `feTurbulence`, `feDisplacementMap`, and `feGaussianBlur`. CSS filters cannot implement tone-sized rotated screening. WebGL is the better fit when spatial screening is central.

## Sources

- [GLSL ES 3.00 Specification](https://registry.khronos.org/OpenGL/specs/es/3.0/GLSL_ES_Specification_3.00.pdf)
- [WebGL 2 Specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
- [OES standard derivatives](https://registry.khronos.org/webgl/extensions/OES_standard_derivatives/)
- [W3C Filter Effects Level 1](https://www.w3.org/TR/filter-effects-1/)
- [Remotion rendering documentation](https://www.remotion.dev/docs/render)
- [Heitz & Belcour: Distributing Monte Carlo Errors as Blue Noise](https://belcour.github.io/blog/research/publication/2019/06/17/sampling-bluenoise.html)
- [Jimenez et al.: Interleaved Gradient Noise](https://www.irysec.com/publications/next-generation-post-processing-in-call-of-duty-advanced-warfare)
