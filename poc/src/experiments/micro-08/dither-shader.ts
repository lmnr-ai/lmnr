/*
 * Adapted from Paper Shaders — Copyright 2026 Paper, Apache-2.0.
 * Powered by Paper Shaders: https://shaders.paper.design
 * Upstream revision: 7002061d8389781a45e479584deeca0cf538474e
 * Source: packages/shaders/src/shaders/image-dithering.ts.
 * Modified: fixed Figma image mapping, grayscale contrast/intensity blend, and
 * ORIGINAL unsnapped alpha (no opacity quantization or procedural silhouette).
 * License and attribution: ./vendor/paper/LICENSE and ./vendor/paper/NOTICE.
 */
import {BAYER_8} from './dither';

export const DITHER_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

export const DITHER_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec4 u_imageRect;
uniform vec4 u_imageBounds;
uniform float u_pixelSize;
uniform float u_colorLevels;
uniform float u_contrast;
uniform float u_intensity;
out vec4 fragColor;
const int bayer8x8[64] = int[64](${BAYER_8.join(',')});

float getBayerValue(vec2 cell) {
  ivec2 pos = ivec2(mod(cell, 8.));
  return float(bayer8x8[pos.y * 8 + pos.x]) / 64.;
}
vec2 imageUV(vec2 screen) {
  return (screen - u_imageRect.xy) / u_imageRect.zw;
}
void main() {
  vec2 screen = vec2(gl_FragCoord.x, 720. - gl_FragCoord.y);
  if (any(lessThan(screen, u_imageBounds.xy)) ||
      any(greaterThanEqual(screen, u_imageBounds.xy + u_imageBounds.zw))) {
    fragColor = vec4(0.); return;
  }
  // Uploaded premultiplied: linear filtering preserves the PNG's soft edges.
  vec4 original = texture(u_image, imageUV(screen));
  if (original.a <= 0. || u_intensity <= 0.) {
    fragColor = original; return;
  }
  vec2 cell = floor(screen / max(u_pixelSize, 1.));
  vec2 pixel = (cell + .5) * max(u_pixelSize, 1.);
  vec4 sampled = texture(u_image, imageUV(pixel));
  vec3 sourceColor = sampled.a > .00001 ? sampled.rgb / sampled.a : original.rgb / original.a;
  float lum = dot(vec3(.2126, .7152, .0722), sourceColor);
  lum = clamp((lum - .5) * u_contrast + .5, 0., 1.);
  float steps = max(floor(u_colorLevels) - 1., 1.);
  // Paper Image Dithering: ordered noise + luminance quantization.
  float dithering = getBayerValue(cell) - .5;
  float brightness = clamp(lum + dithering / steps, 0., 1.);
  float quantLum = floor(brightness * steps + .5) / steps;
  // Only the shading is dithered. Never quantize alpha or use the snapped alpha
  // for the output: pixel size/intensity cannot change the cloud silhouette.
  vec3 filtered = vec3(quantLum) * original.a;
  fragColor = vec4(mix(original.rgb, filtered, clamp(u_intensity, 0., 1.)), original.a);
}`;
