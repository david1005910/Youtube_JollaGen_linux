export interface RemotionSubtitle {
  text: string;
  startFrame: number;
  endFrame: number;
}

export interface RemotionScene {
  imageSrc: string;
  audioSrc: string;
  videoSrc?: string;
  durationInFrames: number;
  subtitles: RemotionSubtitle[];
}

export interface SubtitleStyle {
  fontSize: number;           // 20~80
  textColor: string;          // '#ffffff'
  bgColor: string;            // '#000000'
  bgOpacity: number;          // 0~1
  position: 'bottom' | 'center' | 'top';
  bold: boolean;
  shadow: boolean;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontSize: 36,
  textColor: '#ffffff',
  bgColor: '#000000',
  bgOpacity: 0.72,
  position: 'bottom',
  bold: true,
  shadow: true,
};

export interface RemotionVideoProps {
  scenes: RemotionScene[];
  fps: number;
  width: number;
  height: number;
  subtitleStyle?: SubtitleStyle;
}
