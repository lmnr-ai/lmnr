import {memo, useLayoutEffect, useRef} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DITHER_DEFAULTS, DITHER_UNIFORMS, sameDither, type DitherState} from '../micro-08/dither';
import {DITHER_FRAGMENT, DITHER_VERTEX} from '../micro-09/dither-shader';
import type {Rect} from '../micro-09/geometry';

const CLOUD = staticFile('micro-10/image-221.png');
const PUFF = staticFile('micro-10/image-222.png');
export type DitherItem = {bounds: Rect; opacity?: number};

const OPACITY_FRAGMENT = DITHER_FRAGMENT
  .replace('uniform float u_intensity;', 'uniform float u_intensity;\nuniform float u_opacity;\nuniform float u_brightness;')
  .replace('fragColor = original; return;', 'fragColor = vec4(original.rgb * u_brightness, original.a) * u_opacity; return;')
  // Apply brightness before quantization. This changes the density of light
  // dither cells, rather than merely tinting already-white cells gray.
  .replace('float lum = clamp((dot(vec3(.2126, .7152, .0722), source) - .5) * u_contrast + .5, 0., 1.);',
    'float lum = clamp((dot(vec3(.2126, .7152, .0722), source) * u_brightness - .5) * u_contrast + .5, 0., 1.);')
  .replace('fragColor = vec4(mix(original.rgb, filtered, clamp(u_intensity, 0., 1.)), original.a);',
    'fragColor = vec4(mix(original.rgb, filtered, clamp(u_intensity, 0., 1.)), original.a) * u_opacity;');

export function createPhotoRenderer(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true,
    antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error('Micro 10 photo dithering requires WebGL2.');
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const shaders: WebGLShader[] = [];
  try {
    if (!program || !texture) throw new Error('Unable to allocate Micro 10 image shader.');
    for (const [kind, source] of [[gl.VERTEX_SHADER, DITHER_VERTEX], [gl.FRAGMENT_SHADER, OPACITY_FRAGMENT]] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to allocate Micro 10 shader.');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed.');
    gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  } catch (error) {
    gl.deleteTexture(texture); gl.deleteProgram(program); throw error;
  } finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  const ditherLocations = DITHER_UNIFORMS.map(key => [key, gl.getUniformLocation(program, `u_${key}`)] as const);
  const imageRectLocation = gl.getUniformLocation(program, 'u_imageRect');
  const imageBoundsLocation = gl.getUniformLocation(program, 'u_imageBounds');
  const opacityLocation = gl.getUniformLocation(program, 'u_opacity');
  const brightnessLocation = gl.getUniformLocation(program, 'u_brightness');
  return {
    draw(items: DitherItem[], dither: DitherState, brightness = 1) {
      if (gl.isContextLost()) throw new Error('Micro 10 photo WebGL context was lost.');
      gl.viewport(0, 0, 1280, 720); gl.useProgram(program); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      for (const [key, location] of ditherLocations) gl.uniform1f(location, dither[key]);
      gl.uniform1f(brightnessLocation, brightness);
      for (const {bounds, opacity = 1} of items) {
        // Stretch the complete source into the animated bounds so squashing
        // changes its aspect ratio instead of cover-cropping an edge.
        gl.uniform4f(imageRectLocation, bounds.x, bounds.y, bounds.width, bounds.height);
        gl.uniform4f(imageBoundsLocation, bounds.x, bounds.y, bounds.width, bounds.height);
        gl.uniform1f(opacityLocation, opacity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.finish(); canvas.dataset.ready = 'true';
    },
    dispose() { gl.deleteTexture(texture); gl.deleteProgram(program); },
  };
}

const sameItems = (before: DitherItem[], after: DitherItem[]) => before.length === after.length && before.every((item, index) => {
  const other = after[index];
  return item.bounds.x === other.bounds.x && item.bounds.y === other.bounds.y && item.bounds.width === other.bounds.width && item.bounds.height === other.bounds.height && (item.opacity ?? 1) === (other.opacity ?? 1);
});

const DitherLayer = memo(({items, dither, source, className, brightness = 1}: {items: DitherItem[]; dither: DitherState; source: string; className: string; brightness?: number}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createPhotoRenderer> | null>(null);
  const latest = useRef({items, dither, brightness});
  useLayoutEffect(() => {
    const element = canvas.current!;
    const handle = delayRender(`Load and dither ${className}`);
    let active = true; let pending = true;
    const ready = () => { if (pending) { continueRender(handle); pending = false; } };
    const fail = (error: unknown) => { ready(); cancelRender(error); };
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try { renderer.current = createPhotoRenderer(element, image); renderer.current.draw(latest.current.items, latest.current.dither, latest.current.brightness); ready(); }
      catch (error) { fail(error); }
    };
    image.onerror = () => { if (active) fail(new Error(`Unable to load Micro 10 image: ${source}`)); };
    image.src = source;
    return () => { active = false; image.onload = null; image.onerror = null; renderer.current?.dispose(); renderer.current = null; ready(); };
  }, [className, source]);
  useLayoutEffect(() => {
    latest.current = {items, dither, brightness};
    try { renderer.current?.draw(items, dither, brightness); } catch (error) { cancelRender(error); }
  }, [items, dither, brightness]);
  return <canvas ref={canvas} className={className} width={1280} height={720} aria-hidden="true"/>;
}, (before, after) => before.source === after.source && before.className === after.className && before.brightness === after.brightness && sameItems(before.items, after.items) && sameDither(before.dither, after.dither));

export const DitherImage = ({bounds, source, dither = DITHER_DEFAULTS, className = 'micro10-photo', opacity = 1}: {bounds: Rect; source: string; dither?: DitherState; className?: string; opacity?: number}) =>
  <DitherLayer items={[{bounds, opacity}]} dither={dither} source={source} className={className}/>;

export const DitherPhoto = ({bounds, dither = DITHER_DEFAULTS, opacity = 1}: {bounds: Rect; dither?: DitherState; opacity?: number}) =>
  <DitherImage bounds={bounds} dither={dither} source={CLOUD} opacity={opacity}/>;

export const DitherPuffs = ({puffs, dither = DITHER_DEFAULTS, brightness = 1}: {puffs: DitherItem[]; dither?: DitherState; brightness?: number}) =>
  <DitherLayer items={puffs} dither={dither} source={PUFF} className="micro10-puffs" brightness={brightness}/>;
