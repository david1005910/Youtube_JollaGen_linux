export interface RemotionSubtitle {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface RemotionScene {
  imageSrc: string;    // data:image/... or https://... URL
  audioSrc: string;    // data:audio/... or file path
  videoSrc?: string;   // animated video URL (overrides image)
  durationInFrames: number;
  subtitles: RemotionSubtitle[];
}

export interface RemotionVideoProps {
  scenes: RemotionScene[];
  fps: number;
  width: number;
  height: number;
}
