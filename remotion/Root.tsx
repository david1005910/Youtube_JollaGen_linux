import React from 'react';
import { Composition } from 'remotion';
import { StoryboardVideo } from './compositions/StoryboardVideo';
import type { RemotionVideoProps } from './types';

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="StoryboardVideo"
        component={StoryboardVideo as any}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          scenes: [],
          fps: 30,
          width: 1280,
          height: 720,
        }}
        calculateMetadata={({ props }: any) => {
          const p = props as RemotionVideoProps;
          const totalFrames = p.scenes?.reduce((sum, s) => sum + s.durationInFrames, 0) || 300;
          return {
            durationInFrames: totalFrames,
            fps: p.fps || 30,
            width: p.width || 1280,
            height: p.height || 720,
          };
        }}
      />
    </>
  );
}
