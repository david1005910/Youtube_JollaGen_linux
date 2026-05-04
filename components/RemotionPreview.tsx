'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { StoryboardVideo } from '../remotion/compositions/StoryboardVideo';
import type { RemotionVideoProps, RemotionScene } from '../remotion/types';
import type { ScriptScene } from '../types';

const Player = dynamic(
  () => import('@remotion/player').then(m => m.Player),
  { ssr: false, loading: () => (
    <div style={{ width: '100%', aspectRatio: '16/9', background: '#111', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
      플레이어 로딩 중...
    </div>
  )}
);

export interface UploadedMedia {
  images: { src: string; name: string }[];
  video: { src: string; name: string } | null;
}

const FPS = 30;

function buildScenes(
  scenes: ScriptScene[],
  media: UploadedMedia,
  secPerScene: number
): RemotionScene[] {
  const framesPerScene = Math.round(secPerScene * FPS);

  if (media.video) {
    // 단일 영상 + 씬 나레이션을 자막으로 순서대로 표시
    const totalFrames = framesPerScene * Math.max(scenes.length, 1);
    return [{
      imageSrc: '',
      audioSrc: '',
      videoSrc: media.video.src,
      durationInFrames: totalFrames,
      subtitles: scenes.map((s, i) => ({
        text: s.narration,
        startFrame: i * framesPerScene,
        endFrame: Math.min((i + 1) * framesPerScene - 1, totalFrames - 1),
      })),
    }];
  }

  // 이미지별 씬 구성
  return scenes.map((scene, i) => ({
    imageSrc: media.images[i]?.src ?? '',
    audioSrc: '',
    videoSrc: undefined,
    durationInFrames: framesPerScene,
    subtitles: scene.narration ? [{
      text: scene.narration,
      startFrame: 0,
      endFrame: framesPerScene - 1,
    }] : [],
  }));
}

interface Props {
  scenes: ScriptScene[];
  media: UploadedMedia;
  secPerScene: number;
}

export function RemotionPreview({ scenes, media, secPerScene }: Props) {
  const videoProps = useMemo<RemotionVideoProps>(() => {
    const builtScenes = buildScenes(scenes, media, secPerScene);
    return { scenes: builtScenes, fps: FPS, width: 1280, height: 720 };
  }, [scenes, media, secPerScene]);

  const totalFrames = videoProps.scenes.reduce((s, sc) => s + sc.durationInFrames, 0);
  if (totalFrames === 0) return null;

  return (
    <Player
      component={StoryboardVideo as any}
      inputProps={videoProps}
      durationInFrames={totalFrames}
      compositionWidth={1280}
      compositionHeight={720}
      fps={FPS}
      style={{ width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden' }}
      controls
      autoPlay={false}
    />
  );
}
