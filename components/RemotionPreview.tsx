'use client';

import React, { useMemo } from 'react';
import { Player } from '@remotion/player';
import { StoryboardVideo } from '../remotion/compositions/StoryboardVideo';
import { assetsToRemotionProps, totalDurationSec } from '../services/remotionService';
import type { GeneratedAsset } from '../types';

interface RemotionPreviewProps {
  assets: GeneratedAsset[];
  onClose: () => void;
}

const FPS = 30;
const W = 1280;
const H = 720;

const RemotionPreview: React.FC<RemotionPreviewProps> = ({ assets, onClose }) => {
  const inputProps = useMemo(() => assetsToRemotionProps(assets, { width: W, height: H }), [assets]);

  const totalFrames = useMemo(
    () => inputProps.scenes.reduce((s, c) => s + c.durationInFrames, 0) || FPS * 4,
    [inputProps]
  );

  const durationSec = (totalFrames / FPS).toFixed(1);
  const sceneCount = inputProps.scenes.length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(9,11,26,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#00F0FF',
          }}>
            Remotion Player
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 12 }}>
            {sceneCount}개 씬 · {durationSec}초 · {W}×{H} · {FPS}fps
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,79,190,0.12)', border: '1px solid rgba(255,79,190,0.35)',
            color: '#FF4FBE', borderRadius: 8, padding: '6px 16px',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.06em',
          }}
        >
          닫기
        </button>
      </div>

      {sceneCount === 0 ? (
        <div style={{
          width: '100%', maxWidth: 900, aspectRatio: '16/9',
          background: 'rgba(14,11,44,0.6)', border: '1px solid rgba(0,240,255,0.2)',
          borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: 600,
        }}>
          완료된 씬이 없습니다. 먼저 이미지와 오디오를 생성해주세요.
        </div>
      ) : (
        <div style={{
          width: '100%', maxWidth: 900,
          border: '1px solid rgba(0,240,255,0.25)', borderRadius: 12, overflow: 'hidden',
          boxShadow: '0 0 40px rgba(0,240,255,0.08)',
        }}>
          <Player
            component={StoryboardVideo as any}
            inputProps={inputProps as any}
            durationInFrames={totalFrames}
            compositionWidth={W}
            compositionHeight={H}
            fps={FPS}
            style={{ width: '100%' }}
            controls
            autoPlay={false}
            loop={false}
            clickToPlay
            showVolumeControls
          />
        </div>
      )}

      {/* Info */}
      <div style={{
        marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.3)',
        textAlign: 'center', lineHeight: 1.8,
      }}>
        클릭하여 재생 · 스페이스바로 일시정지 · 배경 클릭으로 닫기
      </div>
    </div>
  );
};

export default RemotionPreview;
