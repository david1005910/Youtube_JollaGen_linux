import React from 'react';
import {
  AbsoluteFill, Audio, Img, Video,
  useCurrentFrame, interpolate, Easing,
} from 'remotion';
import type { RemotionScene, RemotionSubtitle, SubtitleStyle } from '../types';
import { DEFAULT_SUBTITLE_STYLE } from '../types';

function SubtitleBox({
  subtitles, frame, style,
}: {
  subtitles: RemotionSubtitle[];
  frame: number;
  style: SubtitleStyle;
}) {
  const active = subtitles.find(s => frame >= s.startFrame && frame < s.endFrame);
  if (!active) return null;

  const posMap = { bottom: '48px', center: '50%', top: '48px' };
  const posStyle: React.CSSProperties =
    style.position === 'center'
      ? { top: '50%', transform: 'translate(-50%, -50%)' }
      : style.position === 'top'
      ? { top: posMap.top, left: '50%', transform: 'translateX(-50%)' }
      : { bottom: posMap.bottom, left: '50%', transform: 'translateX(-50%)' };

  const r = parseInt(style.bgColor.slice(1, 3), 16);
  const g = parseInt(style.bgColor.slice(3, 5), 16);
  const b = parseInt(style.bgColor.slice(5, 7), 16);

  return (
    <div style={{
      position: 'absolute',
      ...posStyle,
      background: `rgba(${r},${g},${b},${style.bgOpacity})`,
      color: style.textColor,
      fontSize: style.fontSize,
      fontWeight: style.bold ? 700 : 400,
      fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
      padding: '10px 28px',
      borderRadius: 8,
      maxWidth: '85%',
      textAlign: 'center',
      lineHeight: 1.4,
      letterSpacing: '-0.01em',
      whiteSpace: 'pre-wrap',
      textShadow: style.shadow ? '0 2px 6px rgba(0,0,0,0.9)' : 'none',
    }}>
      {active.text}
    </div>
  );
}

export function SceneComp({
  scene,
  subtitleStyle,
}: {
  scene: RemotionScene;
  subtitleStyle?: SubtitleStyle;
}) {
  const frame = useCurrentFrame();
  const style = subtitleStyle ?? DEFAULT_SUBTITLE_STYLE;

  const fadeIn = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.ease,
  });
  const fadeOut = interpolate(frame, [scene.durationInFrames - 9, scene.durationInFrames], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.ease,
  });
  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity }}>
        {scene.videoSrc ? (
          <Video src={scene.videoSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : scene.imageSrc ? (
          <Img src={scene.imageSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 48 }}>🖼</span>
          </div>
        )}
        {scene.subtitles.length > 0 && (
          <SubtitleBox subtitles={scene.subtitles} frame={frame} style={style} />
        )}
      </AbsoluteFill>
      {scene.audioSrc && <Audio src={scene.audioSrc} />}
    </AbsoluteFill>
  );
}
