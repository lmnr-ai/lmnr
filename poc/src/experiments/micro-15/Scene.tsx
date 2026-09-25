import {useEffect, useState} from 'react';
import {cancelRender, continueRender, delayRender, staticFile} from 'remotion';
import {Micro14Scene} from '../micro-14/Scene';
import {AgentWindow} from './AgentWindow';
import type {Micro15Sample} from './sample';
import {Subtitles} from './Subtitles';

let agentAssets: Promise<void> | undefined;
function loadAgentAssets() {
  if (!agentAssets) {
    const icon = new Image();
    icon.src = staticFile('micro-15/issue-warning.svg');
    const font = new FontFace('Micro15AgentMono', `url("${staticFile('micro-06/JetBrainsMono-Regular.woff2')}")`);
    agentAssets = Promise.all([icon.decode(), font.load().then(loaded => {document.fonts.add(loaded);})]).then(() => undefined);
  }
  return agentAssets;
}

export const Micro15Scene = (sample: Micro15Sample) => {
  const [fontHandle] = useState(() => delayRender('Load coding-agent font and warning'));
  useEffect(() => {
    loadAgentAssets().then(() => continueRender(fontHandle)).catch(error => cancelRender(error));
  }, [fontHandle]);
  return <div className="micro15-composition">
    <Micro14Scene {...sample} clusterBackground="#1A1A1A"/>
    <AgentWindow sample={sample.agent}/>
    <Subtitles progress={sample.subtitles}/>
  </div>;
};
