import {DialRoot, DialTimeline, useDialKit, useDialTimeline} from 'dialkit';
import {ExperimentPicker} from '../ExperimentPicker';
import {Micro05Scene} from './Scene';
import {MICRO_05_TIMELINE, MICRO_05_TIMELINE_ID} from './timeline';

export const Micro05App = () => {
  const timeline = useDialTimeline('Micro animation 05 — Master (seconds)', MICRO_05_TIMELINE, {
    id: MICRO_05_TIMELINE_ID,
    autoplay: false,
    loop: true,
    persist: true,
  });
  const grid = useDialKit('Heerich grid', {
    tileCount: [31, 11, 153, 2],
    tileSize: [74, 20, 120, 1],
    gridScale: [160, 100, 300, 1],
    cameraAngle: [45, 0, 360, 1],
    backDarken: [50, 0, 100, 1],
    borderWidth: [2, 0.25, 4, 0.25],
    defaultTileColor: {type: 'color' as const, default: '#2e2e2e'},
    borderColor: {type: 'color' as const, default: '#171717'},
    shaftLength: [30, 0, 60, 1],
    shaftOpacity: [0.32, 0, 1, 0.01],
  }, {id: 'micro-animation-05-grid-v6', persist: true});
  const wave = useDialKit('Activation wave', {
    gaussianStdDev: [3.5, 0.25, 12, 0.1],
    colorFadeTrail: [8, 0, 30, 0.25],
    height: [1.5, 0, 4, 0.05],
    seed: [404, 0, 9999, 1],
    color: {type: 'color' as const, default: '#da875f'},
  }, {id: 'micro-animation-05-wave-v4', persist: true});
  const clusters = useDialKit('Seeded clusters', {
    centerSpread: [7, 1, 20, 0.25],
    minimumHeight: [0.5, 0, 20, 0.05],
    maximumHeight: [3, 0, 20, 0.05],
    cluster1Probability: [0.22, 0, 1, 0.01],
    cluster1Seed: [101, 0, 9999, 1],
    cluster1Color: {type: 'color' as const, default: '#7c6ee6'},
    cluster2Probability: [0.18, 0, 1, 0.01],
    cluster2Seed: [202, 0, 9999, 1],
    cluster2Color: {type: 'color' as const, default: '#61b8a8'},
    cluster3Probability: [0.14, 0, 1, 0.01],
    cluster3Seed: [303, 0, 9999, 1],
    cluster3Color: {type: 'color' as const, default: '#da875f'},
  }, {id: 'micro-animation-05-clusters-v2', persist: true});

  return (
    <main className="micro05-app">
      <div className="micro05-stage">
        <Micro05Scene
          tileCount={grid.tileCount}
          tileSize={grid.tileSize}
          gridScale={grid.gridScale}
          cameraAngle={grid.cameraAngle}
          backDarken={grid.backDarken}
          borderWidth={grid.borderWidth}
          defaultTileColor={grid.defaultTileColor}
          borderColor={grid.borderColor}
          shaftLength={grid.shaftLength}
          shaftOpacity={grid.shaftOpacity}
          waveProgress={timeline.wave.current.progress}
          waveWidth={wave.gaussianStdDev}
          colorFadeTrail={wave.colorFadeTrail}
          activationHeight={wave.height}
          activationColor={wave.color}
          seed={wave.seed}
          clusterProgress={[
            timeline.cluster1.current.progress,
            timeline.cluster2.current.progress,
            timeline.cluster3.current.progress,
          ]}
          clusterProbability={[clusters.cluster1Probability, clusters.cluster2Probability, clusters.cluster3Probability]}
          clusterMinimumHeight={clusters.minimumHeight}
          clusterMaximumHeight={clusters.maximumHeight}
          clusterColor={[clusters.cluster1Color, clusters.cluster2Color, clusters.cluster3Color]}
          clusterSeed={[clusters.cluster1Seed, clusters.cluster2Seed, clusters.cluster3Seed]}
          clusterSpread={clusters.centerSpread}
        />
      </div>
      <ExperimentPicker current="micro-05" />
      <DialRoot />
      <DialTimeline />
    </main>
  );
};
