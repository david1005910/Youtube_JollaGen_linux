import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Video,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import type { RemotionScene, RemotionSubtitle } from '../types';

function SubtitleBox({ subtitles, frame }: { subtitles: RemotionSubtitle[]; frame: number }) {
  const active = subtitles.find(s => frame >= s.startFrame && frame < s.endFrame);
  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        fontSize: 36,
        fontWeight: 700,
        fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
        padding: '10px 28px',
        borderRadius: 8,
        maxWidth: '85%',
        textAlign: 'center',
        lineHeight: 1.4,
        letterSpacing: '-0.01em',
        whiteSpace: 'pre-wrap',
        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
      }}
    >
      {active.text}
    </div>
  );
}

export function SceneComp({ scene }: { scene: RemotionScene }) {
  const frame = useCurrentFrame();

  // 페이드인 0→1 (처음 0.3초)
  const fadeIn = interpolate(frame, [0, 9], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.ease,
  });

  // 페이드아웃 1→0 (마지막 0.3초)
  const fadeOut = interpolate(
    frame,
    [scene.durationInFrames - 9, scene.durationInFrames],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.ease,
    }
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity }}>
        {/* 씬 미디어: 애니메이션 영상 또는 이미지 */}
        {scene.videoSrc ? (
          <Video
            src={scene.videoSrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : scene.imageSrc ? (
          <Img
            src={scene.imageSrc}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}

        {/* 자막 오버레이 */}
        {scene.subtitles.length > 0 && (
          <SubtitleBox subtitles={scene.subtitles} frame={frame} />
        )}
      </AbsoluteFill>

      {/* 오디오 — 씬 시작 시 함께 재생 */}
      {scene.audioSrc && (
        <Audio src={scene.audioSrc} />
      )}
    </AbsoluteFill>
  );
}
