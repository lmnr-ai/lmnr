import {memo, useLayoutEffect, useRef} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {DITHER_FRAGMENT, DITHER_VERTEX} from './dither-shader';
import {cloudImageRect, DITHER_UNIFORMS, sameDither, type DitherState} from './dither';
import {FIGMA} from './geometry';

const CLOUD = staticFile('micro-08/image-218.png');

// No RAF/clock. Upload the actual PNG once; redraw only when filter values change.
export function createDitherRenderer(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext('webgl2', {alpha: true, premultipliedAlpha: true,
    antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true});
  if (!gl) throw new Error('Micro 08 cloud dithering requires WebGL2.');
  const program = gl.createProgram();
  const texture = gl.createTexture();
  const shaders: WebGLShader[] = [];
  try {
    if (!program || !texture) throw new Error('Unable to allocate Micro 08 image shader.');
    for (const [kind, source] of [[gl.VERTEX_SHADER, DITHER_VERTEX], [gl.FRAGMENT_SHADER, DITHER_FRAGMENT]] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to allocate Micro 08 shader.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed.');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader link failed.');
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    // Both image rows and the shader's screen coordinates start at the top.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);
    const rect = cloudImageRect(image.naturalWidth, image.naturalHeight);
    gl.uniform4f(gl.getUniformLocation(program, 'u_imageRect'), rect.x, rect.y, rect.width, rect.height);
    const box = FIGMA.backgroundImage;
    gl.uniform4f(gl.getUniformLocation(program, 'u_imageBounds'), box.x, box.y, box.width, box.height);
  } catch (error) {
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
    throw error;
  } finally {
    shaders.forEach(shader => gl.deleteShader(shader));
  }
  const locations = DITHER_UNIFORMS.map(key => [key, gl.getUniformLocation(program, `u_${key}`)] as const);
  let last: DitherState | null = null;
  let draws = 0;
  return {
    draw(state: DitherState) {
      if (gl.isContextLost()) throw new Error('Micro 08 image shader WebGL context was lost.');
      if (last && sameDither(last, state)) return;
      gl.viewport(0, 0, 1280, 720);
      gl.useProgram(program);
      for (const [key, location] of locations) gl.uniform1f(location, state[key]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Only on actual filter changes, not every streamer frame.
      gl.finish();
      const error = gl.getError();
      if (error !== gl.NO_ERROR) throw new Error(`Micro 08 image shader draw failed: WebGL ${error}`);
      last = {...state};
      canvas.dataset.draws = String(++draws);
    },
    dispose() { gl.deleteTexture(texture); gl.deleteProgram(program); },
  };
}

export const DitherBackground = memo(({state}: {state: DitherState}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createDitherRenderer> | null>(null);
  const latest = useRef(state);
  useLayoutEffect(() => {
    const element = canvas.current!;
    const handle = delayRender('Load and dither the Micro 08 cloud');
    let pending = true;
    let active = true;
    const ready = () => { if (pending) { continueRender(handle); pending = false; } };
    const fail = (error: unknown) => { ready(); cancelRender(error); };
    const contextLost = (event: Event) => {
      event.preventDefault();
      fail(new Error('Micro 08 cloud dithering WebGL context was lost.'));
    };
    element.dataset.ready = 'false';
    element.addEventListener('webglcontextlost', contextLost);
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try {
        renderer.current = createDitherRenderer(element, image);
        renderer.current.draw(latest.current);
        element.dataset.ready = 'true';
        ready();
      } catch (error) { fail(error); }
    };
    image.onerror = () => { if (active) fail(new Error(`Unable to load cloud texture: ${CLOUD}`)); };
    image.src = CLOUD;
    return () => {
      active = false;
      image.onload = null; image.onerror = null;
      element.removeEventListener('webglcontextlost', contextLost);
      renderer.current?.dispose(); renderer.current = null;
      ready();
    };
  }, []);
  useLayoutEffect(() => {
    latest.current = state;
    try { renderer.current?.draw(state); }
    catch (error) { cancelRender(error); }
  }, [state]);
  return <canvas ref={canvas} className="micro08-dither" width={1280} height={720} aria-hidden="true"/>;
}, (before, after) => sameDither(before.state, after.state));
