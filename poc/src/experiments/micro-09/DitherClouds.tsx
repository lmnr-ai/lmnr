import {memo, useLayoutEffect, useRef} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DITHER_DEFAULTS, DITHER_UNIFORMS, sameDither, type DitherState} from '../micro-08/dither';
import {interpolateCloudRects, type Rect} from './geometry';
import {DITHER_FRAGMENT, DITHER_VERTEX} from './dither-shader';

const CLOUD = staticFile('micro-09/image-219.png');
export type CloudState = {progress: number; yOffset?: number; translateY?: number; translateX?: [number, number]; dither?: DitherState; source?: string};

function imageRect(bounds: Rect, width: number, height: number) {
  const scale = Math.max(bounds.width / width, bounds.height / height);
  return {x: bounds.x + (bounds.width - width * scale) / 2,
    y: bounds.y + (bounds.height - height * scale) / 2,
    width: width * scale, height: height * scale};
}

export function createCloudRenderer(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true,
    antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error('Micro 09 cloud dithering requires WebGL2.');
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const shaders: WebGLShader[] = [];
  try {
    if (!program || !texture) throw new Error('Unable to allocate Micro 09 image shader.');
    for (const [kind, source] of [[gl.VERTEX_SHADER, DITHER_VERTEX], [gl.FRAGMENT_SHADER, DITHER_FRAGMENT]] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to allocate Micro 09 shader.');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed.');
    gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
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
  const locations = DITHER_UNIFORMS.map(key => [key, gl.getUniformLocation(program, `u_${key}`)] as const);
  const imageRectLocation = gl.getUniformLocation(program, 'u_imageRect');
  const imageBoundsLocation = gl.getUniformLocation(program, 'u_imageBounds');
  let lastProgress = Number.NaN;
  let lastYOffset = Number.NaN;
  let lastTranslateY = Number.NaN;
  let lastTranslateX: [number, number] = [Number.NaN, Number.NaN];
  let lastDither: DitherState | null = null;
  return {
    draw(progress: number, dither: DitherState, yOffset = 0, translateY = 0, translateX: [number, number] = [0, 0]) {
      if (progress === lastProgress && yOffset === lastYOffset && translateY === lastTranslateY
        && translateX[0] === lastTranslateX[0] && translateX[1] === lastTranslateX[1]
        && lastDither && sameDither(lastDither, dither)) return;
      if (gl.isContextLost()) throw new Error('Micro 09 cloud WebGL context was lost.');
      gl.viewport(0, 0, 1280, 720); gl.useProgram(program); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      for (const [key, location] of locations) gl.uniform1f(location, dither[key]);
      for (const bounds of interpolateCloudRects(progress, yOffset, translateY, translateX)) {
        const mapped = imageRect(bounds, image.naturalWidth, image.naturalHeight);
        gl.uniform4f(imageRectLocation, mapped.x, mapped.y, mapped.width, mapped.height);
        gl.uniform4f(imageBoundsLocation, bounds.x, bounds.y, bounds.width, bounds.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.finish();
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Micro 09 cloud draw failed: WebGL ${error}`);
      lastProgress = progress; lastYOffset = yOffset; lastTranslateY = translateY; lastTranslateX = [...translateX]; lastDither = {...dither};
      canvas.dataset.ready = 'true';
    },
    dispose() { gl.deleteTexture(texture); gl.deleteProgram(program); },
  };
}

export const DitherClouds = memo(({progress, yOffset = 0, translateY = 0, translateX = [0, 0], dither = DITHER_DEFAULTS, source = CLOUD}: CloudState) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createCloudRenderer> | null>(null);
  const latest = useRef({progress, yOffset, translateY, translateX, dither});
  useLayoutEffect(() => {
    const element = canvas.current!;
    const handle = delayRender('Load and dither Micro 09 clouds');
    let active = true; let pending = true;
    const ready = () => { if (pending) { continueRender(handle); pending = false; } };
    const fail = (error: unknown) => { ready(); cancelRender(error); };
    const lost = (event: Event) => { event.preventDefault(); fail(new Error('Micro 09 cloud WebGL context was lost.')); };
    element.dataset.ready = 'false'; element.addEventListener('webglcontextlost', lost);
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try { renderer.current = createCloudRenderer(element, image); renderer.current.draw(latest.current.progress, latest.current.dither, latest.current.yOffset, latest.current.translateY, latest.current.translateX); ready(); }
      catch (error) { fail(error); }
    };
    image.onerror = () => { if (active) fail(new Error(`Unable to load cloud texture: ${source}`)); };
    image.src = source;
    return () => { active = false; image.onload = null; image.onerror = null; element.removeEventListener('webglcontextlost', lost); renderer.current?.dispose(); renderer.current = null; ready(); };
  }, [source]);
  useLayoutEffect(() => {
    latest.current = {progress, yOffset, translateY, translateX, dither};
    try { renderer.current?.draw(progress, dither, yOffset, translateY, translateX); } catch (error) { cancelRender(error); }
  }, [progress, yOffset, translateY, translateX, dither]);
  return <canvas ref={canvas} className="micro09-clouds" width={1280} height={720} aria-hidden="true"/>;
}, (before, after) => (before.source ?? CLOUD) === (after.source ?? CLOUD) && before.progress === after.progress && (before.yOffset ?? 0) === (after.yOffset ?? 0) && (before.translateY ?? 0) === (after.translateY ?? 0)
  && (before.translateX?.[0] ?? 0) === (after.translateX?.[0] ?? 0)
  && (before.translateX?.[1] ?? 0) === (after.translateX?.[1] ?? 0) && sameDither(before.dither ?? DITHER_DEFAULTS, after.dither ?? DITHER_DEFAULTS));
