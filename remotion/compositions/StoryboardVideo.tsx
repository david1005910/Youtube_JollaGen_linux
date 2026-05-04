import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { SceneComp } from './SceneComp';
import type { RemotionVideoProps } from '../types';

export function StoryboardVideo({ scenes, subtitleStyle }: RemotionVideoProps) {
  const { fps } = useVideoConfig();
  void fps;

  let offset = 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {scenes.map((scene, i) => {
        const from = offset;
        offset += scene.durationInFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
            <SceneComp scene={scene} subtitleStyle={subtitleStyle} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
