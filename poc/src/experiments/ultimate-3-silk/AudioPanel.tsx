import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {Ultimate3AudioProps} from '../micro-18/App';
import {normalizeSettings} from '../micro-18/settings';
import {SilkBuildClient,type SilkBuild} from './build-client';
import {SilkTransport} from './transport';
import {readSilkMix} from './edition';
import {canonical,DEFAULT_MIX_LABEL,mixIdentity,normalizeSilkMix,SILK_BUSES,SILK_MIX_STORAGE_ID,type SilkBus,type SilkMix} from './types';
import {mixSilkPCM} from './render';
import {encodeSilkWav} from './dsp';
import './styles.css';

type Download={url:string;name:string;sha256:string};
export function SilkAudioPanel({settings,globalTime,playing,inspecting}:Ultimate3AudioProps){
  const settingsKey=canonical(normalizeSettings(settings));
  const [mix,setMix]=useState(readSilkMix),mixKey=mixIdentity(mix);
  const [mixError,setMixError]=useState<string|null>(null);
  const [status,setStatus]=useState('Building current-settings PCM…');
  const [ready,setReady]=useState(false),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false);
  const [download,setDownload]=useState<Download|null>(null);
  const transport=useRef<SilkTransport|null>(null),client=useRef<SilkBuildClient|null>(null),build=useRef<SilkBuild|null>(null);
  const latest=useRef({globalTime,playing:playing&&!inspecting,mix});latest.current={globalTime,playing:playing&&!inspecting,mix};
  const generation=useRef(0),url=useRef<string|null>(null);
  const revoke=()=>{if(url.current)URL.revokeObjectURL(url.current);url.current=null;setDownload(null);};
  useLayoutEffect(()=>{
    transport.current=new SilkTransport();client.current=new SilkBuildClient();
    return()=>{generation.current++;transport.current?.dispose();client.current?.dispose();transport.current=null;client.current=null;build.current=null;if(url.current)URL.revokeObjectURL(url.current);url.current=null;};
  },[]);
  useLayoutEffect(()=>{
    const token=++generation.current;
    transport.current!.invalidate();client.current!.invalidate();build.current=null;setReady(false);setBusy(false);revoke();
    setStatus('Building current-settings PCM…');
    // Coalesce rapid authoring gestures; stale audio is already stopped above.
    const timer=setTimeout(()=>{void client.current!.build(settings).then(value=>{
      if(token!==generation.current)return;
      build.current=value;
      const current=latest.current;
      transport.current!.setMix(current.mix);transport.current!.update(current.globalTime,current.playing);transport.current!.setStems(value.stems);
      setMixError(transport.current!.headroomError);setReady(true);setStatus('PCM ready · current settings');
    }).catch(error=>{if(token===generation.current&&error.name!=='AbortError')setStatus(error.message);});},180);
    return()=>{clearTimeout(timer);client.current?.invalidate();transport.current?.invalidate();};
  },[settingsKey]);
  useLayoutEffect(()=>{transport.current?.update(globalTime,playing&&!inspecting);},[globalTime,playing,inspecting]);
  useLayoutEffect(()=>{transport.current?.setMix(mix);setMixError(transport.current?.headroomError??null);revoke();},[mixKey]);
  useEffect(()=>{try{localStorage.setItem(SILK_MIX_STORAGE_ID,JSON.stringify(mix));}catch{}},[mixKey]);
  const changeMix=(key:keyof SilkMix,value:number)=>setMix(old=>normalizeSilkMix({...old,[key]:value}));
  const toggle=async()=>{
    if(enabled){transport.current?.disable();setEnabled(false);return;}
    setEnabled(true);
    try{await transport.current?.enable();}catch(error){setEnabled(false);setStatus(`Audio unlock failed; retry Enable audio. ${String(error)}`);}
  };
  const prepare=async(kind:'current'|'sfx'|'project'|SilkBus)=>{
    const value=build.current;if(kind!=='project'&&(!value||value.plan.settingsKey!==settingsKey))return;
    const token=generation.current,key=mixKey;revoke();setBusy(true);
    try{
      // On demand only: never downmix/copy full PCM on transport ticks or slider changes.
      const bytes=kind==='project'?new TextEncoder().encode(JSON.stringify({settings:normalizeSettings(settings),mix},null,2)):
        encodeSilkWav(kind==='current'?mixSilkPCM(value!.stems,mix):kind==='sfx'?mixSilkPCM(value!.stems,{...mix,music:0}):value!.stems[kind]);
      const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>)),x=>x.toString(16).padStart(2,'0')).join('');
      if(token!==generation.current||key!==mixIdentity(latest.current.mix))return;
      const name=kind==='project'?'ultimate3-silk-project.json':`ultimate3-silk-${kind}.wav`;
      url.current=URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>],{type:kind==='project'?'application/json':'audio/wav'}));
      setDownload({url:url.current,name,sha256});
    }catch(error){setStatus(String(error));}finally{if(token===generation.current)setBusy(false);}
  };
  return <section className="silk-audio" aria-label="Silk audio" data-ready={ready} data-mix-valid={!mixError} data-enabled={enabled} data-playing={playing&&!inspecting}>
    <div><strong>{mix.music===0?DEFAULT_MIX_LABEL:'Silk SFX + Sangers PCM (music enabled)'}</strong> <button onClick={toggle}>{enabled?'Disable audio':'Enable audio'}</button></div>
    <output role="status">{status}</output>
    {mixError&&<p role="alert">{mixError} Playback is silenced; requested gains are preserved for correction.</p>}
    <details><summary>Silk mix & downloads</summary>
      <div className="silk-mix">{(['master',...SILK_BUSES] as const).map(key=><label key={key}>{key}<input aria-label={`Silk ${key} gain`} type="range" min="0" max="2" step=".01" value={mix[key]} onChange={event=>changeMix(key,Number(event.target.value))}/><output>{mix[key].toFixed(2)}</output></label>)}</div>
      <div className="silk-downloads"><button disabled={!ready||busy||!!mixError} onClick={()=>prepare('current')}>Prepare current mix WAV</button><button disabled={!ready||busy} onClick={()=>prepare('sfx')}>Prepare SFX-only WAV</button><button disabled={busy} onClick={()=>prepare('project')}>Prepare export project JSON</button>
      {SILK_BUSES.map(bus=><button key={bus} disabled={!ready||busy} onClick={()=>prepare(bus)}>Prepare {bus} stem</button>)}</div>
      {download&&<a href={download.url} download={download.name} data-sha256={download.sha256}>Save {download.name}</a>}
      <p>Prepared links expire on any settings/mix edit. Raw stems are pre-fader. Headroom uses the conservative sum of bus peaks, not measured mixed peak: non-overlapping/cancelling safe mixes can be rejected. Export project JSON, then run the settings-specific CLI, picture render and required final mux; see <a href="/ultimate-3-silk/EXPORT.md" target="_blank" rel="noreferrer">export steps</a>. Music uses the shared uncompressed PCM interpretation, not the legacy engine. <a href="/ultimate-3-silk/CREDITS.md" target="_blank" rel="noreferrer">Piano credits</a>.</p>
    </details>
  </section>;
}
