'use client';

import React, { useEffect, useRef } from 'react';
import { Player } from '@remotion/player';
import { AbsoluteFill, Video } from 'remotion';

interface VideoCompProps {
  src: string;
}

const VideoComposition: React.FC<VideoCompProps> = ({ src }) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <Video src={src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  </AbsoluteFill>
);

interface VideoPlayerModalProps {
  src: string;
  title?: string;
  durationSec?: number;
  onClose: () => void;
}

const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  src,
  title,
  durationSec = 5,
  onClose,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fps = 30;
  const durationInFrames = Math.round(durationSec * fps);

  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-full max-w-4xl mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-white font-bold text-sm truncate">
            {title ?? '영상 미리보기'}
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all"
            title="닫기 (ESC)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Remotion Player */}
        <div className="rounded-2xl overflow-hidden shadow-2xl border border-white/10">
          <Player
            component={VideoComposition}
            inputProps={{ src }}
            durationInFrames={durationInFrames}
            compositionWidth={1280}
            compositionHeight={720}
            fps={fps}
            controls
            loop
            style={{ width: '100%', aspectRatio: '16/9' }}
          />
        </div>

        <p className="text-center text-slate-500 text-xs mt-3">
          클릭 외부 영역 또는 ESC 키로 닫기
        </p>
      </div>
    </div>
  );
};

export default VideoPlayerModal;
