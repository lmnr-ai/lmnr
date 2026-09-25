import {build} from 'vite';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {dirname, relative, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCdpClient} from './cdp-client';

const args = new Map<string,string>();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const required = (name: string) => { const value = args.get(name); if (!value) throw new Error(`Missing ${name}`); return resolve(value); };
const propsPath = required('--props');
const mixPath = required('--mix');
const wavPath = required('--wav');
const manifestPath = resolve(args.get('--manifest') ?? `${wavPath}.json`);
const silentVideo = args.has('--silent-video') ? required('--silent-video') : undefined;
const outputVideo = args.has('--output-video') ? required('--output-video') : undefined;
if (Boolean(silentVideo) !== Boolean(outputVideo)) throw new Error('--silent-video and --output-video must be supplied together');

const propsBytes = await readFile(propsPath), mixBytes = await readFile(mixPath);
const props = JSON.parse(propsBytes.toString());
const mix = JSON.parse(mixBytes.toString());
if (!props?.settings) throw new Error('Props JSON must contain settings');
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const key = createHash('sha256').update(JSON.stringify({settings: props.settings, mix})).digest('hex').slice(0, 16);
const temp = resolve('../artifacts/tmp/ultimate3-audio-export', `render-${key}`);
await rm(temp, {recursive:true, force:true}); await mkdir(temp, {recursive:true});
const modulePath = resolve('src/experiments/micro-18/offline-audio.ts');
const moduleImport = relative(temp, modulePath).replaceAll('\\','/');
await writeFile(resolve(temp, 'index.html'), '<!doctype html><body data-done="0"></body>');
await writeFile(resolve(temp, 'entry.ts'), `import {renderUltimate3OfflineAudio,audioBufferToFloatWav} from ${JSON.stringify(moduleImport.startsWith('.') ? moduleImport : './'+moduleImport)};\ntry{const result=await renderUltimate3OfflineAudio(${JSON.stringify(props.settings)},${JSON.stringify(mix)});window.__wavBytes=audioBufferToFloatWav(result.buffer);window.__audioReport=result.report;document.body.dataset.done='1';}catch(error){document.body.dataset.error=String(error?.stack??error);}`);
await build({root:temp, logLevel:'warn', build:{outDir:'dist', emptyOutDir:true, rollupOptions:{input:resolve(temp,'entry.ts')}}});

const port = 9300 + Math.floor(Math.random() * 300);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new','--disable-gpu','--disable-features=AudioServiceOutOfProcess','--no-first-run','--allow-file-access-from-files',`--remote-debugging-port=${port}`,`--user-data-dir=${resolve(temp,'chrome')}`,pathToFileURL(resolve(temp,'index.html')).href], {stdio:'ignore'});
const sleep = (ms:number) => new Promise(resolvePromise => setTimeout(resolvePromise, ms));
let client: ReturnType<typeof createCdpClient> | undefined;
let chromeFailure: Error | undefined;
const onChromeFailure = (error: Error) => {chromeFailure = error; client?.close(error);};
chrome.once('error', onChromeFailure);
chrome.once('exit', () => onChromeFailure(new Error('Chrome exited during audio export')));
const chunks: Buffer[] = [];
let report: any;
try {
  let debuggerUrl = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    if (chromeFailure) throw chromeFailure;
    try {
      const pages: any[] = await (await fetch(`http://127.0.0.1:${port}/json`, {signal: AbortSignal.timeout(1000)})).json();
      debuggerUrl = pages.find(page => page.type === 'page')?.webSocketDebuggerUrl ?? '';
      if (debuggerUrl) break;
    } catch {}
    await sleep(100);
  }
  if (!debuggerUrl) throw new Error('Chrome DevTools endpoint did not start');
  client = createCdpClient(new WebSocket(debuggerUrl));
  await client.ready;
  const {evaluate} = client;
  // Run the complete offline render as one awaited, deadline-bounded CDP request.
  const asset = (await readdir(resolve(temp, 'dist/assets'))).find(file => file.endsWith('.js'))!;
  const bundle = await readFile(resolve(temp, 'dist/assets', asset), 'utf8');
  await evaluate(`(async()=>{${bundle}\n})()`);
  const state = await evaluate(`({done:document.body.dataset.done,error:document.body.dataset.error})`);
  if (state.error || state.done !== '1') throw new Error(`Offline rendering failed: ${state.error ?? 'incomplete render'}`);
  const length = await evaluate('window.__wavBytes.length');
  const chunkSize = 512 * 1024;
  for (let offset = 0; offset < length; offset += chunkSize) {
    const base64 = await evaluate(`{const a=window.__wavBytes.subarray(${offset},${Math.min(length,offset+chunkSize)});let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));btoa(s)}`);
    chunks.push(Buffer.from(base64, 'base64'));
  }
  report = await evaluate('window.__audioReport');
} finally {
  client?.close();
  chrome.kill();
}
// Empty/trimmed/instant tracks are valid authoring choices. Full-family coverage
// belongs in the production-fixture test, not an unconditional export constraint.
await mkdir(dirname(wavPath),{recursive:true}); await writeFile(wavPath,Buffer.concat(chunks));
const wavBytes=await readFile(wavPath);
const manifest:any={schema:'ultimate3-audio-export/v1',propsPath,mixPath,propsSha256:hash(propsBytes),mixSha256:hash(mixBytes),wavPath,wavSha256:hash(wavBytes),...report,clippingDisclosure:report.peak>1?`Requested mix peaks at ${report.peak}; float WAV is not normalized or clipped. Lossy delivery codecs may limit out-of-range samples.`:'Peak is within unity.'};
if(silentVideo&&outputVideo){
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames','-of','json',silentVideo],{encoding:'utf8'});
  if(probe.status!==0)throw new Error('ffprobe failed for silent video');
  const metadata=JSON.parse(probe.stdout);const video=metadata.streams?.find((stream:any)=>stream.codec_type==='video');
  if(metadata.streams?.some((stream:any)=>stream.codec_type==='audio')||video?.width!==1280||video?.height!==720||video?.r_frame_rate!=='30/1'||Number(video?.nb_frames)!==report.videoFrames||Math.abs(Number(metadata.format?.duration)-report.duration)>1/30)throw new Error('Silent video does not exactly match the generated soundtrack timeline');
  await mkdir(dirname(outputVideo),{recursive:true});const mux=spawnSync('ffmpeg',['-y','-i',silentVideo,'-i',wavPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-shortest',outputVideo],{stdio:'inherit'});if(mux.status!==0)throw new Error('ffmpeg mux failed');
  manifest.silentVideoPath=silentVideo;manifest.outputVideoPath=outputVideo;manifest.outputVideoSha256=hash(await readFile(outputVideo));
}
await mkdir(dirname(manifestPath),{recursive:true});await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(manifest,null,2));
