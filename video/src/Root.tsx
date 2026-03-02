import { Composition } from "remotion";
import { LaminarVideo } from "./LaminarVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LaminarBrowserAgent"
      component={LaminarVideo}
      durationInFrames={720}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
