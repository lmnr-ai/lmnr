import assert from 'node:assert/strict';
import {createDitherRenderer} from './DitherBackground';
import {sampleDither} from './dither';

// Lifecycle/command tests only, not a substitute for executing GLSL in a browser.
function fixture({compile = true, upload = true} = {}) {
  const calls: {name: string; args: unknown[]}[] = [];
  const names = ['VERTEX_SHADER', 'FRAGMENT_SHADER', 'COMPILE_STATUS', 'LINK_STATUS', 'TEXTURE0',
    'TEXTURE_2D', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL', 'UNPACK_FLIP_Y_WEBGL', 'TEXTURE_MIN_FILTER',
    'TEXTURE_MAG_FILTER', 'LINEAR', 'TEXTURE_WRAP_S', 'TEXTURE_WRAP_T', 'CLAMP_TO_EDGE', 'RGBA', 'UNSIGNED_BYTE', 'TRIANGLES'];
  const gl: Record<string, unknown> = Object.fromEntries(names.map((name, i) => [name, i + 1]));
  gl.NO_ERROR = 0;
  const method = (name: string, result?: unknown) => (...args: unknown[]) => { calls.push({name, args}); return result; };
  for (const name of ['createProgram', 'createTexture', 'createShader']) gl[name] = method(name, {});
  for (const name of ['shaderSource', 'compileShader', 'attachShader', 'linkProgram', 'useProgram',
    'activeTexture', 'bindTexture', 'pixelStorei', 'texParameteri', 'uniform1i', 'uniform1f', 'uniform4f',
    'viewport', 'drawArrays', 'finish', 'deleteShader', 'deleteProgram', 'deleteTexture']) gl[name] = method(name);
  gl.getShaderParameter = method('getShaderParameter', compile);
  gl.getShaderInfoLog = () => 'compile failed';
  gl.getProgramParameter = () => true;
  gl.getUniformLocation = (_program: unknown, name: string) => name;
  gl.isContextLost = () => false;
  gl.getError = () => 0;
  gl.texImage2D = (...args: unknown[]) => {
    calls.push({name: 'texImage2D', args});
    if (!upload) throw new Error('upload failed');
  };
  const canvas = {dataset: {}, getContext: () => gl} as unknown as HTMLCanvasElement;
  const image = {naturalWidth: 623, naturalHeight: 350} as HTMLImageElement;
  return {gl, calls, canvas, image, count: (name: string) => calls.filter(call => call.name === name).length};
}
const f = fixture();
const renderer = createDitherRenderer(f.canvas, f.image);
assert.equal(f.count('texImage2D'), 1, 'actual image uploaded exactly once');
assert.equal(f.calls.find(call => call.name === 'texImage2D')!.args.at(-1), f.image);
assert.ok(f.calls.some(call => call.name === 'pixelStorei' && call.args[0] === f.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL && call.args[1] === true));
assert.ok(f.calls.some(call => call.name === 'pixelStorei' && call.args[0] === f.gl.UNPACK_FLIP_Y_WEBGL && call.args[1] === false));
renderer.draw(sampleDither(0));
for (let frame = 1; frame < 240; frame++) renderer.draw(sampleDither(frame / 30));
assert.equal(f.count('drawArrays'), 1, 'no shader redraws during the static-default 8s stream loop');
assert.equal(f.count('finish'), 1, 'no per-frame GPU stalls for static filter');
renderer.draw({...sampleDither(0), intensity: .5});
assert.equal(f.count('drawArrays'), 2, 'changed filter redraws');
renderer.draw(sampleDither(0));
assert.equal(f.count('drawArrays'), 3, 'reverse seek redraws the requested filter');
assert.equal(f.count('texImage2D'), 1, 'settings changes do not upload again');
renderer.dispose();
assert.equal(f.count('deleteProgram'), 1);
assert.equal(f.count('deleteTexture'), 1);
assert.equal(f.count('deleteShader'), 2);
for (const options of [{compile: false}, {upload: false}]) {
  const failed = fixture(options);
  assert.throws(() => createDitherRenderer(failed.canvas, failed.image), /failed/);
  assert.equal(failed.count('deleteProgram'), 1, 'failed initialization frees the program');
  assert.equal(failed.count('deleteTexture'), 1, 'failed initialization frees the texture');
}
console.log('Micro08 renderer: single texture upload/draw by default, parameter updates and resource cleanup passed (mock WebGL).');
